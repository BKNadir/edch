//! HTTP for the UI: requests to a short list of allowed hosts (Spansh, EDDN, EDSM, Inara, ntfy),
//! made from Rust because the webview can't reach them (CORS). URLs are redacted in the logs.

use serde::Serialize;
use std::time::{Duration, Instant};

use crate::logs;

#[derive(Serialize)]
pub struct HttpReply {
    pub status: u16,
    body: String,
}

/// Hosts the UI may talk to. Everything else is refused.
const ALLOWED_HOSTS: [&str; 8] = [
    "https://ntfy.sh/",
    "https://spansh.co.uk/",
    "https://www.spansh.co.uk/",
    "https://eddn.edcd.io:4430/",
    "https://www.edsm.net/",
    "https://inara.cz/",
    "https://edsm.net/",
    "https://tick.edcd.io/",
];

/// Redirects followed at most, each one checked against the allowed hosts.
const MAX_REDIRECTS: u8 = 5;

/// Answers larger than this are refused: every service EDCH talks to answers far less.
const MAX_REPLY_BYTES: u64 = 32 * 1024 * 1024;

/// Whether `url` goes to one of the allowed hosts (the host part is compared whole, with the
/// trailing slash, so "https://inara.cz.example.com/" doesn't pass).
fn allowed(url: &str) -> bool {
    ALLOWED_HOSTS.iter().any(|host| url.starts_with(host))
}

/// The address a redirect points to: absolute ("https://…"), or a path on the same host ("/…").
/// Anything else (another scheme, "//host", a relative path) is refused.
fn redirect_target(from: &str, location: &str) -> Option<String> {
    let location = location.trim();
    if location.starts_with("https://") {
        return Some(location.to_string());
    }
    if location.starts_with('/') && !location.starts_with("//") {
        let after_scheme = from.strip_prefix("https://")?;
        let host_end = after_scheme.find('/').unwrap_or(after_scheme.len());
        return Some(format!("https://{}{location}", &after_scheme[..host_end]));
    }
    None
}

/// The body of an answer, up to MAX_REPLY_BYTES.
fn read_reply(response: ureq::Response) -> Result<String, String> {
    use std::io::Read as _;
    let mut bytes = Vec::new();
    response
        .into_reader()
        .take(MAX_REPLY_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| format!("network: {}", e.kind()))?;
    if bytes.len() as u64 > MAX_REPLY_BYTES {
        return Err("replyTooLarge".into());
    }
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

/// One HTTP request to an allowed host. Non-2xx answers are returned, not errors,
/// so the caller can apply each service's retry rules (EDDN forbids retrying a 400).
///
/// Redirects are followed here rather than by the HTTP client, so that each new address is
/// checked against the allowed hosts too. Errors never repeat the address (it can hold a key).
pub fn blocking_http(
    method: &str,
    url: &str,
    body: Option<&str>,
    content_type: Option<&str>,
) -> Result<HttpReply, String> {
    request(method, url, body, content_type, None, &allowed)
}

/// The request itself: `allow` says which addresses (the first and every redirect) may be
/// reached; `authorization` is sent as is (the Discord bot's key, never logged).
pub fn request(
    method: &str,
    url: &str,
    body: Option<&str>,
    content_type: Option<&str>,
    authorization: Option<&str>,
    allow: &dyn Fn(&str) -> bool,
) -> Result<HttpReply, String> {
    if !allow(url) {
        return Err("addressRefused".into());
    }
    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(30))
        .redirects(0)
        .user_agent(concat!("EDCH/", env!("CARGO_PKG_VERSION")))
        .build();
    let mut method = method.to_uppercase();
    let mut body = body;
    let mut url = url.to_string();
    for _ in 0..=MAX_REDIRECTS {
        let mut request = agent.request(&method, &url);
        if let Some(value) = authorization {
            request = request.set("Authorization", value);
        }
        let result = match body {
            Some(text) => request
                .set("Content-Type", content_type.unwrap_or("application/json"))
                .send_string(text),
            None => request.call(),
        };
        let response = match result {
            Ok(response) => response,
            Err(ureq::Error::Status(status, response)) => {
                return Ok(HttpReply {
                    status,
                    body: read_reply(response).unwrap_or_default(),
                })
            }
            Err(ureq::Error::Transport(error)) => return Err(format!("network: {}", error.kind())),
        };
        let status = response.status();
        if !(300..400).contains(&status) {
            return Ok(HttpReply {
                status,
                body: read_reply(response)?,
            });
        }
        let next = response
            .header("Location")
            .and_then(|location| redirect_target(&url, location))
            .filter(|next| allow(next))
            .ok_or_else(|| "addressRefused".to_string())?;
        // As browsers do: 301/302/303 go on with a GET without the body; 307/308 repeat the request.
        if matches!(status, 301..=303) {
            method = "GET".into();
            body = None;
        }
        url = next;
    }
    Err("tooManyRedirects".into())
}

/// Generic HTTP for the UI (no CORS from Rust).
#[tauri::command]
pub async fn http_fetch(
    method: String,
    url: String,
    body: Option<String>,
    content_type: Option<String>,
) -> Result<HttpReply, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let started = Instant::now();
        let result = blocking_http(&method, &url, body.as_deref(), content_type.as_deref());
        let ms = started.elapsed().as_millis();
        match &result {
            Ok(reply) if reply.status < 400 => logs::debug(
                "http",
                &format!("{method} {} → {} ({ms} ms)", logs::redact(&url), reply.status),
            ),
            Ok(reply) => logs::warn(
                "http",
                &format!(
                    "{method} {} → {} ({ms} ms) {}",
                    logs::redact(&url),
                    reply.status,
                    reply.body.chars().take(200).collect::<String>()
                ),
            ),
            Err(e) => logs::warn("http", &format!("{method} {} → {e} ({ms} ms)", logs::redact(&url))),
        }
        result
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::{allowed, redirect_target};

    #[test]
    fn only_allowed_hosts() {
        assert!(allowed("https://spansh.co.uk/api/systems/search"));
        assert!(allowed("https://tick.edcd.io/api/tick"));
        assert!(!allowed("https://edcd.io/"));
        assert!(!allowed("https://spansh.co.uk.example.com/api"));
        assert!(!allowed("http://spansh.co.uk/api"));
        assert!(!allowed("https://example.com/?https://spansh.co.uk/"));
    }

    #[test]
    fn redirects_are_checked() {
        let from = "https://www.edsm.net/api-v1/system?x=1";
        assert_eq!(
            redirect_target(from, "/api-v1/other").as_deref(),
            Some("https://www.edsm.net/api-v1/other")
        );
        assert_eq!(
            redirect_target(from, "https://evil.example/x").as_deref(),
            Some("https://evil.example/x")
        );
        assert!(!allowed(&redirect_target(from, "https://evil.example/x").unwrap()));
        assert_eq!(redirect_target(from, "//evil.example/x"), None);
        assert_eq!(redirect_target(from, "http://www.edsm.net/x"), None);
        assert_eq!(redirect_target(from, "file:///etc/passwd"), None);
    }
}

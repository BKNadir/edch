//! EDCH-Discord, the squadron BGS bot (its own repository): EDCH sends a member's BGS reports to
//! it with the key `/bgs link` gave them. Only two addresses can be reached: the shared bot's,
//! and one other bot a user confirmed (a squadron's own copy, its address being in the key).
//! Only three paths, `/v1/config`, `/v1/report` and `/v1/systems` (what the squadron's members
//! saw, to show in the BGS page); the key goes in the Authorization header and
//! is never written to the logs. Kept apart from the general HTTP command, which the phone can
//! reach: this one can't be.

use std::sync::Mutex;

use crate::http::{request, HttpReply};
use crate::logs;

/// The shared bot (EDCH-Discord hosted for every squadron).
pub const SHARED_BOT: &str = "https://edch-discord.default-community.workers.dev";

/// The address of a squadron's own copy, once the user confirmed it (set by the page at start-up
/// from the settings, and when the user accepts a key naming another bot).
static TRUSTED_BOT: Mutex<Option<String>> = Mutex::new(None);

const PATHS: [&str; 3] = ["/v1/config", "/v1/report", "/v1/systems"];
const MAX_KEY_LEN: usize = 2000;
const MAX_REPORT_BYTES: usize = 512 * 1024;

/// "https://host" or "https://host:port": no path, no user, no query; letters, digits, dots,
/// dashes in the host.
fn valid_origin(origin: &str) -> bool {
    let Some(rest) = origin.strip_prefix("https://") else {
        return false;
    };
    let (host, port) = match rest.split_once(':') {
        Some((host, port)) => (host, Some(port)),
        None => (rest, None),
    };
    !host.is_empty()
        && host.len() <= 253
        && host.contains('.')
        && host.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-')
        && port.is_none_or(|p| !p.is_empty() && p.len() <= 5 && p.chars().all(|c| c.is_ascii_digit()))
}

fn reachable(origin: &str) -> bool {
    origin == SHARED_BOT
        || TRUSTED_BOT
            .lock()
            .map(|t| t.as_deref() == Some(origin))
            .unwrap_or(false)
}

/// Sets (or clears, with None) the squadron's own bot the user confirmed.
#[tauri::command]
pub fn trust_bot(origin: Option<String>) -> Result<(), String> {
    let origin = match origin {
        Some(o) if valid_origin(&o) => Some(o),
        Some(_) => return Err("addressRefused".into()),
        None => None,
    };
    if let Ok(mut trusted) = TRUSTED_BOT.lock() {
        *trusted = origin;
    }
    Ok(())
}

/// One call to the bot: GET /v1/config or /v1/systems, or POST /v1/report with a report.
#[tauri::command]
pub async fn bot_fetch(origin: String, path: String, key: String, body: Option<String>) -> Result<HttpReply, String> {
    if !valid_origin(&origin) || !reachable(&origin) || !PATHS.contains(&path.as_str()) {
        return Err("addressRefused".into());
    }
    if !key.starts_with("edch1.") || key.len() > MAX_KEY_LEN || key.chars().any(|c| c.is_control() || c == ' ') {
        return Err("badKey".into());
    }
    if body.as_ref().is_some_and(|b| b.len() > MAX_REPORT_BYTES) {
        return Err("replyTooLarge".into());
    }
    let method = if body.is_some() { "POST" } else { "GET" };
    tauri::async_runtime::spawn_blocking(move || {
        let allow = |url: &str| url == format!("{origin}{path}");
        let authorization = format!("Bearer {key}");
        let result = request(
            method,
            &format!("{origin}{path}"),
            body.as_deref(),
            None,
            Some(&authorization),
            &allow,
        );
        // Only the path and the status: the key and the report stay out of the logs.
        match &result {
            Ok(reply) => logs::info("discord", &format!("{method} {path} → {}", reply.status)),
            Err(e) => logs::warn("discord", &format!("{method} {path} → {e}")),
        }
        result
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_plain_https_origins() {
        assert!(valid_origin("https://edch-discord.example.workers.dev"));
        assert!(valid_origin("https://bot.example.org:8443"));
        assert!(!valid_origin("http://bot.example.org"));
        assert!(!valid_origin("https://bot.example.org/v1"));
        assert!(!valid_origin("https://user@bot.example.org"));
        assert!(!valid_origin("https://localhost"));
        assert!(!valid_origin("https://bot.example.org:"));
        assert!(!valid_origin("https://bot.example.org?x=1"));
    }

    #[test]
    fn only_the_shared_bot_and_the_confirmed_one() {
        assert!(reachable(SHARED_BOT));
        assert!(!reachable("https://other.example.org"));
        trust_bot(Some("https://other.example.org".into())).unwrap();
        assert!(reachable("https://other.example.org"));
        assert!(trust_bot(Some("http://plain.example.org".into())).is_err());
        trust_bot(None).unwrap();
        assert!(!reachable("https://other.example.org"));
    }
}

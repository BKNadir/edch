//! EDCN (Elite Dangerous Companion Network, its own private repository): the maintainer's EDDN
//! collector, whose API gives the most recent markets and factions EDDN carried. Only its address
//! can be reached, only to read (GET) under `/api/v1/`; the user's key goes in the Authorization
//! header and is never written to the logs. Kept apart from the general HTTP command, which the
//! phone can reach: this one can't be.

use crate::http::{request, HttpReply};
use crate::logs;

/// EDCN's address.
pub const EDCN: &str = "https://edcn.koinkoin.duckdns.org";

const MAX_KEY_LEN: usize = 200;
const MAX_PATH_LEN: usize = 2000;

/// "/api/v1/…" with only the characters a query needs (no "..", no other host).
fn valid_path(path: &str) -> bool {
    path.starts_with("/api/v1/")
        && path.len() <= MAX_PATH_LEN
        && !path.contains("..")
        && !path.contains("//")
        && path
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "/?&=%-_.,+~".contains(c))
}

/// A key as EDCN makes them: letters and digits only.
fn valid_key(key: &str) -> bool {
    !key.is_empty() && key.len() <= MAX_KEY_LEN && key.chars().all(|c| c.is_ascii_alphanumeric())
}

/// One read from EDCN; an HTTP status is returned, not an error.
#[tauri::command]
pub async fn edcn_get(path: String, key: String) -> Result<HttpReply, String> {
    if !valid_path(&path) {
        return Err("addressRefused".into());
    }
    if !valid_key(&key) {
        return Err("badKey".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let url = format!("{EDCN}{path}");
        let allow = |address: &str| address == url;
        let authorization = format!("Bearer {key}");
        let result = request("GET", &url, None, None, Some(&authorization), &allow);
        // Only the path's start and the status: the key stays out of the logs.
        let route = path.split('?').next().unwrap_or("");
        match &result {
            Ok(reply) => logs::debug("edcn", &format!("GET {route} → {}", reply.status)),
            Err(e) => logs::warn("edcn", &format!("GET {route} → {e}")),
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
    fn only_api_reads() {
        assert!(valid_path(
            "/api/v1/offers?commodity=tritium&mode=sell&x=1.5&y=-2&z=3&range=50"
        ));
        assert!(valid_path("/api/v1/system?name=Synuefe%20UW-I%20a91-4"));
        assert!(!valid_path("/healthz"));
        assert!(!valid_path("/api/v1/../status.json"));
        assert!(!valid_path("/api/v1//evil.example"));
        assert!(!valid_path("/api/v1/system?name=a b"));
        assert!(!valid_path("https://evil.example/api/v1/status"));
    }

    #[test]
    fn keys_are_letters_and_digits() {
        assert!(valid_key("a1b2c3"));
        assert!(!valid_key(""));
        assert!(!valid_key("abc def"));
        assert!(!valid_key("abc\r\nX-Other: 1"));
    }
}

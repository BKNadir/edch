//! EDCN (Elite Dangerous Companion Network, its own private repository): the maintainer's EDDN
//! collector, whose API gives the most recent markets and factions EDDN carried. Only its address
//! can be reached, only to read (GET) under `/api/v1/`. Every call says it comes from EDCH: the
//! identifier and fingerprint EDCN gave EDCH (its panel's Applications tab), the same in every
//! copy. Anyone reading EDCH can find them: they tell EDCN which application calls, so it can be
//! counted or blocked, not who. Kept apart from the general HTTP command, which the phone can
//! reach: this one can't be.

use crate::http::{request, HttpReply};
use crate::logs;

/// EDCN's address.
pub const EDCN: &str = "https://edcn.koinkoin.duckdns.org";

/// EDCH in EDCN's list of applications: its identifier and fingerprint (made by EDCN; a new one
/// made on EDCN's panel goes here too).
const APPLICATION: &str = "edch";
const FINGERPRINT: &str = "72ac078e2ca36791f42eae5051862f7e";

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

/// One read from EDCN; an HTTP status is returned, not an error.
#[tauri::command]
pub async fn edcn_get(path: String) -> Result<HttpReply, String> {
    if !valid_path(&path) {
        return Err("addressRefused".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let url = format!("{EDCN}{path}");
        let allow = |address: &str| address == url;
        let headers = [("X-EDCN-App", APPLICATION), ("X-EDCN-Fingerprint", FINGERPRINT)];
        let result = request("GET", &url, None, None, &headers, &allow);
        // Only the path's start and the status: what was searched stays out of the logs.
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
}

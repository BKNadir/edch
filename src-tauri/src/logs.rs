//! Application logs, in %LOCALAPPDATA%\EDCompanionHelper\logs.
//!
//! - Standard log (`edch_<start time>.log`): always written, one file per start. Info,
//!   warnings and errors.
//! - Error log (`edch-error_<start time>.log`): warnings and errors only, created at the first
//!   one (a run without problems leaves no error log). They are in the standard log too.
//! - Debug log (`edch-debug_<start time>.log`): only while debug mode is on in Settings.
//!   It repeats every standard line (so every warning and error) plus the detailed ones, so
//!   it can be read alone.
//!
//! At start-up, log files older than a week are deleted, but the 5 most recent of each
//! kind are always kept.

use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const KEEP_DAYS: u64 = 7;
const KEEP_FILES: usize = 5;
const STANDARD: &str = "edch_";
const DEBUG: &str = "edch-debug_";
const ERRORS: &str = "edch-error_";

struct Logger {
    dir: PathBuf,
    stamp: String,
    standard: Mutex<Option<File>>,
    /// Opened at the first warning or error.
    errors: Mutex<Option<File>>,
    debug: Mutex<Option<File>>,
    debug_on: AtomicBool,
}

static LOGGER: OnceLock<Logger> = OnceLock::new();

pub fn dir() -> PathBuf {
    if let Ok(base) = std::env::var("LOCALAPPDATA") {
        return PathBuf::from(base).join("EDCompanionHelper").join("logs");
    }
    let home = std::env::var("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| std::env::temp_dir());
    if cfg!(target_os = "macos") {
        return home.join("Library").join("Logs").join("EDCompanionHelper");
    }
    // Linux: $XDG_DATA_HOME (usually ~/.local/share).
    let data = std::env::var("XDG_DATA_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| home.join(".local").join("share"));
    data.join("EDCompanionHelper").join("logs")
}

/// UTC date and time from a Unix timestamp (no date crate needed).
fn civil(secs: u64) -> (i64, u32, u32, u32, u32, u32) {
    let days = (secs / 86_400) as i64;
    let rem = secs % 86_400;
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let y = yoe + era * 400 + if m <= 2 { 1 } else { 0 };
    (
        y,
        m,
        d,
        (rem / 3600) as u32,
        ((rem % 3600) / 60) as u32,
        (rem % 60) as u32,
    )
}

fn now() -> Duration {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default()
}

fn file_stamp() -> String {
    let (y, m, d, h, mi, s) = civil(now().as_secs());
    format!("{y:04}-{m:02}-{d:02}_{h:02}-{mi:02}-{s:02}")
}

fn line_stamp() -> String {
    let t = now();
    let (y, m, d, h, mi, s) = civil(t.as_secs());
    format!("{y:04}-{m:02}-{d:02} {h:02}:{mi:02}:{s:02}.{:03}Z", t.subsec_millis())
}

/// Deletes logs of one kind older than a week, always keeping the newest few.
fn cleanup(dir: &PathBuf, prefix: &str) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    let mut files: Vec<(PathBuf, SystemTime)> = entries
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            if !name.starts_with(prefix) || !name.ends_with(".log") {
                return None;
            }
            let modified = e.metadata().ok()?.modified().ok()?;
            Some((e.path(), modified))
        })
        .collect();
    // Newest first.
    files.sort_by_key(|f| std::cmp::Reverse(f.1));
    let limit = Duration::from_secs(KEEP_DAYS * 86_400);
    // The file of the run that is starting counts as one of the kept ones.
    for (path, modified) in files.into_iter().skip(KEEP_FILES - 1) {
        if SystemTime::now().duration_since(modified).unwrap_or_default() > limit {
            let _ = fs::remove_file(path);
        }
    }
}

fn open(path: &PathBuf) -> Option<File> {
    OpenOptions::new().create(true).append(true).open(path).ok()
}

/// Creates the standard log of this run and cleans the old ones. Called once at start-up.
pub fn init(portable: bool) {
    let dir = dir();
    let _ = fs::create_dir_all(&dir);
    cleanup(&dir, STANDARD);
    cleanup(&dir, DEBUG);
    cleanup(&dir, ERRORS);
    let stamp = file_stamp();
    let standard = open(&dir.join(format!("{STANDARD}{stamp}.log")));
    let _ = LOGGER.set(Logger {
        dir,
        stamp,
        standard: Mutex::new(standard),
        errors: Mutex::new(None),
        debug: Mutex::new(None),
        debug_on: AtomicBool::new(false),
    });
    write(
        "INFO",
        "app",
        &format!(
            "EDCH {} ({}, {} {})",
            env!("CARGO_PKG_VERSION"),
            if portable { "portable" } else { "installed" },
            std::env::consts::OS,
            std::env::consts::ARCH,
        ),
    );
    std::panic::set_hook(Box::new(|info| {
        write("ERROR", "panic", &info.to_string());
    }));
}

/// One log line. DEBUG lines only go to the debug log; the others go to both.
pub fn write(level: &str, source: &str, message: &str) {
    let Some(l) = LOGGER.get() else { return };
    let level = level.to_uppercase();
    let text = format!(
        "{} [{:<5}] {}: {}\n",
        line_stamp(),
        level,
        source,
        sanitize(&message.replace('\n', " ⏎ "))
    );
    if level != "DEBUG" {
        if let Ok(mut f) = l.standard.lock() {
            if let Some(f) = f.as_mut() {
                let _ = f.write_all(text.as_bytes());
            }
        }
    }
    if level == "WARN" || level == "ERROR" {
        if let Ok(mut f) = l.errors.lock() {
            if f.is_none() {
                *f = open(&l.dir.join(format!("{ERRORS}{}.log", l.stamp)));
            }
            if let Some(f) = f.as_mut() {
                let _ = f.write_all(text.as_bytes());
            }
        }
    }
    if l.debug_on.load(Ordering::Relaxed) {
        if let Ok(mut f) = l.debug.lock() {
            if let Some(f) = f.as_mut() {
                let _ = f.write_all(text.as_bytes());
            }
        }
    }
}

pub fn info(source: &str, message: &str) {
    write("INFO", source, message);
}
pub fn warn(source: &str, message: &str) {
    write("WARN", source, message);
}
/// Part of the logging API (not used by the backend today).
#[allow(dead_code)]
pub fn error(source: &str, message: &str) {
    write("ERROR", source, message);
}
pub fn debug(source: &str, message: &str) {
    if debug_enabled() {
        write("DEBUG", source, message);
    }
}
pub fn debug_enabled() -> bool {
    LOGGER.get().is_some_and(|l| l.debug_on.load(Ordering::Relaxed))
}

/// Removes private information from every log line, whatever wrote it, so a log can be
/// attached to a public bug report:
/// - the Windows user folder and user name (`C:\Users\name\…` → `%USERPROFILE%\…`);
/// - IP addresses (local network, Tailscale, the phone's): `192.168.x.x`, `fd7a:…`;
/// - long hexadecimal or random-looking tokens (pairing code, wing topic, keys): `***`;
/// - Frontier ids (`F12345678`): `F***`.
///
/// API keys never reach a log in the first place (URLs go through `redact`, bodies aren't logged).
pub fn sanitize(text: &str) -> String {
    let mut out = text.to_string();
    // User folder first (longest), then the bare user name.
    let mut homes: Vec<String> = ["USERPROFILE", "HOME"]
        .iter()
        .filter_map(|v| std::env::var(v).ok())
        .filter(|h| h.len() > 3)
        .collect();
    homes.sort_by_key(|h| std::cmp::Reverse(h.len()));
    for home in homes {
        out = replace_ci(&out, &home, "%USERPROFILE%");
        out = replace_ci(&out, &home.replace('\\', "/"), "%USERPROFILE%");
    }
    if let Ok(user) = std::env::var("USERNAME").or_else(|_| std::env::var("USER")) {
        if user.len() >= 3 {
            out = replace_ci(&out, &format!("\\{user}\\"), "\\%USERNAME%\\");
            out = replace_ci(&out, &format!("/{user}/"), "/%USERNAME%/");
        }
    }
    mask_tokens(&mask_ipv6(&out))
}

/// Masks IPv6 addresses (a phone or Tailscale address), keeping only the first group: the kind
/// of address ("fe80" local, "fd7a" Tailscale…) is useful, the address isn't. Times ("15:38:19")
/// and MAC addresses aren't IPv6 addresses and stay as they are.
fn mask_ipv6(text: &str) -> String {
    let in_word = |c: char| c.is_ascii_alphanumeric() || c == ':' || c == '.' || c == '%';
    let mut out = String::with_capacity(text.len());
    let mut word = String::new();
    let flush = |word: &mut String, out: &mut String| {
        // A sentence's full stop and a zone ("%eth0") aren't part of the address.
        let without_stop = word.trim_end_matches('.');
        let address = without_stop.split('%').next().unwrap_or(without_stop);
        if address.contains(':') && address.parse::<std::net::Ipv6Addr>().is_ok() {
            out.push_str(address.split(':').next().unwrap_or(""));
            out.push_str(":…");
            out.push_str(&word[without_stop.len()..]);
        } else {
            out.push_str(word);
        }
        word.clear();
    };
    for c in text.chars() {
        if in_word(c) {
            word.push(c);
        } else {
            flush(&mut word, &mut out);
            out.push(c);
        }
    }
    flush(&mut word, &mut out);
    out
}

fn replace_ci(text: &str, needle: &str, with: &str) -> String {
    if needle.is_empty() {
        return text.to_string();
    }
    let lower = text.to_lowercase();
    let n = needle.to_lowercase();
    // Only when lowercasing keeps byte offsets (ASCII paths); otherwise an exact match.
    if lower.len() != text.len() {
        return text.replace(needle, with);
    }
    let mut out = String::with_capacity(text.len());
    let mut i = 0;
    while let Some(pos) = lower[i..].find(&n) {
        out.push_str(&text[i..i + pos]);
        out.push_str(with);
        i += pos + n.len();
    }
    out.push_str(&text[i..]);
    out
}

/// Hides EDCH-Discord keys ("edch1.<payload>.<signature>"): their base64 has dashes, which would
/// split them into words too short for `mask_word`.
fn mask_bot_keys(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(start) = rest.find("edch1.") {
        out.push_str(&rest[..start]);
        out.push_str("edch1.***");
        let after = &rest[start..];
        let end = after
            .find(|c: char| !(c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_')))
            .unwrap_or(after.len());
        rest = &after[end..];
    }
    out.push_str(rest);
    out
}

/// Masks IPv4 addresses, long hex/alphanumeric tokens and Frontier ids, word by word.
fn mask_tokens(text: &str) -> String {
    let text = &mask_bot_keys(text);
    let mut out = String::with_capacity(text.len());
    let mut word = String::new();
    let flush = |word: &mut String, out: &mut String| {
        out.push_str(&mask_word(word));
        word.clear();
    };
    for ch in text.chars() {
        if ch.is_ascii_alphanumeric() || ch == '.' || ch == '_' {
            word.push(ch);
        } else {
            flush(&mut word, &mut out);
            out.push(ch);
        }
    }
    flush(&mut word, &mut out);
    out
}

fn mask_word(word: &str) -> String {
    // IPv4 (possibly followed by a sentence's full stop).
    let trimmed = word.trim_end_matches('.');
    let parts: Vec<&str> = trimmed.split('.').collect();
    if parts.len() == 4
        && parts
            .iter()
            .all(|p| !p.is_empty() && p.len() <= 3 && p.chars().all(|c| c.is_ascii_digit()))
    {
        return format!("{}.{}.x.x{}", parts[0], parts[1], &word[trimmed.len()..]);
    }
    // Frontier id: F followed by 6+ digits.
    if word.len() >= 7 && word.starts_with('F') && word[1..].chars().all(|c| c.is_ascii_digit()) {
        return "F***".into();
    }
    // Secrets: 24+ characters of hex, or 24+ mixed letters and digits (pairing code, wing topic…).
    let core = word.trim_start_matches("edch_");
    let hexish = core.len() >= 24 && core.chars().all(|c| c.is_ascii_hexdigit());
    let tokenish = core.len() >= 24
        && core.chars().all(|c| c.is_ascii_alphanumeric())
        && core.chars().any(|c| c.is_ascii_digit())
        && core.chars().any(|c| c.is_ascii_alphabetic());
    if hexish || tokenish {
        return format!("{}***", &word[..word.len() - core.len()]);
    }
    word.to_string()
}

/// Hides secrets in URLs before they reach a log (API keys, tokens).
pub fn redact(url: &str) -> String {
    let Some((base, query)) = url.split_once('?') else {
        return url.to_string();
    };
    let parts: Vec<String> = query
        .split('&')
        .map(|p| match p.split_once('=') {
            Some((k, _)) if ["apikey", "key", "token", "commanderfrontierid"].contains(&k.to_lowercase().as_str()) => {
                format!("{k}=***")
            }
            _ => p.to_string(),
        })
        .collect();
    format!("{base}?{}", parts.join("&"))
}

#[tauri::command]
pub fn log_write(level: String, source: String, message: String) {
    // From the UI: a known level, a short source name, and a line that can't flood the files.
    let level = match level.to_uppercase().as_str() {
        "DEBUG" if !debug_enabled() => return,
        level @ ("DEBUG" | "INFO" | "WARN" | "ERROR") => level.to_string(),
        _ => "INFO".to_string(),
    };
    let source: String = source
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .take(32)
        .collect();
    let message: String = message.chars().take(MAX_UI_LINE_CHARS).collect();
    write(&level, &source, &message);
}

/// Longest line the UI may write to a log.
const MAX_UI_LINE_CHARS: usize = 8_000;

/// Turns the debug log on or off; returns its path while on.
#[tauri::command]
pub fn log_set_debug(on: bool) -> Option<String> {
    let l = LOGGER.get()?;
    let was = l.debug_on.load(Ordering::Relaxed);
    if on == was {
        return on.then(|| {
            l.dir
                .join(format!("{DEBUG}{}.log", l.stamp))
                .to_string_lossy()
                .to_string()
        });
    }
    if on {
        let path = l.dir.join(format!("{DEBUG}{}.log", l.stamp));
        let fresh = !path.exists();
        let mut file = open(&path);
        // A new debug log starts with what the standard log already holds for this run.
        if fresh {
            if let (Some(f), Ok(earlier)) = (
                file.as_mut(),
                fs::read(l.dir.join(format!("{STANDARD}{}.log", l.stamp))),
            ) {
                let _ = f.write_all(&earlier);
            }
        }
        if let Ok(mut f) = l.debug.lock() {
            *f = file;
        }
        l.debug_on.store(true, Ordering::Relaxed);
        info("app", "Debug mode on");
        Some(path.to_string_lossy().to_string())
    } else {
        info("app", "Debug mode off");
        l.debug_on.store(false, Ordering::Relaxed);
        if let Ok(mut f) = l.debug.lock() {
            *f = None;
        }
        None
    }
}

/// File next to the logs with the game data EDCH's data lacks (written by the UI, see
/// features/dataGaps/missingData.ts), for players to attach to a GitHub issue.
const MISSING_DATA_FILE: &str = "missing-data.txt";
/// Largest missing-data file accepted (the list is capped well below by the UI).
const MISSING_DATA_MAX_BYTES: usize = 256 * 1024;

/// Writes the missing-data file, through `sanitize` like every log line. An empty text removes
/// it: the file exists only while something is missing.
#[tauri::command]
pub fn missing_data_save(text: String) -> Result<(), String> {
    if text.len() > MISSING_DATA_MAX_BYTES {
        return Err("textTooLong".into());
    }
    let dir = dir();
    let path = dir.join(MISSING_DATA_FILE);
    if text.is_empty() {
        return match fs::remove_file(&path) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
            _ => Ok(()),
        };
    }
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(path, sanitize(&text)).map_err(|e| e.to_string())
}

/// Shows the missing-data file in Explorer (selected), or its folder elsewhere.
#[tauri::command]
pub fn missing_data_show() -> Result<(), String> {
    let path = dir().join(MISSING_DATA_FILE);
    if !path.is_file() {
        return Err("fileNotFound".into());
    }
    #[cfg(target_os = "windows")]
    let result = std::process::Command::new("explorer")
        .arg(format!("/select,{}", path.display()))
        .spawn();
    #[cfg(not(target_os = "windows"))]
    let result = std::process::Command::new(if cfg!(target_os = "macos") { "open" } else { "xdg-open" })
        .arg(dir())
        .spawn();
    result.map(|_| ()).map_err(|e| e.to_string())
}

/// Does the missing-data file still exist? (A player who deleted it after sending it starts a
/// new list.)
#[tauri::command]
pub fn missing_data_exists() -> bool {
    dir().join(MISSING_DATA_FILE).is_file()
}

/// Was a GitHub issue holding `report_id` created? Public search, no account: the id is random
/// ("edch-report-3f9a1c2b") and says nothing about the player.
#[tauri::command]
pub async fn missing_data_reported(report_id: String) -> Result<bool, String> {
    let valid = report_id.starts_with("edch-report-")
        && report_id.len() <= 40
        && report_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-');
    if !valid {
        return Err("invalidReportId".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let url =
            format!("https://api.github.com/search/issues?q=%22{report_id}%22+repo:BKNadir/edch+in:body&per_page=1");
        let agent = ureq::AgentBuilder::new()
            .timeout_connect(Duration::from_secs(15))
            .timeout_read(Duration::from_secs(30))
            .user_agent(concat!("EDCH/", env!("CARGO_PKG_VERSION")))
            .build();
        let response = agent
            .get(&url)
            .set("Accept", "application/vnd.github+json")
            .call()
            .map_err(|e| format!("network: {e}"))?;
        let body: serde_json::Value =
            serde_json::from_str(&response.into_string().map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
        Ok(body["total_count"].as_u64().unwrap_or(0) > 0)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Opens the logs folder in Explorer.
#[tauri::command]
pub fn logs_open() -> Result<String, String> {
    let dir = dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    #[cfg(target_os = "windows")]
    let result = std::process::Command::new("explorer").arg(&dir).spawn();
    #[cfg(not(target_os = "windows"))]
    let result = std::process::Command::new(if cfg!(target_os = "macos") { "open" } else { "xdg-open" })
        .arg(&dir)
        .spawn();
    result.map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::{civil, redact};

    #[test]
    fn dates() {
        assert_eq!(civil(0), (1970, 1, 1, 0, 0, 0));
        assert_eq!(civil(1_793_523_749), (2026, 11, 1, 9, 2, 29));
        assert_eq!(civil(951_782_400), (2000, 2, 29, 0, 0, 0));
    }

    #[test]
    fn bot_keys_are_removed() {
        use super::sanitize;
        assert_eq!(
            sanitize("key edch1.eyJiIjoiaHR0cHM6Ly9ib3Qi-fQ.Ab_c-9xY used"),
            "key edch1.*** used"
        );
    }

    #[test]
    fn private_data_is_removed() {
        use super::sanitize;
        assert_eq!(
            sanitize("from 192.168.50.200 and 100.113.82.26."),
            "from 192.168.x.x and 100.113.x.x."
        );
        assert_eq!(
            sanitize("GET https://ntfy.sh/edch_0e143513d9dc2a6934d0fb36a28bb6ae/json?poll=1"),
            "GET https://ntfy.sh/edch_***/json?poll=1"
        );
        assert_eq!(
            sanitize("pair?t=8fa8ba55c0934d4e2895683173ca68f66eb5e35c05a8312d"),
            "pair?t=***"
        );
        assert_eq!(sanitize("FID F13288383 ok"), "FID F*** ok");
        assert_eq!(
            sanitize("EDCH 0.8.9 (installed) MissionID=1070079228"),
            "EDCH 0.8.9 (installed) MissionID=1070079228"
        );
        assert_eq!(
            sanitize("Journal.2026-11-01T080133.01.log"),
            "Journal.2026-11-01T080133.01.log"
        );
        assert_eq!(
            sanitize("GET / from fe80::1c2d:3e4f:5a6b:7c8d%12 and fd7a:115c:a1e0::1234."),
            "GET / from fe80:… and fd7a:…."
        );
        // Times and MAC addresses aren't IPv6 addresses.
        assert_eq!(
            sanitize("at 15:38:19.89, mac aa:bb:cc:dd:ee:ff"),
            "at 15:38:19.89, mac aa:bb:cc:dd:ee:ff"
        );
    }

    #[test]
    fn secrets() {
        assert_eq!(
            redact("https://x/api?commanderName=A&apiKey=123"),
            "https://x/api?commanderName=A&apiKey=***"
        );
        assert_eq!(redact("https://x/api"), "https://x/api");
    }
}

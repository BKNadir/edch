//! Application logs, in %LOCALAPPDATA%\EDCompanionHelper\logs.
//!
//! - Standard log (`edch_<start time>.log`): always written, one file per start. Info,
//!   warnings and errors.
//! - Debug log (`edch-debug_<start time>.log`): only while debug mode is on in Settings.
//!   It repeats every standard line plus the detailed ones, so it can be read alone.
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

struct Logger {
    dir: PathBuf,
    stamp: String,
    standard: Mutex<Option<File>>,
    debug: Mutex<Option<File>>,
    debug_on: AtomicBool,
}

static LOGGER: OnceLock<Logger> = OnceLock::new();

pub fn dir() -> PathBuf {
    let base = std::env::var("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|_| std::env::temp_dir());
    base.join("EDCompanionHelper").join("logs")
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
    (y, m, d, (rem / 3600) as u32, ((rem % 3600) / 60) as u32, (rem % 60) as u32)
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
    files.sort_by(|a, b| b.1.cmp(&a.1));
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
    let stamp = file_stamp();
    let standard = open(&dir.join(format!("{STANDARD}{stamp}.log")));
    let _ = LOGGER.set(Logger {
        dir,
        stamp,
        standard: Mutex::new(standard),
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
    let text = format!("{} [{:<5}] {}: {}\n", line_stamp(), level, source, message.replace('\n', " ⏎ "));
    if level != "DEBUG" {
        if let Ok(mut f) = l.standard.lock() {
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
pub fn debug(source: &str, message: &str) {
    if debug_enabled() {
        write("DEBUG", source, message);
    }
}
pub fn debug_enabled() -> bool {
    LOGGER.get().is_some_and(|l| l.debug_on.load(Ordering::Relaxed))
}

/// Hides secrets in URLs before they reach a log (API keys, tokens).
pub fn redact(url: &str) -> String {
    let Some((base, query)) = url.split_once('?') else { return url.to_string() };
    let parts: Vec<String> = query
        .split('&')
        .map(|p| match p.split_once('=') {
            Some((k, _)) if ["apikey", "key", "token", "commanderfrontierid"].contains(&k.to_lowercase().as_str()) => format!("{k}=***"),
            _ => p.to_string(),
        })
        .collect();
    format!("{base}?{}", parts.join("&"))
}

#[tauri::command]
pub fn log_write(level: String, source: String, message: String) {
    write(&level, &source, &message);
}

/// Turns the debug log on or off; returns its path while on.
#[tauri::command]
pub fn log_set_debug(on: bool) -> Option<String> {
    let l = LOGGER.get()?;
    let was = l.debug_on.load(Ordering::Relaxed);
    if on == was {
        return on.then(|| l.dir.join(format!("{DEBUG}{}.log", l.stamp)).to_string_lossy().to_string());
    }
    if on {
        let path = l.dir.join(format!("{DEBUG}{}.log", l.stamp));
        let fresh = !path.exists();
        let mut file = open(&path);
        // A new debug log starts with what the standard log already holds for this run.
        if fresh {
            if let (Some(f), Ok(earlier)) = (file.as_mut(), fs::read(l.dir.join(format!("{STANDARD}{}.log", l.stamp)))) {
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
    fn secrets() {
        assert_eq!(redact("https://x/api?commanderName=A&apiKey=123"), "https://x/api?commanderName=A&apiKey=***");
        assert_eq!(redact("https://x/api"), "https://x/api");
    }
}

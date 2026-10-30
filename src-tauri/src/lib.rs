//! EDCH backend.
//!
//! Deliberately small: it tails the Elite Dangerous journal folder and streams raw
//! lines to the UI (which owns all game logic), reads the companion JSON files the
//! game rewrites (ShipLocker.json…), proxies Spansh searches (no CORS from Rust) and
//! opens links in the default browser.

use serde::Serialize;
use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant, SystemTime};
use tauri::{AppHandle, Emitter, Manager};

/// Bumped every time a new watch starts, so an older watcher thread stops by itself.
#[derive(Default)]
struct WatchState {
    generation: AtomicU64,
}

#[derive(Clone, Serialize)]
struct JournalBatch {
    lines: Vec<String>,
    replay: bool,
    file: String,
}

#[derive(Clone, Serialize)]
struct WatchStatus {
    state: String,
    file: Option<String>,
    message: Option<String>,
}

#[derive(Clone, Serialize)]
struct AuxFile {
    name: String,
    content: String,
}

/// Companion files the game rewrites in place; the UI gets them whenever they change.
const AUX_FILES: [&str; 4] = ["ShipLocker.json", "Backpack.json", "Cargo.json", "Status.json"];
const BATCH: usize = 2000;
const MAX_REPLAY_FILES: usize = 40;

fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default()
}

fn journal_files(dir: &Path) -> Vec<(PathBuf, SystemTime)> {
    let mut files: Vec<(PathBuf, SystemTime)> = match fs::read_dir(dir) {
        Ok(entries) => entries
            .filter_map(|entry| entry.ok())
            .filter_map(|entry| {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with("Journal.") && name.ends_with(".log") {
                    let modified = entry
                        .metadata()
                        .and_then(|m| m.modified())
                        .unwrap_or(SystemTime::UNIX_EPOCH);
                    Some((entry.path(), modified))
                } else {
                    None
                }
            })
            .collect(),
        Err(_) => Vec::new(),
    };
    files.sort_by(|a, b| a.1.cmp(&b.1).then_with(|| a.0.cmp(&b.0)));
    files
}

/// Length of the prefix that ends with a newline: a line still being written is left for later.
fn complete_len(bytes: &[u8]) -> usize {
    bytes
        .iter()
        .rposition(|&b| b == b'\n')
        .map(|p| p + 1)
        .unwrap_or(0)
}

fn split_lines(bytes: &[u8]) -> Vec<String> {
    String::from_utf8_lossy(bytes)
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .map(|l| l.to_string())
        .collect()
}

fn has_materials_event(bytes: &[u8]) -> bool {
    let text = String::from_utf8_lossy(bytes);
    text.contains("\"event\":\"Materials\"") || text.contains("\"event\": \"Materials\"")
}

fn emit_status(app: &AppHandle, state: &str, file: Option<String>, message: Option<String>) {
    let _ = app.emit(
        "journal-status",
        WatchStatus {
            state: state.to_string(),
            file,
            message,
        },
    );
}

fn emit_lines(app: &AppHandle, lines: Vec<String>, replay: bool, file: &str) {
    for chunk in lines.chunks(BATCH) {
        let _ = app.emit(
            "journal-batch",
            JournalBatch {
                lines: chunk.to_vec(),
                replay,
                file: file.to_string(),
            },
        );
    }
}

fn read_from(path: &Path, offset: &mut u64) -> std::io::Result<Vec<u8>> {
    let mut file = File::open(path)?;
    let len = file.metadata()?.len();
    if len < *offset {
        // Truncated or replaced: start over.
        *offset = 0;
    }
    file.seek(SeekFrom::Start(*offset))?;
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer)?;
    Ok(buffer)
}

fn check_aux(app: &AppHandle, dir: &Path, seen: &mut [Option<SystemTime>; 4]) {
    for (index, name) in AUX_FILES.iter().enumerate() {
        let path = dir.join(name);
        let modified = match fs::metadata(&path).and_then(|m| m.modified()) {
            Ok(m) => m,
            Err(_) => continue,
        };
        if seen[index] == Some(modified) {
            continue;
        }
        if let Ok(bytes) = fs::read(&path) {
            let content = String::from_utf8_lossy(&bytes).to_string();
            // The game sometimes leaves the file empty for a moment while rewriting it.
            if content.trim().is_empty() {
                continue;
            }
            seen[index] = Some(modified);
            let _ = app.emit(
                "aux-file",
                AuxFile {
                    name: name.to_string(),
                    content,
                },
            );
        }
    }
}

fn watch_loop(app: AppHandle, dir: PathBuf, generation: u64) {
    let state = app.state::<Arc<WatchState>>().inner().clone();
    let alive = || state.generation.load(Ordering::SeqCst) == generation;

    // 1. Replay: newest journals back to the last login (the "Materials" event).
    let files = journal_files(&dir);
    let mut replay: Vec<PathBuf> = Vec::new();
    for (path, _) in files.iter().rev().take(MAX_REPLAY_FILES) {
        replay.push(path.clone());
        if let Ok(bytes) = fs::read(path) {
            if has_materials_event(&bytes) {
                break;
            }
        }
    }
    replay.reverse();

    let mut current: Option<PathBuf> = None;
    let mut offset: u64 = 0;
    for path in &replay {
        if !alive() {
            return;
        }
        let bytes = fs::read(path).unwrap_or_default();
        let len = complete_len(&bytes);
        emit_lines(&app, split_lines(&bytes[..len]), true, &file_name(path));
        current = Some(path.clone());
        offset = len as u64;
    }

    let mut aux_seen: [Option<SystemTime>; 4] = [None, None, None, None];
    check_aux(&app, &dir, &mut aux_seen);

    if files.is_empty() {
        emit_status(
            &app,
            "waiting",
            None,
            Some("Aucun fichier Journal.*.log dans ce dossier pour l'instant.".into()),
        );
    } else {
        emit_status(&app, "live", current.as_deref().map(file_name), None);
    }

    // 2. Tail the newest journal; switch when the game starts a new one.
    let mut last_scan = Instant::now();
    while alive() {
        if let Some(path) = current.clone() {
            if let Ok(bytes) = read_from(&path, &mut offset) {
                let len = complete_len(&bytes);
                if len > 0 {
                    emit_lines(&app, split_lines(&bytes[..len]), false, &file_name(&path));
                    offset += len as u64;
                }
            }
        }

        if current.is_none() || last_scan.elapsed() >= Duration::from_millis(1500) {
            last_scan = Instant::now();
            if let Some((newest, _)) = journal_files(&dir).last() {
                if current.as_ref() != Some(newest) {
                    current = Some(newest.clone());
                    offset = 0;
                    emit_status(&app, "live", Some(file_name(newest)), None);
                }
            }
            check_aux(&app, &dir, &mut aux_seen);
        }

        thread::sleep(Duration::from_millis(250));
    }
}

#[tauri::command]
fn default_journal_dir() -> Option<String> {
    let home = std::env::var("USERPROFILE")
        .ok()
        .or_else(|| std::env::var("HOME").ok())?;
    let path = Path::new(&home)
        .join("Saved Games")
        .join("Frontier Developments")
        .join("Elite Dangerous");
    Some(path.to_string_lossy().to_string())
}

#[tauri::command]
fn start_journal(app: AppHandle, dir: String) -> Result<(), String> {
    let path = PathBuf::from(&dir);
    if !path.is_dir() {
        return Err(format!("Dossier introuvable : {dir}"));
    }
    let state = app.state::<Arc<WatchState>>().inner().clone();
    let generation = state.generation.fetch_add(1, Ordering::SeqCst) + 1;
    let handle = app.clone();
    thread::spawn(move || watch_loop(handle, path, generation));
    Ok(())
}

#[tauri::command]
fn read_aux_file(dir: String, name: String) -> Result<String, String> {
    if name.contains('/') || name.contains('\\') || !name.ends_with(".json") {
        return Err("Nom de fichier refusé".into());
    }
    fs::read_to_string(Path::new(&dir).join(&name)).map_err(|e| e.to_string())
}

#[derive(Serialize)]
struct HttpReply {
    status: u16,
    body: String,
}

/// Hosts the UI may talk to. Everything else is refused.
const ALLOWED_HOSTS: [&str; 6] = [
    "https://spansh.co.uk/",
    "https://www.spansh.co.uk/",
    "https://eddn.edcd.io:4430/",
    "https://www.edsm.net/",
    "https://inara.cz/",
    "https://edsm.net/",
];

/// Generic HTTP for the UI (no CORS from Rust). Non-2xx answers are returned, not errors,
/// so the caller can apply each service's retry rules (EDDN forbids retrying a 400).
#[tauri::command]
async fn http_fetch(
    method: String,
    url: String,
    body: Option<String>,
    content_type: Option<String>,
) -> Result<HttpReply, String> {
    if !ALLOWED_HOSTS.iter().any(|h| url.starts_with(h)) {
        return Err(format!("Adresse refusée : {url}"));
    }
    tauri::async_runtime::spawn_blocking(move || {
        let agent = ureq::AgentBuilder::new()
            .timeout(Duration::from_secs(30))
            .user_agent(concat!("EDCH/", env!("CARGO_PKG_VERSION")))
            .build();
        let request = agent.request(&method.to_uppercase(), &url);
        let result = match body {
            Some(text) => request
                .set(
                    "Content-Type",
                    content_type.as_deref().unwrap_or("application/json"),
                )
                .send_string(&text),
            None => request.call(),
        };
        match result {
            Ok(response) => {
                let status = response.status();
                let body = response.into_string().map_err(|e| e.to_string())?;
                Ok(HttpReply { status, body })
            }
            Err(ureq::Error::Status(status, response)) => Ok(HttpReply {
                status,
                body: response.into_string().unwrap_or_default(),
            }),
            Err(error) => Err(format!("Réseau : {error}")),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    if !url.starts_with("https://") {
        return Err("Seuls les liens https sont ouverts".into());
    }
    #[cfg(target_os = "windows")]
    let result = {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        std::process::Command::new("rundll32")
            .arg("url.dll,FileProtocolHandler")
            .arg(&url)
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
    };
    #[cfg(target_os = "macos")]
    let result = std::process::Command::new("open").arg(&url).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let result = std::process::Command::new("xdg-open").arg(&url).spawn();

    result.map(|_| ()).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Arc::new(WatchState::default()))
        .invoke_handler(tauri::generate_handler![
            default_journal_dir,
            start_journal,
            read_aux_file,
            http_fetch,
            open_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running EDCH");
}

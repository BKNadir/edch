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

mod logs;
mod ntfy;
mod remote;
mod update;

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
const AUX_FILES: [&str; 5] = ["ShipLocker.json", "Backpack.json", "Cargo.json", "Status.json", "Market.json"];
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
    let text = format!("{state} {} {}", file.as_deref().unwrap_or(""), message.as_deref().unwrap_or(""));
    if state == "error" {
        logs::warn("journal", text.trim());
    } else {
        logs::info("journal", text.trim());
    }
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
    if logs::debug_enabled() && !lines.is_empty() {
        logs::debug("journal", &format!("{} line(s) from {file}{}", lines.len(), if replay { " (replay)" } else { "" }));
    }
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

fn check_aux(app: &AppHandle, dir: &Path, seen: &mut [Option<SystemTime>; 5]) {
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

    let mut aux_seen: [Option<SystemTime>; 5] = [None, None, None, None, None];
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

/// Journal lines of the last `days` days whose event is one of `events`, oldest first. Used once at
/// start-up to rebuild what outlives a single session (missions, colonisation depots, unsold
/// exploration and exobiology data, Powerplay merits). Capped so a huge archive stays quick.
#[tauri::command]
async fn scan_history(dir: String, days: u64, events: Vec<String>) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        const MAX_BYTES: u64 = 400 * 1024 * 1024;
        const MAX_LINES: usize = 200_000;
        let since = SystemTime::now()
            .checked_sub(Duration::from_secs(days.saturating_mul(86_400)))
            .unwrap_or(SystemTime::UNIX_EPOCH);
        let needles: Vec<String> = events.iter().map(|e| format!("\"event\":\"{e}\"")).collect();
        let needles_spaced: Vec<String> = events.iter().map(|e| format!("\"event\": \"{e}\"")).collect();
        let mut files: Vec<(PathBuf, SystemTime)> =
            journal_files(Path::new(&dir)).into_iter().filter(|(_, modified)| *modified >= since).collect();
        // Newest first while budgeting, then put back in order.
        files.reverse();
        let mut budget = MAX_BYTES;
        let mut picked: Vec<PathBuf> = Vec::new();
        for (path, _) in files {
            let size = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
            if size > budget {
                break;
            }
            budget -= size;
            picked.push(path);
        }
        picked.reverse();
        let mut out: Vec<String> = Vec::new();
        for path in picked {
            let bytes = fs::read(&path).unwrap_or_default();
            let len = complete_len(&bytes);
            for line in split_lines(&bytes[..len]) {
                if needles.iter().any(|n| line.contains(n.as_str())) || needles_spaced.iter().any(|n| line.contains(n.as_str())) {
                    out.push(line);
                }
            }
        }
        if out.len() > MAX_LINES {
            out.drain(..out.len() - MAX_LINES);
        }
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn default_journal_dir() -> Option<String> {
    // Linux: the game runs through Steam's Proton; its "Windows" user folder is in the prefix.
    #[cfg(target_os = "linux")]
    {
        for user in proton_users() {
            let path = user.join("Saved Games").join("Frontier Developments").join("Elite Dangerous");
            if path.is_dir() {
                return Some(path.to_string_lossy().to_string());
            }
        }
    }
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
const ALLOWED_HOSTS: [&str; 7] = [
    "https://ntfy.sh/",
    "https://spansh.co.uk/",
    "https://www.spansh.co.uk/",
    "https://eddn.edcd.io:4430/",
    "https://www.edsm.net/",
    "https://inara.cz/",
    "https://edsm.net/",
];

/// One HTTP request to an allowed host. Non-2xx answers are returned, not errors,
/// so the caller can apply each service's retry rules (EDDN forbids retrying a 400).
fn blocking_http(
    method: &str,
    url: &str,
    body: Option<&str>,
    content_type: Option<&str>,
) -> Result<HttpReply, String> {
    if !ALLOWED_HOSTS.iter().any(|h| url.starts_with(h)) {
        return Err(format!("Adresse refusée : {url}"));
    }
    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(30))
        .user_agent(concat!("EDCH/", env!("CARGO_PKG_VERSION")))
        .build();
    let request = agent.request(&method.to_uppercase(), url);
    let result = match body {
        Some(text) => request
            .set("Content-Type", content_type.unwrap_or("application/json"))
            .send_string(text),
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
}

/// Generic HTTP for the UI (no CORS from Rust).
#[tauri::command]
async fn http_fetch(
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
            Ok(reply) if reply.status < 400 => logs::debug("http", &format!("{method} {} → {} ({ms} ms)", logs::redact(&url), reply.status)),
            Ok(reply) => logs::warn("http", &format!("{method} {} → {} ({ms} ms) {}", logs::redact(&url), reply.status, reply.body.chars().take(200).collect::<String>())),
            Err(e) => logs::warn("http", &format!("{method} {} → {e} ({ms} ms)", logs::redact(&url))),
        }
        result
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Portable build: an exe named "...portable..." or a "portable" file next to it.
/// It is never installed, so updates only point to the release page.
fn portable() -> bool {
    let Ok(exe) = std::env::current_exe() else { return false };
    let named = exe
        .file_name()
        .map(|n| n.to_string_lossy().to_lowercase().contains("portable"))
        .unwrap_or(false);
    named || exe.parent().is_some_and(|d| d.join("portable").exists() || d.join("edch.portable").exists())
}

/// Puts text on this PC's clipboard (a system name clicked on a phone, to paste in the game).
#[tauri::command]
async fn clipboard_write(text: String) -> Result<(), String> {
    if text.len() > 2000 {
        return Err("Texte trop long".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
        clipboard.set_text(text).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn is_portable() -> bool {
    portable()
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

// ---------------------------------------------------------------------------
// Game options (key bindings, graphics): list, read, export to a zip, import.

#[derive(Serialize)]
struct OptionFile {
    folder: String,
    name: String,
    size: u64,
    modified: u64,
}

#[derive(Serialize)]
struct ImportReport {
    written: Vec<String>,
    skipped: Vec<String>,
    backup: String,
}

/// The two option folders EDCH manages, under %LOCALAPPDATA%.
const OPTION_FOLDERS: [&str; 2] = ["Bindings", "Graphics"];

fn options_root() -> Result<PathBuf, String> {
    #[cfg(target_os = "linux")]
    {
        let found = proton_users()
            .into_iter()
            .map(|u| u.join("AppData").join("Local").join("Frontier Developments").join("Elite Dangerous").join("Options"))
            .find(|p| p.is_dir());
        if let Some(p) = found {
            return Ok(p);
        }
    }
    let base = std::env::var("LOCALAPPDATA")
        .map(PathBuf::from)
        .or_else(|_| std::env::var("HOME").map(|h| Path::new(&h).join(".local/share")))
        .map_err(|_| "Dossier LOCALAPPDATA introuvable".to_string())?;
    Ok(base
        .join("Frontier Developments")
        .join("Elite Dangerous")
        .join("Options"))
}

/// Linux: the "steamuser" folders of Elite Dangerous's Proton prefixes (app 359320), in every
/// Steam install (native, Flatpak, Snap) and every Steam library.
#[cfg(target_os = "linux")]
fn proton_users() -> Vec<PathBuf> {
    let Ok(home) = std::env::var("HOME") else { return Vec::new() };
    let home = PathBuf::from(home);
    let roots = [
        ".local/share/Steam",
        ".steam/steam",
        ".steam/root",
        ".var/app/com.valvesoftware.Steam/.local/share/Steam",
        "snap/steam/common/.local/share/Steam",
    ];
    let mut libraries: Vec<PathBuf> = Vec::new();
    for root in roots {
        let root = home.join(root);
        if !root.is_dir() {
            continue;
        }
        libraries.push(root.clone());
        // Other Steam libraries (other disks), from libraryfolders.vdf: lines like "path" "/mnt/games/Steam".
        if let Ok(text) = fs::read_to_string(root.join("steamapps").join("libraryfolders.vdf")) {
            for line in text.lines() {
                let parts: Vec<&str> = line.split('"').collect();
                if parts.len() >= 4 && parts[1] == "path" {
                    libraries.push(PathBuf::from(parts[3].replace("\\\\", "\\")));
                }
            }
        }
    }
    let mut out: Vec<PathBuf> = Vec::new();
    for lib in libraries {
        let user = lib.join("steamapps/compatdata/359320/pfx/drive_c/users/steamuser");
        let canonical = user.canonicalize().unwrap_or(user.clone());
        if user.is_dir() && !out.iter().any(|o| o.canonicalize().unwrap_or(o.clone()) == canonical) {
            out.push(user);
        }
    }
    out
}

/// How this build updates: "installer" (Windows setup), "portable" (Windows, no installer),
/// "linux" or "macos" (both: the release page opens).
#[tauri::command]
fn update_mode() -> &'static str {
    if cfg!(target_os = "linux") {
        "linux"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else if portable() {
        "portable"
    } else {
        "installer"
    }
}

fn documents_dir() -> PathBuf {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".into());
    Path::new(&home).join("Documents").join("EDCH")
}

/// Only plain file names with the extensions the game uses; no paths, no tricks.
fn allowed_option_file(folder: &str, name: &str) -> bool {
    if name.is_empty() || name.contains('/') || name.contains('\\') || name.contains("..") {
        return false;
    }
    let lower = name.to_lowercase();
    match folder {
        "Bindings" => lower.ends_with(".binds") || lower.ends_with(".start"),
        "Graphics" => lower.ends_with(".xml"),
        _ => false,
    }
}

fn unix_secs(t: SystemTime) -> u64 {
    t.duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

#[tauri::command]
fn options_dir() -> Result<String, String> {
    Ok(options_root()?.to_string_lossy().to_string())
}

#[tauri::command]
fn list_option_files() -> Result<Vec<OptionFile>, String> {
    let root = options_root()?;
    let mut out = Vec::new();
    for folder in OPTION_FOLDERS {
        let Ok(entries) = fs::read_dir(root.join(folder)) else {
            continue;
        };
        for entry in entries.filter_map(|e| e.ok()) {
            let name = entry.file_name().to_string_lossy().to_string();
            if !allowed_option_file(folder, &name) {
                continue;
            }
            let meta = match entry.metadata() {
                Ok(m) if m.is_file() => m,
                _ => continue,
            };
            out.push(OptionFile {
                folder: folder.to_string(),
                name,
                size: meta.len(),
                modified: meta.modified().map(unix_secs).unwrap_or(0),
            });
        }
    }
    Ok(out)
}

#[tauri::command]
fn read_option_file(folder: String, name: String) -> Result<String, String> {
    if !OPTION_FOLDERS.contains(&folder.as_str()) || !allowed_option_file(&folder, &name) {
        return Err("Fichier refusé".into());
    }
    let bytes = fs::read(options_root()?.join(&folder).join(&name)).map_err(|e| e.to_string())?;
    // .binds files start with a UTF-8 BOM.
    let text = String::from_utf8_lossy(&bytes).to_string();
    Ok(text.trim_start_matches('\u{feff}').to_string())
}

fn write_zip(target: &Path, folders: &[&str]) -> Result<usize, String> {
    use std::io::Write;
    let root = options_root()?;
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let file = File::create(target).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    let mut count = 0;
    for folder in folders {
        let Ok(entries) = fs::read_dir(root.join(folder)) else {
            continue;
        };
        for entry in entries.filter_map(|e| e.ok()) {
            let name = entry.file_name().to_string_lossy().to_string();
            if !allowed_option_file(folder, &name) || !entry.path().is_file() {
                continue;
            }
            let bytes = fs::read(entry.path()).map_err(|e| e.to_string())?;
            zip.start_file(format!("{folder}/{name}"), options.clone())
                .map_err(|e| e.to_string())?;
            zip.write_all(&bytes).map_err(|e| e.to_string())?;
            count += 1;
        }
    }
    zip.finish().map_err(|e| e.to_string())?;
    Ok(count)
}

/// Zips the Bindings (and optionally Graphics) folders into Documents\EDCH. Returns the file path.
#[tauri::command]
fn export_config(include_graphics: bool) -> Result<String, String> {
    let folders: Vec<&str> = if include_graphics {
        vec!["Bindings", "Graphics"]
    } else {
        vec!["Bindings"]
    };
    let target = documents_dir().join(format!(
        "EDCH-config-{}.zip",
        unix_secs(SystemTime::now())
    ));
    let count = write_zip(&target, &folders)?;
    if count == 0 {
        let _ = fs::remove_file(&target);
        return Err("Aucun fichier de configuration trouvé à exporter".into());
    }
    Ok(target.to_string_lossy().to_string())
}

/// Restores a zip made by export_config (or any zip with Bindings/ and Graphics/ entries).
/// The current configuration is always backed up first.
#[tauri::command]
fn import_config(data: Vec<u8>) -> Result<ImportReport, String> {
    use std::io::Read as _;
    let mut archive =
        zip::ZipArchive::new(std::io::Cursor::new(data)).map_err(|e| format!("Zip illisible : {e}"))?;
    // Validate everything before touching the game's files.
    let mut files: Vec<(String, String, Vec<u8>)> = Vec::new();
    let mut skipped = Vec::new();
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        if entry.is_dir() {
            continue;
        }
        let full = entry.name().replace('\\', "/");
        let parts: Vec<&str> = full.split('/').filter(|p| !p.is_empty()).collect();
        // Accept "Bindings/x.binds" anywhere in the archive (e.g. "Options/Bindings/x.binds").
        let pair = parts
            .windows(2)
            .rev()
            .find(|w| OPTION_FOLDERS.contains(&w[0]))
            .map(|w| (w[0].to_string(), w[1].to_string()));
        match pair {
            Some((folder, name)) if parts.last() == Some(&name.as_str()) && allowed_option_file(&folder, &name) => {
                let mut bytes = Vec::new();
                entry.read_to_end(&mut bytes).map_err(|e| e.to_string())?;
                files.push((folder, name, bytes));
            }
            _ => skipped.push(full),
        }
    }
    if files.is_empty() {
        return Err("Ce zip ne contient aucun fichier Bindings/*.binds ni Graphics/*.xml".into());
    }
    let backup = documents_dir()
        .join("sauvegardes")
        .join(format!("avant-import-{}.zip", unix_secs(SystemTime::now())));
    write_zip(&backup, &OPTION_FOLDERS)?;

    let root = options_root()?;
    let mut written = Vec::new();
    for (folder, name, bytes) in files {
        let dir = root.join(&folder);
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        fs::write(dir.join(&name), bytes).map_err(|e| e.to_string())?;
        written.push(format!("{folder}/{name}"));
    }
    Ok(ImportReport {
        written,
        skipped,
        backup: backup.to_string_lossy().to_string(),
    })
}

/// Shows a file in Explorer (or opens its folder elsewhere).
#[tauri::command]
fn reveal_path(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err("Fichier introuvable".into());
    }
    #[cfg(target_os = "windows")]
    let result = std::process::Command::new("explorer")
        .arg(format!("/select,{}", p.display()))
        .spawn();
    #[cfg(not(target_os = "windows"))]
    let result = std::process::Command::new(if cfg!(target_os = "macos") { "open" } else { "xdg-open" })
        .arg(p.parent().unwrap_or(&p))
        .spawn();
    result.map(|_| ()).map_err(|e| e.to_string())
}

/// Language picked in the NSIS installer (Windows LANGID), if any.
#[tauri::command]
fn installer_language() -> Option<u32> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        for key in [r"HKCU\Software\BKNadir\EDCH", r"HKLM\Software\BKNadir\EDCH"] {
            let out = std::process::Command::new("reg")
                .args(["query", key, "/v", "Installer Language"])
                .creation_flags(CREATE_NO_WINDOW)
                .output()
                .ok()?;
            let text = String::from_utf8_lossy(&out.stdout);
            if let Some(id) = text
                .lines()
                .find(|l| l.contains("Installer Language"))
                .and_then(|l| l.split_whitespace().last())
                .and_then(|v| v.parse::<u32>().ok())
            {
                return Some(id);
            }
        }
        None
    }
    #[cfg(not(target_os = "windows"))]
    {
        None
    }
}

/// Up to v0.5.2 the app's data (settings, API keys, language, wishlist) lived under the
/// identifier "be.bknadir.edch". Move it to the new folder before the webview opens it.
fn migrate_data_folder() {
    for var in ["LOCALAPPDATA", "APPDATA"] {
        let Ok(base) = std::env::var(var) else { continue };
        let old = PathBuf::from(&base).join("be.bknadir.edch");
        let new = PathBuf::from(&base).join("EDCompanionHelper");
        if old.is_dir() && !new.exists() {
            let _ = std::fs::rename(&old, &new);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    migrate_data_folder();
    logs::init(portable());
    tauri::Builder::default()
        // Reopens the window where it was: position, size, maximised or full screen.
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(Arc::new(WatchState::default()))
        .manage(remote::RemoteState::default())
        .invoke_handler(tauri::generate_handler![
            default_journal_dir,
            scan_history,
            start_journal,
            read_aux_file,
            http_fetch,
            open_url,
            options_dir,
            list_option_files,
            read_option_file,
            export_config,
            import_config,
            reveal_path,
            installer_language,
            remote::remote_start,
            remote::remote_stop,
            remote::remote_publish,
            remote::remote_qr,
            remote::remote_addresses,
            remote::remote_interfaces,
            remote::remote_tailscale,
            is_portable,
            update_mode,
            clipboard_write,
            ntfy::ntfy_subscribe,
            ntfy::ntfy_unsubscribe,
            ntfy::ntfy_set_farewell,
            logs::log_write,
            logs::log_set_debug,
            logs::logs_open,
            update::update_check,
            update::update_download,
            update::update_install
        ])
        .build(tauri::generate_context!())
        .expect("error while running EDCH")
        .run(|_app, event| {
            if let tauri::RunEvent::Exit = event {
                ntfy::send_farewell();
                logs::info("app", "EDCH closed");
            }
        });
}

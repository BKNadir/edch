//! The game's option files (key bindings, graphics): list, read, export to a zip in
//! Documents\\EDCH, and import from a zip (the current files are always backed up first). Only the
//! Bindings and Graphics folders, and only the file types the game uses, are ever touched. EDCH
//! writes a binding file itself only for its own presets ("…_EDCH"), never the game's.

use serde::Serialize;
use std::fs::{self, File};
use std::path::{Path, PathBuf};
use std::time::SystemTime;

#[cfg(target_os = "linux")]
use crate::paths::proton_users;
use crate::paths::{control_schemes_dirs, documents_dir};

#[derive(Serialize)]
pub struct OptionFile {
    folder: String,
    name: String,
    size: u64,
    modified: u64,
}

#[derive(Serialize)]
pub struct ImportReport {
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
            .map(|u| {
                u.join("AppData")
                    .join("Local")
                    .join("Frontier Developments")
                    .join("Elite Dangerous")
                    .join("Options")
            })
            .find(|p| p.is_dir());
        if let Some(p) = found {
            return Ok(p);
        }
    }
    let base = std::env::var("LOCALAPPDATA")
        .map(PathBuf::from)
        .or_else(|_| std::env::var("HOME").map(|h| Path::new(&h).join(".local/share")))
        .map_err(|_| "optionsFolderNotFound".to_string())?;
    Ok(base
        .join("Frontier Developments")
        .join("Elite Dangerous")
        .join("Options"))
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
pub fn options_dir() -> Result<String, String> {
    Ok(options_root()?.to_string_lossy().to_string())
}

#[tauri::command]
pub fn list_option_files() -> Result<Vec<OptionFile>, String> {
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
pub fn read_option_file(folder: String, name: String) -> Result<String, String> {
    if !OPTION_FOLDERS.contains(&folder.as_str()) || !allowed_option_file(&folder, &name) {
        return Err("fileRefused".into());
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
    let options = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
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
            zip.start_file(format!("{folder}/{name}"), options)
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
pub fn export_config(include_graphics: bool) -> Result<String, String> {
    let folders: Vec<&str> = if include_graphics {
        vec!["Bindings", "Graphics"]
    } else {
        vec!["Bindings"]
    };
    let target = documents_dir().join(format!("EDCH-config-{}.zip", unix_secs(SystemTime::now())));
    let count = write_zip(&target, &folders)?;
    if count == 0 {
        let _ = fs::remove_file(&target);
        return Err("nothingToExport".into());
    }
    Ok(target.to_string_lossy().to_string())
}

/// Restores a zip made by export_config (or any zip with Bindings/ and Graphics/ entries).
/// The current configuration is always backed up first.
#[tauri::command]
pub fn import_config(data: Vec<u8>) -> Result<ImportReport, String> {
    use std::io::Read as _;
    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(data)).map_err(|e| format!("unreadableZip: {e}"))?;
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
        return Err("zipWithoutSettings".into());
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

/// Ending of the presets EDCH creates: the only binding files it ever writes itself.
const EDCH_PRESET_SUFFIX: &str = "_EDCH";

/// Files already backed up this session (one backup before the first change is enough).
static BACKED_UP: std::sync::Mutex<Vec<String>> = std::sync::Mutex::new(Vec::new());

#[derive(Serialize)]
pub struct SavedPreset {
    /// The backup made before this write (the first one of the session), if any.
    backup: Option<String>,
}

/// Writes one of EDCH's own binding presets ("Custom_EDCH.4.2.binds"): created as a copy of a game
/// preset (`create`), or updated. Any other file is refused, so the game's presets are never
/// changed. Before the first write of the session, the Bindings folder (for a new copy) or the
/// file itself (for an update) is backed up in Documents\EDCH\sauvegardes.
#[tauri::command]
pub fn save_edch_preset(name: String, content: String, create: bool) -> Result<SavedPreset, String> {
    let preset = name.split('.').next().unwrap_or_default().to_string();
    let valid_name = allowed_option_file("Bindings", &name)
        && name.to_lowercase().ends_with(".binds")
        && preset.ends_with(EDCH_PRESET_SUFFIX);
    if !valid_name || !content.contains(&format!("PresetName=\"{preset}\"")) || !content.contains("<Root") {
        return Err("presetRefused".into());
    }
    let folder = options_root()?.join("Bindings");
    let path = folder.join(&name);
    if create && path.exists() {
        return Err("presetExists".into());
    }
    if !create && !path.is_file() {
        return Err("presetMissing".into());
    }
    let mut backed_up = BACKED_UP.lock().map_err(|e| e.to_string())?;
    let backup_key = if create {
        String::from("Bindings/")
    } else {
        name.clone()
    };
    let mut backup = None;
    if !backed_up.contains(&backup_key) {
        let stamp = unix_secs(SystemTime::now());
        let target = if create {
            let target = documents_dir()
                .join("sauvegardes")
                .join(format!("avant-configuration-{stamp}.zip"));
            write_zip(&target, &["Bindings"])?;
            target
        } else {
            let target = documents_dir().join("sauvegardes").join(format!("{name}.{stamp}.bak"));
            fs::create_dir_all(documents_dir().join("sauvegardes")).map_err(|e| e.to_string())?;
            fs::copy(&path, &target).map_err(|e| e.to_string())?;
            target
        };
        backed_up.push(backup_key);
        backup = Some(target.to_string_lossy().to_string());
    }
    // The game writes its .binds files with a UTF-8 BOM. Written aside first, then moved in place,
    // so the game never reads a half-written file.
    fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    let temporary = folder.join(format!("{name}.part"));
    let text = format!("\u{feff}{}", content.trim_start_matches('\u{feff}'));
    fs::write(&temporary, text).map_err(|e| e.to_string())?;
    fs::rename(&temporary, &path).map_err(|e| e.to_string())?;
    Ok(SavedPreset { backup })
}

/// A default control preset's file name ("KeyboardMouseOnly.binds"): a plain .binds name.
fn allowed_builtin_preset(name: &str) -> bool {
    allowed_option_file("Bindings", name) && name.to_lowercase().ends_with(".binds")
}

/// The game's default control presets (the .binds files of its ControlSchemes folder), found in
/// its installation. `launcher_path`: the launcher chosen in Settings, a hint where the game is.
#[tauri::command]
pub fn list_builtin_presets(launcher_path: String) -> Vec<String> {
    let mut names: Vec<String> = Vec::new();
    for folder in control_schemes_dirs(&launcher_path) {
        for entry in fs::read_dir(folder).into_iter().flatten().flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if allowed_builtin_preset(&name) && !names.contains(&name) {
                names.push(name);
            }
        }
    }
    names
}

/// Reads one of the game's default control presets, read-only ("builtinPresetNotFound" when the
/// game's installation or the file isn't found).
#[tauri::command]
pub fn read_builtin_preset(name: String, launcher_path: String) -> Result<String, String> {
    if !allowed_builtin_preset(&name) {
        return Err("fileRefused".into());
    }
    let path = control_schemes_dirs(&launcher_path)
        .into_iter()
        .map(|folder| folder.join(&name))
        .find(|path| path.is_file())
        .ok_or_else(|| "builtinPresetNotFound".to_string())?;
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&bytes)
        .trim_start_matches('\u{feff}')
        .to_string())
}

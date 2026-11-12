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

/// Names Windows keeps for devices: "CON.binds" would open the console, not a file.
const RESERVED_NAMES: [&str; 22] = [
    "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9", "lpt1", "lpt2",
    "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
];

/// Only plain file names with the extensions the game uses; no paths, no tricks (no folder, no
/// "..", no stream ("x.binds:y"), no character Windows refuses, no device name, no hidden file).
fn allowed_option_file(folder: &str, name: &str) -> bool {
    let plain = !name.is_empty()
        && name.len() <= 200
        && !name.starts_with('.')
        && !name.contains("..")
        && !name.chars().any(|c| c.is_control() || "/\\:*?\"<>|".contains(c));
    let stem = name.split('.').next().unwrap_or_default().trim().to_lowercase();
    if !plain || RESERVED_NAMES.contains(&stem.as_str()) {
        return false;
    }
    let lower = name.to_lowercase();
    match folder {
        "Bindings" => lower.ends_with(".binds") || lower.ends_with(".start"),
        "Graphics" => lower.ends_with(".xml"),
        _ => false,
    }
}

/// An imported zip is a few hundred kilobytes; these limits keep a broken or hostile archive
/// (huge, or that expands enormously) from filling the memory or the disk.
const MAX_IMPORT_ZIP_BYTES: usize = 32 * 1024 * 1024;
const MAX_IMPORT_ENTRIES: usize = 2_000;
const MAX_IMPORT_FILES: usize = 300;
const MAX_OPTION_FILE_BYTES: u64 = 4 * 1024 * 1024;
const MAX_IMPORT_TOTAL_BYTES: u64 = 32 * 1024 * 1024;

/// Whether `bytes` look like an option file: text (UTF-8, optionally with a BOM, no NUL byte), and
/// XML for .binds and .xml files. A .start file holds preset names, one per line.
fn looks_like_option_file(name: &str, bytes: &[u8]) -> bool {
    let Ok(text) = std::str::from_utf8(bytes) else {
        return false;
    };
    if text.contains('\0') {
        return false;
    }
    let text = text.trim_start_matches('\u{feff}').trim_start();
    let lower = name.to_lowercase();
    if lower.ends_with(".binds") || lower.ends_with(".xml") {
        return text.starts_with('<');
    }
    true
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

/// An option file found in an imported zip: its folder ("Bindings"), name and content.
type ImportedFile = (String, String, Vec<u8>);

/// Reads and checks an imported zip without writing anything: the option files it holds, and the
/// entries left out (other files, duplicates, files too big, or that aren't option files).
fn read_import_archive(data: Vec<u8>) -> Result<(Vec<ImportedFile>, Vec<String>), String> {
    use std::io::Read as _;
    if data.len() > MAX_IMPORT_ZIP_BYTES {
        return Err("zipTooLarge".into());
    }
    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(data)).map_err(|e| format!("unreadableZip: {e}"))?;
    if archive.len() > MAX_IMPORT_ENTRIES {
        return Err("zipTooLarge".into());
    }
    let mut files: Vec<ImportedFile> = Vec::new();
    let mut skipped = Vec::new();
    let mut total: u64 = 0;
    for i in 0..archive.len() {
        let entry = archive.by_index(i).map_err(|e| format!("unreadableZip: {e}"))?;
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
        let Some((folder, name)) =
            pair.filter(|(folder, name)| parts.last() == Some(&name.as_str()) && allowed_option_file(folder, name))
        else {
            skipped.push(full);
            continue;
        };
        // The same file twice (in two folders of the archive): the first one wins.
        let duplicate = files
            .iter()
            .any(|(f, n, _)| *f == folder && n.eq_ignore_ascii_case(&name));
        if duplicate || entry.size() > MAX_OPTION_FILE_BYTES {
            skipped.push(full);
            continue;
        }
        // The size written in the archive can lie: the reading itself is capped.
        let mut bytes = Vec::new();
        entry
            .take(MAX_OPTION_FILE_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|e| format!("unreadableZip: {e}"))?;
        total += bytes.len() as u64;
        if total > MAX_IMPORT_TOTAL_BYTES || files.len() >= MAX_IMPORT_FILES {
            return Err("zipTooLarge".into());
        }
        if bytes.len() as u64 > MAX_OPTION_FILE_BYTES || !looks_like_option_file(&name, &bytes) {
            skipped.push(full);
            continue;
        }
        files.push((folder, name, bytes));
    }
    if files.is_empty() {
        return Err("zipWithoutSettings".into());
    }
    Ok((files, skipped))
}

/// Restores a zip made by export_config (or any zip with Bindings/ and Graphics/ entries).
/// Everything is checked before anything is written (sizes, names, contents, duplicates), the
/// current configuration is backed up, and the files are written aside first then moved in place:
/// a failure on the way leaves the configuration as it was.
#[tauri::command]
pub fn import_config(data: Vec<u8>) -> Result<ImportReport, String> {
    let (files, skipped) = read_import_archive(data)?;
    let backup = documents_dir()
        .join("sauvegardes")
        .join(format!("avant-import-{}.zip", unix_secs(SystemTime::now())));
    write_zip(&backup, &OPTION_FOLDERS)?;

    // Every file is written aside first; only when all of them are there are they moved in place.
    let root = options_root()?;
    let mut staged: Vec<(PathBuf, PathBuf, String)> = Vec::new();
    let remove_staged = |staged: &[(PathBuf, PathBuf, String)]| {
        for (temporary, _, _) in staged {
            let _ = fs::remove_file(temporary);
        }
    };
    for (folder, name, bytes) in files {
        let dir = root.join(&folder);
        let temporary = dir.join(format!("{name}.edch-import"));
        let written = fs::create_dir_all(&dir).and_then(|_| fs::write(&temporary, bytes));
        if let Err(error) = written {
            let _ = fs::remove_file(&temporary);
            remove_staged(&staged);
            return Err(error.to_string());
        }
        staged.push((temporary, dir.join(&name), format!("{folder}/{name}")));
    }
    let mut written = Vec::new();
    for (index, (temporary, target, label)) in staged.iter().enumerate() {
        if fs::rename(temporary, target).is_err() {
            remove_staged(&staged[index..]);
            // Some files were already replaced: the backup made above holds the previous ones.
            return Err(format!("importIncomplete: {}", backup.to_string_lossy()));
        }
        written.push(label.clone());
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
    let valid_content = content.len() as u64 <= MAX_OPTION_FILE_BYTES
        && looks_like_option_file(&name, content.as_bytes())
        && content.contains(&format!("PresetName=\"{preset}\""))
        && content.contains("<Root");
    if !valid_name || !valid_content {
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

#[cfg(test)]
mod tests {
    use super::{allowed_option_file, looks_like_option_file, read_import_archive, MAX_OPTION_FILE_BYTES};
    use std::io::Write as _;

    /// A zip holding `entries` (name, content), compressed.
    fn zip_of(entries: &[(&str, Vec<u8>)]) -> Vec<u8> {
        let mut zip = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
        let options = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        for (name, content) in entries {
            zip.start_file(*name, options).unwrap();
            zip.write_all(content).unwrap();
        }
        zip.finish().unwrap().into_inner()
    }

    #[test]
    fn hostile_archives() {
        let binds = b"\xef\xbb\xbf<?xml version=\"1.0\"?><Root PresetName=\"Custom\"/>".to_vec();
        // A file that expands far beyond the limit (a "zip bomb") is left out, not read whole.
        let bomb = vec![b'<'; (MAX_OPTION_FILE_BYTES * 2) as usize];
        let data = zip_of(&[
            ("Options/Bindings/Custom.4.2.binds", binds.clone()),
            ("Bindings/Custom.4.2.binds", binds.clone()),
            ("Bindings/Huge.4.2.binds", bomb),
            ("Bindings/Program.4.2.binds", b"MZ\x90\x00binary".to_vec()),
            ("Bindings/../../evil.binds", binds.clone()),
            ("Graphics/readme.txt", b"hello".to_vec()),
        ]);
        let (files, skipped) = read_import_archive(data).unwrap();
        assert_eq!(files.len(), 1);
        assert_eq!(
            (files[0].0.as_str(), files[0].1.as_str()),
            ("Bindings", "Custom.4.2.binds")
        );
        assert_eq!(skipped.len(), 5);
        // Nothing usable, or not a zip at all: refused.
        assert_eq!(
            read_import_archive(zip_of(&[("x.txt", b"x".to_vec())])).unwrap_err(),
            "zipWithoutSettings"
        );
        assert!(read_import_archive(b"not a zip".to_vec())
            .unwrap_err()
            .starts_with("unreadableZip"));
    }

    #[test]
    fn option_file_names() {
        assert!(allowed_option_file("Bindings", "Custom.4.2.binds"));
        assert!(allowed_option_file("Bindings", "StartPreset.4.start"));
        assert!(allowed_option_file("Graphics", "Settings.xml"));
        for refused in [
            "../x.binds",
            "a/b.binds",
            "a\\b.binds",
            "x.binds:stream",
            "CON.binds",
            "lpt1.4.binds",
            ".hidden.binds",
            "x.exe",
            "",
        ] {
            assert!(!allowed_option_file("Bindings", refused), "{refused}");
        }
        assert!(!allowed_option_file("Graphics", "x.binds"));
        assert!(!allowed_option_file("Other", "x.binds"));
    }

    #[test]
    fn option_file_contents() {
        assert!(looks_like_option_file(
            "x.binds",
            "\u{feff}<?xml version=\"1.0\"?><Root/>".as_bytes()
        ));
        assert!(looks_like_option_file("x.start", b"Custom\nCustom\n"));
        assert!(!looks_like_option_file("x.binds", b"MZ\x90\x00"));
        assert!(!looks_like_option_file("x.binds", b"not xml"));
        assert!(!looks_like_option_file("x.start", b"a\0b"));
    }
}

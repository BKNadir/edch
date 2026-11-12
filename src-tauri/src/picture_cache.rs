//! Controller pictures kept on the PC (Controls page). The UI downloads an EDRefCard template once
//! and hands it here; it is saved unchanged (full quality) in EDCH's folder, next to the logs, and
//! read back instead of downloading it again. Only JPEG pictures with a template's name are kept.

use std::fs;
use std::path::PathBuf;

/// Largest picture accepted (the templates are about 1.3 MB).
const MAX_PICTURE_BYTES: usize = 8 * 1024 * 1024;

/// The folder of the kept pictures: `…/EDCompanionHelper/controller-pictures`.
fn folder() -> PathBuf {
    let logs = crate::logs::dir();
    let base = logs.parent().map(PathBuf::from).unwrap_or_else(|| logs.clone());
    base.join("controller-pictures")
}

/// The file of a template's picture ("x52pro" → `x52pro.jpg`). Only letters, digits and dashes
/// are accepted, so a name can never point outside the folder.
fn picture_file(name: &str) -> Result<PathBuf, String> {
    let valid = !name.is_empty() && name.len() <= 64 && name.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-');
    if !valid {
        return Err("badPictureName".into());
    }
    Ok(folder().join(format!("{name}.jpg")))
}

/// The kept picture of a template, as raw bytes ("notCached" when it isn't kept yet).
#[tauri::command]
pub fn picture_cache_read(name: String) -> Result<tauri::ipc::Response, String> {
    let bytes = fs::read(picture_file(&name)?).map_err(|_| "notCached".to_string())?;
    Ok(tauri::ipc::Response::new(bytes))
}

/// Keeps a template's picture, unchanged. Written to a temporary file first, so a half-written
/// picture is never read back.
#[tauri::command]
pub fn picture_cache_write(name: String, data: Vec<u8>) -> Result<(), String> {
    // A JPEG starts with FF D8.
    if data.len() > MAX_PICTURE_BYTES || !data.starts_with(&[0xFF, 0xD8]) {
        return Err("notAPicture".into());
    }
    let path = picture_file(&name)?;
    fs::create_dir_all(folder()).map_err(|e| e.to_string())?;
    let temporary = path.with_extension("jpg.part");
    fs::write(&temporary, &data).map_err(|e| e.to_string())?;
    fs::rename(&temporary, &path).map_err(|e| e.to_string())?;
    Ok(())
}

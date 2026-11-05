//! Where the game keeps its files: the Proton prefixes on Linux (Steam, Flatpak, Snap and every
//! Steam library), and EDCH's own folder in Documents.

#[cfg(target_os = "linux")]
use std::fs;
use std::path::{Path, PathBuf};

/// Linux: the "steamuser" folders of Elite Dangerous's Proton prefixes (app 359320), in every
/// Steam install (native, Flatpak, Snap) and every Steam library.
#[cfg(target_os = "linux")]
pub fn proton_users() -> Vec<PathBuf> {
    let Ok(home) = std::env::var("HOME") else {
        return Vec::new();
    };
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

/// Documents\\EDCH: configuration exports and their backups.
pub fn documents_dir() -> PathBuf {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".into());
    Path::new(&home).join("Documents").join("EDCH")
}

//! Where the game keeps its files: the Proton prefixes on Linux (Steam, Flatpak, Snap and every
//! Steam library), the game's installation (for its default control presets, read-only), and
//! EDCH's own folder in Documents.

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

/// The Steam libraries of the given Steam installs: each install, plus the libraries its
/// libraryfolders.vdf lists (other disks), lines like `"path" "D:\\SteamLibrary"`.
fn steam_libraries(steam_installs: &[PathBuf]) -> Vec<PathBuf> {
    let mut libraries: Vec<PathBuf> = Vec::new();
    for install in steam_installs.iter().filter(|install| install.is_dir()) {
        libraries.push(install.clone());
        if let Ok(text) = fs::read_to_string(install.join("steamapps").join("libraryfolders.vdf")) {
            for line in text.lines() {
                let parts: Vec<&str> = line.split('"').collect();
                if parts.len() >= 4 && parts[1] == "path" {
                    libraries.push(PathBuf::from(parts[3].replace("\\\\", "\\")));
                }
            }
        }
    }
    libraries
}

/// Windows: where Steam is installed, from the registry (HKCU\Software\Valve\Steam, SteamPath).
#[cfg(target_os = "windows")]
fn steam_path_from_registry() -> Option<PathBuf> {
    use windows_sys::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_SZ};
    let wide = |text: &str| text.encode_utf16().chain(std::iter::once(0)).collect::<Vec<u16>>();
    let key = wide("Software\\Valve\\Steam");
    let value = wide("SteamPath");
    let mut buffer = [0u16; 1024];
    let mut size = (buffer.len() * 2) as u32;
    // SAFETY: the key and value names are NUL-terminated UTF-16 strings that outlive the call, and
    // the buffer's size in bytes is passed with it.
    let status = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            key.as_ptr(),
            value.as_ptr(),
            RRF_RT_REG_SZ,
            std::ptr::null_mut(),
            buffer.as_mut_ptr().cast(),
            &mut size,
        )
    };
    if status != 0 {
        return None;
    }
    let length = buffer.iter().position(|&c| c == 0).unwrap_or(buffer.len());
    Some(PathBuf::from(String::from_utf16_lossy(&buffer[..length])))
}

/// Folders that may hold the game ("…\Elite Dangerous", the one with "Products" in it).
fn game_install_candidates(launcher_hint: &str) -> Vec<PathBuf> {
    let mut steam_installs: Vec<PathBuf> = Vec::new();
    let mut games: Vec<PathBuf> = Vec::new();
    #[cfg(target_os = "windows")]
    {
        if let Some(steam) = steam_path_from_registry() {
            steam_installs.push(steam);
        }
        for variable in ["ProgramFiles(x86)", "ProgramFiles"] {
            if let Ok(base) = std::env::var(variable) {
                steam_installs.push(Path::new(&base).join("Steam"));
                games.push(Path::new(&base).join("Frontier"));
                games.push(Path::new(&base).join("Epic Games").join("EliteDangerous"));
            }
        }
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            games.push(Path::new(&local).join("Frontier_Developments"));
        }
        // Epic: each installed game has a manifest with its InstallLocation.
        if let Ok(data) = std::env::var("ProgramData") {
            let manifests = Path::new(&data)
                .join("Epic")
                .join("EpicGamesLauncher")
                .join("Data")
                .join("Manifests");
            for entry in fs::read_dir(manifests).into_iter().flatten().flatten() {
                let Ok(text) = fs::read_to_string(entry.path()) else {
                    continue;
                };
                let Ok(manifest) = serde_json::from_str::<serde_json::Value>(&text) else {
                    continue;
                };
                let name = manifest["DisplayName"].as_str().unwrap_or_default().to_lowercase();
                if let Some(location) = manifest["InstallLocation"].as_str().filter(|_| name.contains("elite")) {
                    games.push(PathBuf::from(location));
                }
            }
        }
    }
    #[cfg(target_os = "linux")]
    if let Ok(home) = std::env::var("HOME") {
        for root in [
            ".local/share/Steam",
            ".steam/steam",
            ".steam/root",
            ".var/app/com.valvesoftware.Steam/.local/share/Steam",
            "snap/steam/common/.local/share/Steam",
        ] {
            steam_installs.push(Path::new(&home).join(root));
        }
    }
    for library in steam_libraries(&steam_installs) {
        games.push(library.join("steamapps").join("common").join("Elite Dangerous"));
    }
    // The launcher chosen in Settings (EDLaunch.exe sits in the game's folder) and the folders above it.
    let mut hint = Path::new(launcher_hint).parent();
    for _ in 0..3 {
        let Some(folder) = hint else {
            break;
        };
        games.push(folder.to_path_buf());
        hint = folder.parent();
    }
    games
}

/// The game's folders of default control presets (`…\Products\<product>\ControlSchemes`), the
/// Odyssey product first. Read-only: EDCH never writes there.
pub fn control_schemes_dirs(launcher_hint: &str) -> Vec<PathBuf> {
    let mut found: Vec<PathBuf> = Vec::new();
    for game in game_install_candidates(launcher_hint) {
        for product in fs::read_dir(game.join("Products")).into_iter().flatten().flatten() {
            let schemes = product.path().join("ControlSchemes");
            let is_game = product
                .file_name()
                .to_string_lossy()
                .to_lowercase()
                .contains("elite-dangerous");
            if is_game && schemes.is_dir() && !found.contains(&schemes) {
                found.push(schemes);
            }
        }
    }
    found.sort_by_key(|folder| !folder.to_string_lossy().to_lowercase().contains("odyssey"));
    found
}

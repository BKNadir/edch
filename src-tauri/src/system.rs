//! Small system services: portable build detection, update mode, clipboard, opening links and
//! files, and the language chosen in the Windows installer.

use std::path::PathBuf;

/// Portable build: an exe named "...portable..." or a "portable" file next to it.
/// It is never installed, so updates only point to the release page.
pub fn portable() -> bool {
    let Ok(exe) = std::env::current_exe() else { return false };
    let named = exe
        .file_name()
        .map(|n| n.to_string_lossy().to_lowercase().contains("portable"))
        .unwrap_or(false);
    named
        || exe
            .parent()
            .is_some_and(|d| d.join("portable").exists() || d.join("edch.portable").exists())
}

/// Puts text on this PC's clipboard (a system name clicked on a phone, to paste in the game).
#[tauri::command]
pub async fn clipboard_write(text: String) -> Result<(), String> {
    if text.len() > 2000 {
        return Err("textTooLong".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
        clipboard.set_text(text).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn is_portable() -> bool {
    portable()
}

#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    if !url.starts_with("https://") {
        return Err("httpsOnly".into());
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

/// How this build updates: "installer" (Windows setup), "portable" (Windows, no installer),
/// "linux" or "macos" (both: the release page opens).
#[tauri::command]
pub fn update_mode() -> &'static str {
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

/// Shows a file in Explorer (or opens its folder elsewhere).
#[tauri::command]
pub fn reveal_path(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err("fileNotFound".into());
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
pub fn installer_language() -> Option<u32> {
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

//! EDOMH links (`edomh://edsy/?…`, `edomh://coriolis/?…`): EDSY's and Coriolis's "Export to
//! EDOMH" buttons open them. When the user turns it on (Settings), EDCH registers itself as the
//! handler of these links for the current user only, so a click opens EDCH; the page decodes the
//! build and asks before adding it to the wishlist. This module only passes the link's text on.
//!
//! Registering replaces Odyssey Materials Helper as the handler if it is installed: turning the
//! option off removes EDCH's registration only (never another app's), which gives the links back
//! to the app registered before (on Windows, a machine-wide EDOMH install shows through again).

use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

const SCHEME: &str = "edomh";
/// A build link is a few kilobytes; anything bigger isn't one.
const MAX_LINK_LEN: usize = 64 * 1024;

/// The link EDCH was started with (the first click when EDCH wasn't running), until the page asks.
static LAUNCH_LINK: Mutex<Option<String>> = Mutex::new(None);

/// The first argument that is an EDOMH link of a sane size, without control characters.
pub fn link_in(args: &[String]) -> Option<String> {
    args.iter()
        .map(|arg| arg.trim())
        .find(|arg| {
            arg.len() > SCHEME.len() + 3
                && arg.len() <= MAX_LINK_LEN
                && arg[..SCHEME.len() + 3].eq_ignore_ascii_case("edomh://")
                && !arg.chars().any(char::is_control)
        })
        .map(str::to_string)
}

/// At start-up: keeps the link EDCH was opened with, if any.
pub fn remember_launch_link() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if let Some(link) = link_in(&args) {
        if let Ok(mut slot) = LAUNCH_LINK.lock() {
            *slot = Some(link);
        }
    }
}

/// The link EDCH was started with, once (the page asks when it is ready).
#[tauri::command]
pub fn take_launch_link() -> Option<String> {
    LAUNCH_LINK.lock().ok().and_then(|mut slot| slot.take())
}

/// A second launch with a link (EDCH already running): hands the link to the page.
pub fn forward(app: &AppHandle, args: &[String]) {
    if let Some(link) = link_in(args) {
        crate::logs::info("edomh", "EDOMH link received");
        let _ = app.emit("edomh-link", link);
    }
}

/// Who opens EDOMH links: "ours", "other" (another app, Odyssey Materials Helper most likely),
/// "none", or "unsupported" (a system or package where EDCH can't register, like Flatpak).
#[tauri::command]
pub fn edomh_handler_status() -> &'static str {
    platform::status()
}

/// Registers EDCH as the handler of EDOMH links (`enabled`), or removes its registration.
/// Returns the new status.
#[tauri::command]
pub fn set_edomh_handler(enabled: bool) -> Result<&'static str, String> {
    if enabled {
        platform::register()?;
    } else if platform::status() == "ours" {
        platform::unregister()?;
    }
    crate::logs::info("edomh", if enabled { "EDOMH links: on" } else { "EDOMH links: off" });
    Ok(platform::status())
}

#[cfg(target_os = "windows")]
mod platform {
    //! HKCU\Software\Classes\edomh: the current user's handler, no administrator rights needed.
    use windows_sys::Win32::System::Registry::{
        RegDeleteTreeW, RegGetValueW, RegSetKeyValueW, HKEY, HKEY_CLASSES_ROOT, HKEY_CURRENT_USER, REG_SZ,
        RRF_RT_REG_SZ,
    };

    const KEY: &str = "Software\\Classes\\edomh";
    const COMMAND_KEY: &str = "Software\\Classes\\edomh\\shell\\open\\command";

    fn wide(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(std::iter::once(0)).collect()
    }

    fn exe() -> Result<String, String> {
        std::env::current_exe()
            .map(|path| path.to_string_lossy().into_owned())
            .map_err(|_| "fileNotFound".to_string())
    }

    /// A string value of a key under `root` ("" for the key's default value).
    fn read(root: HKEY, key: &str, value: &str) -> Option<String> {
        let key = wide(key);
        let value = wide(value);
        let mut buffer = vec![0u16; 2048];
        let mut size = (buffer.len() * 2) as u32;
        // SAFETY: NUL-terminated UTF-16 names that outlive the call; the buffer's size in bytes
        // is passed with it.
        let status = unsafe {
            RegGetValueW(
                root,
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
        Some(String::from_utf16_lossy(&buffer[..length]))
    }

    /// Sets a string value of `key` under HKCU ("" for the default value), creating the key.
    fn write(key: &str, value: &str, data: &str) -> Result<(), String> {
        let key = wide(key);
        let value = wide(value);
        let data = wide(data);
        // SAFETY: NUL-terminated UTF-16 strings that outlive the call; the data's size in bytes
        // (with its NUL) is passed with it.
        let status = unsafe {
            RegSetKeyValueW(
                HKEY_CURRENT_USER,
                key.as_ptr(),
                value.as_ptr(),
                REG_SZ,
                data.as_ptr().cast(),
                (data.len() * 2) as u32,
            )
        };
        if status == 0 {
            Ok(())
        } else {
            Err("accessDenied".to_string())
        }
    }

    pub fn status() -> &'static str {
        // HKEY_CLASSES_ROOT merges the user's and the machine's handlers, like Windows does.
        match read(HKEY_CLASSES_ROOT, "edomh\\shell\\open\\command", "") {
            None => "none",
            Some(command) => match exe() {
                Ok(exe) if command.to_lowercase().contains(&exe.to_lowercase()) => "ours",
                _ => "other",
            },
        }
    }

    pub fn register() -> Result<(), String> {
        let exe = exe()?;
        write(KEY, "", "URL:EDOMH link")?;
        write(KEY, "URL Protocol", "")?;
        write(COMMAND_KEY, "", &format!("\"{exe}\" \"%1\""))
    }

    pub fn unregister() -> Result<(), String> {
        // Only the user's own key: a machine-wide handler (EDOMH's installer) is left alone.
        if read(HKEY_CURRENT_USER, COMMAND_KEY, "").is_none() {
            return Ok(());
        }
        let key = wide(KEY);
        // SAFETY: a NUL-terminated UTF-16 key name that outlives the call.
        let status = unsafe { RegDeleteTreeW(HKEY_CURRENT_USER, key.as_ptr()) };
        if status == 0 {
            Ok(())
        } else {
            Err("accessDenied".to_string())
        }
    }
}

#[cfg(target_os = "linux")]
mod platform {
    //! A desktop entry in ~/.local/share/applications and `xdg-mime` for the link type. Not in a
    //! Flatpak sandbox (its links are declared by the package).
    use std::path::PathBuf;
    use std::process::Command;

    const DESKTOP_FILE: &str = "edch-edomh.desktop";
    const MIME: &str = "x-scheme-handler/edomh";

    fn applications_dir() -> Option<PathBuf> {
        let data = std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".local/share")))?;
        Some(data.join("applications"))
    }

    fn supported() -> bool {
        std::env::var_os("FLATPAK_ID").is_none() && Command::new("xdg-mime").arg("--version").output().is_ok()
    }

    /// The program to start: the AppImage itself when running from one, else this executable.
    fn program() -> Result<String, String> {
        if let Some(appimage) = std::env::var_os("APPIMAGE") {
            return Ok(appimage.to_string_lossy().into_owned());
        }
        std::env::current_exe()
            .map(|path| path.to_string_lossy().into_owned())
            .map_err(|_| "fileNotFound".to_string())
    }

    /// Quotes a path for a desktop entry's Exec line.
    pub(super) fn quoted(path: &str) -> String {
        let mut out = String::from("\"");
        for c in path.chars() {
            if matches!(c, '"' | '`' | '$' | '\\') {
                out.push('\\');
            }
            out.push(c);
        }
        out.push('"');
        out
    }

    pub fn status() -> &'static str {
        if !supported() {
            return "unsupported";
        }
        let answer = Command::new("xdg-mime").args(["query", "default", MIME]).output();
        match answer.map(|out| String::from_utf8_lossy(&out.stdout).trim().to_string()) {
            Ok(name) if name == DESKTOP_FILE => "ours",
            Ok(name) if name.is_empty() => "none",
            _ => "other",
        }
    }

    pub fn register() -> Result<(), String> {
        if !supported() {
            return Err("unsupported".to_string());
        }
        let dir = applications_dir().ok_or("fileNotFound")?;
        std::fs::create_dir_all(&dir).map_err(|_| "accessDenied".to_string())?;
        let entry = format!(
            "[Desktop Entry]\nType=Application\nName=EDCH (EDOMH links)\nExec={} %u\nTerminal=false\nNoDisplay=true\nMimeType={MIME};\n",
            quoted(&program()?)
        );
        std::fs::write(dir.join(DESKTOP_FILE), entry).map_err(|_| "accessDenied".to_string())?;
        let done = Command::new("xdg-mime").args(["default", DESKTOP_FILE, MIME]).status();
        let _ = Command::new("update-desktop-database").arg(&dir).status();
        match done {
            Ok(status) if status.success() => Ok(()),
            _ => Err("accessDenied".to_string()),
        }
    }

    pub fn unregister() -> Result<(), String> {
        let dir = applications_dir().ok_or("fileNotFound")?;
        let _ = std::fs::remove_file(dir.join(DESKTOP_FILE));
        let _ = Command::new("update-desktop-database").arg(&dir).status();
        Ok(())
    }
}

#[cfg(not(any(target_os = "windows", target_os = "linux")))]
mod platform {
    pub fn status() -> &'static str {
        "unsupported"
    }
    pub fn register() -> Result<(), String> {
        Err("unsupported".to_string())
    }
    pub fn unregister() -> Result<(), String> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_only_sane_edomh_links() {
        let args = |list: &[&str]| list.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert_eq!(
            link_in(&args(&["--flag", "edomh://edsy/?eJzt"])),
            Some("edomh://edsy/?eJzt".to_string())
        );
        assert_eq!(
            link_in(&args(&["EDOMH://coriolis/?abc"])),
            Some("EDOMH://coriolis/?abc".to_string())
        );
        assert_eq!(link_in(&args(&["https://edsy.org"])), None);
        assert_eq!(link_in(&args(&["edomh://"])), None);
        assert_eq!(link_in(&args(&["edomh://edsy/?a\nb"])), None);
        let huge = format!("edomh://edsy/?{}", "a".repeat(MAX_LINK_LEN));
        assert_eq!(link_in(&args(&[&huge])), None);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn quotes_exec_paths() {
        assert_eq!(platform::quoted("/opt/My App/edch"), "\"/opt/My App/edch\"");
        assert_eq!(platform::quoted("/a\"b$c"), "\"/a\\\"b\\$c\"");
    }
}

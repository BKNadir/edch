//! Links that open EDCH, of two kinds:
//!
//! - EDOMH links (`edomh://edsy/?…`, `edomh://coriolis/?…`): EDSY's and Coriolis's "Export to
//!   EDOMH" buttons open them. When the user turns it on (Settings), EDCH registers itself as the
//!   handler of these links, so a click opens EDCH; the page decodes the build and asks before
//!   adding it to the wishlist. Registering replaces Odyssey Materials Helper as the handler if it
//!   is installed: turning the option off removes EDCH's registration only (never another app's),
//!   which gives the links back to the app registered before (on Windows, a machine-wide EDOMH
//!   install shows through again).
//! - EDCH links (`edch://frontier/?code=…&state=…`): the return of the Frontier login. Frontier
//!   sends the player to EDCH's return page (GitHub Pages), which opens this link; EDCH registers
//!   itself for its own links when a login starts.
//!
//! Registration is for the current user only. This module only passes the link's text on: the
//! page reads it.

use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

/// A kind of link EDCH can open.
pub struct LinkKind {
    /// The link's scheme, before "://".
    scheme: &'static str,
    /// Its name in the system's list of link handlers.
    label: &'static str,
    /// The Linux desktop entry that declares EDCH as its handler.
    desktop_file: &'static str,
    /// The event that hands a link to the page.
    event: &'static str,
    /// The longest link of this kind; anything bigger isn't one.
    max_len: usize,
}

/// Builds from EDSY and Coriolis: a few kilobytes.
const EDOMH: LinkKind = LinkKind {
    scheme: "edomh",
    label: "EDOMH link",
    desktop_file: "edch-edomh.desktop",
    event: "edomh-link",
    max_len: 64 * 1024,
};

/// The Frontier login's return: a one-time code and a state, well under a kilobyte each.
const EDCH: LinkKind = LinkKind {
    scheme: "edch",
    label: "EDCH link",
    desktop_file: "edch-links.desktop",
    event: "edch-link",
    max_len: 4 * 1024,
};

/// The link EDCH was started with (the first click on an EDOMH link when EDCH wasn't running),
/// until the page asks. A Frontier login always starts from a running EDCH, so its links don't
/// need this.
static LAUNCH_LINK: Mutex<Option<String>> = Mutex::new(None);

/// The first argument that is a link of `kind`, of a sane size, without control characters.
fn link_in(args: &[String], kind: &LinkKind) -> Option<String> {
    let prefix = format!("{}://", kind.scheme);
    args.iter()
        .map(|arg| arg.trim())
        .find(|arg| {
            arg.len() > prefix.len()
                && arg.len() <= kind.max_len
                && arg.is_char_boundary(prefix.len())
                && arg[..prefix.len()].eq_ignore_ascii_case(&prefix)
                && !arg.chars().any(char::is_control)
        })
        .map(str::to_string)
}

/// At start-up: keeps the EDOMH link EDCH was opened with, if any.
pub fn remember_launch_link() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if let Some(link) = link_in(&args, &EDOMH) {
        if let Ok(mut slot) = LAUNCH_LINK.lock() {
            *slot = Some(link);
        }
    }
}

/// The EDOMH link EDCH was started with, once (the page asks when it is ready).
#[tauri::command]
pub fn take_launch_link() -> Option<String> {
    LAUNCH_LINK.lock().ok().and_then(|mut slot| slot.take())
}

/// A second launch with a link (EDCH already running): hands the link to the page.
pub fn forward(app: &AppHandle, args: &[String]) {
    for kind in [&EDOMH, &EDCH] {
        if let Some(link) = link_in(args, kind) {
            // Never the link itself in the log: a Frontier code is a credential while it lasts.
            crate::logs::info("links", &format!("{} received", kind.label));
            let _ = app.emit(kind.event, link);
        }
    }
}

/// Who opens EDOMH links: "ours", "other" (another app, Odyssey Materials Helper most likely),
/// "none", or "unsupported" (a system or package where EDCH can't register, like Flatpak).
#[tauri::command]
pub fn edomh_handler_status() -> &'static str {
    platform::status(&EDOMH)
}

/// Registers EDCH as the handler of EDOMH links (`enabled`), or removes its registration.
/// Returns the new status.
#[tauri::command]
pub fn set_edomh_handler(enabled: bool) -> Result<&'static str, String> {
    if enabled {
        platform::register(&EDOMH)?;
    } else if platform::status(&EDOMH) == "ours" {
        platform::unregister(&EDOMH)?;
    }
    crate::logs::info("links", if enabled { "EDOMH links: on" } else { "EDOMH links: off" });
    Ok(platform::status(&EDOMH))
}

/// Makes sure EDCH opens its own links (before a Frontier login). Returns the status, as for
/// EDOMH links: "unsupported" means the login's code has to be pasted by hand.
#[tauri::command]
pub fn register_edch_links() -> &'static str {
    if platform::status(&EDCH) != "ours" && platform::register(&EDCH).is_err() {
        crate::logs::warn("links", "EDCH links couldn't be registered");
    }
    platform::status(&EDCH)
}

#[cfg(target_os = "windows")]
mod platform {
    //! HKCU\Software\Classes\<scheme>: the current user's handler, no administrator rights needed.
    use super::LinkKind;
    use windows_sys::Win32::System::Registry::{
        RegDeleteTreeW, RegGetValueW, RegSetKeyValueW, HKEY, HKEY_CLASSES_ROOT, HKEY_CURRENT_USER, REG_SZ,
        RRF_RT_REG_SZ,
    };

    fn wide(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(std::iter::once(0)).collect()
    }

    fn exe() -> Result<String, String> {
        std::env::current_exe()
            .map(|path| path.to_string_lossy().into_owned())
            .map_err(|_| "fileNotFound".to_string())
    }

    /// The user's key for the scheme, and the key of the command that opens its links.
    fn keys(kind: &LinkKind) -> (String, String) {
        let key = format!("Software\\Classes\\{}", kind.scheme);
        let command = format!("{key}\\shell\\open\\command");
        (key, command)
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

    pub fn status(kind: &LinkKind) -> &'static str {
        // HKEY_CLASSES_ROOT merges the user's and the machine's handlers, like Windows does.
        match read(HKEY_CLASSES_ROOT, &format!("{}\\shell\\open\\command", kind.scheme), "") {
            None => "none",
            Some(command) => match exe() {
                Ok(exe) if command.to_lowercase().contains(&exe.to_lowercase()) => "ours",
                _ => "other",
            },
        }
    }

    pub fn register(kind: &LinkKind) -> Result<(), String> {
        let exe = exe()?;
        let (key, command) = keys(kind);
        write(&key, "", &format!("URL:{}", kind.label))?;
        write(&key, "URL Protocol", "")?;
        write(&command, "", &format!("\"{exe}\" \"%1\""))
    }

    pub fn unregister(kind: &LinkKind) -> Result<(), String> {
        let (key, command) = keys(kind);
        // Only the user's own key: a machine-wide handler (EDOMH's installer) is left alone.
        if read(HKEY_CURRENT_USER, &command, "").is_none() {
            return Ok(());
        }
        let key = wide(&key);
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
    use super::LinkKind;
    use std::path::PathBuf;
    use std::process::Command;

    fn mime(kind: &LinkKind) -> String {
        format!("x-scheme-handler/{}", kind.scheme)
    }

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

    pub fn status(kind: &LinkKind) -> &'static str {
        if !supported() {
            return "unsupported";
        }
        let answer = Command::new("xdg-mime")
            .args(["query", "default", &mime(kind)])
            .output();
        match answer.map(|out| String::from_utf8_lossy(&out.stdout).trim().to_string()) {
            Ok(name) if name == kind.desktop_file => "ours",
            Ok(name) if name.is_empty() => "none",
            _ => "other",
        }
    }

    pub fn register(kind: &LinkKind) -> Result<(), String> {
        if !supported() {
            return Err("unsupported".to_string());
        }
        let dir = applications_dir().ok_or("fileNotFound")?;
        std::fs::create_dir_all(&dir).map_err(|_| "accessDenied".to_string())?;
        let entry = format!(
            "[Desktop Entry]\nType=Application\nName=EDCH ({})\nExec={} %u\nTerminal=false\nNoDisplay=true\nMimeType={};\n",
            kind.label,
            quoted(&program()?),
            mime(kind)
        );
        std::fs::write(dir.join(kind.desktop_file), entry).map_err(|_| "accessDenied".to_string())?;
        let done = Command::new("xdg-mime")
            .args(["default", kind.desktop_file, &mime(kind)])
            .status();
        let _ = Command::new("update-desktop-database").arg(&dir).status();
        match done {
            Ok(status) if status.success() => Ok(()),
            _ => Err("accessDenied".to_string()),
        }
    }

    pub fn unregister(kind: &LinkKind) -> Result<(), String> {
        let dir = applications_dir().ok_or("fileNotFound")?;
        let _ = std::fs::remove_file(dir.join(kind.desktop_file));
        let _ = Command::new("update-desktop-database").arg(&dir).status();
        Ok(())
    }
}

#[cfg(not(any(target_os = "windows", target_os = "linux")))]
mod platform {
    use super::LinkKind;

    pub fn status(_kind: &LinkKind) -> &'static str {
        "unsupported"
    }
    pub fn register(_kind: &LinkKind) -> Result<(), String> {
        Err("unsupported".to_string())
    }
    pub fn unregister(_kind: &LinkKind) -> Result<(), String> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn finds_only_sane_edomh_links() {
        assert_eq!(
            link_in(&args(&["--flag", "edomh://edsy/?eJzt"]), &EDOMH),
            Some("edomh://edsy/?eJzt".to_string())
        );
        assert_eq!(
            link_in(&args(&["EDOMH://coriolis/?abc"]), &EDOMH),
            Some("EDOMH://coriolis/?abc".to_string())
        );
        assert_eq!(link_in(&args(&["https://edsy.org"]), &EDOMH), None);
        assert_eq!(link_in(&args(&["edomh://"]), &EDOMH), None);
        assert_eq!(link_in(&args(&["edomh://edsy/?a\nb"]), &EDOMH), None);
        let huge = format!("edomh://edsy/?{}", "a".repeat(EDOMH.max_len));
        assert_eq!(link_in(&args(&[&huge]), &EDOMH), None);
    }

    #[test]
    fn tells_edch_links_from_edomh_ones() {
        let link = "edch://frontier/?code=abc&state=xyz";
        assert_eq!(link_in(&args(&[link]), &EDCH), Some(link.to_string()));
        assert_eq!(link_in(&args(&[link]), &EDOMH), None);
        assert_eq!(link_in(&args(&["edomh://edsy/?a"]), &EDCH), None);
        let huge = format!("edch://frontier/?code={}", "a".repeat(EDCH.max_len));
        assert_eq!(link_in(&args(&[&huge]), &EDCH), None);
        // A non-ASCII character where the scheme ends doesn't panic.
        assert_eq!(link_in(&args(&["edché://x"]), &EDCH), None);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn quotes_exec_paths() {
        assert_eq!(platform::quoted("/opt/My App/edch"), "\"/opt/My App/edch\"");
        assert_eq!(platform::quoted("/a\"b$c"), "\"/a\\\"b\\$c\"");
    }
}

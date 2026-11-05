//! Desktop behaviour: is Elite Dangerous running, launching it, what closing the window does
//! (quit, minimise, hide in the notification area, or ask first).

use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, WindowEvent};

use crate::logs;

/// quit | minimize | tray | ask
static CLOSE_MODE: Mutex<String> = Mutex::new(String::new());

const GAME_EXES: [&str; 3] = ["elitedangerous64.exe", "edlaunch.exe", "minedlauncher"];

/// Is the game (or its launcher) running? "game", "launcher" or "" (neither).
#[tauri::command]
pub async fn game_running() -> String {
    tauri::async_runtime::spawn_blocking(detect).await.unwrap_or_default()
}

/// Windows: the running processes' executable names, read from a process snapshot (no external
/// program is started, so this costs a few milliseconds).
#[cfg(target_os = "windows")]
fn detect() -> String {
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
    };
    let mut launcher = false;
    // SAFETY: the snapshot handle is checked before use and closed once; PROCESSENTRY32W is a plain
    // C struct whose size is set as the API requires before the first call.
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snapshot == INVALID_HANDLE_VALUE {
            return String::new();
        }
        let mut entry: PROCESSENTRY32W = std::mem::zeroed();
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        let mut more = Process32FirstW(snapshot, &mut entry) != 0;
        while more {
            let len = entry
                .szExeFile
                .iter()
                .position(|&c| c == 0)
                .unwrap_or(entry.szExeFile.len());
            let name = String::from_utf16_lossy(&entry.szExeFile[..len]).to_lowercase();
            match classify(&name) {
                Running::Game => {
                    CloseHandle(snapshot);
                    return "game".into();
                }
                Running::Launcher => launcher = true,
                Running::Nothing => {}
            }
            more = Process32NextW(snapshot, &mut entry) != 0;
        }
        CloseHandle(snapshot);
    }
    if launcher {
        "launcher".into()
    } else {
        String::new()
    }
}

/// Linux (Proton): the Windows exe names show up in the processes' command lines. Stops at the
/// first process that is the game.
#[cfg(not(target_os = "windows"))]
fn detect() -> String {
    let mut launcher = false;
    if let Ok(entries) = std::fs::read_dir("/proc") {
        for entry in entries.flatten() {
            let Ok(cmdline) = std::fs::read(entry.path().join("cmdline")) else {
                continue;
            };
            match classify(&String::from_utf8_lossy(&cmdline).to_lowercase()) {
                Running::Game => return "game".into(),
                Running::Launcher => launcher = true,
                Running::Nothing => {}
            }
        }
    }
    if launcher {
        "launcher".into()
    } else {
        String::new()
    }
}

/// What one process (its lower-case name or command line) is.
enum Running {
    Game,
    Launcher,
    Nothing,
}

fn classify(process: &str) -> Running {
    if process.contains(GAME_EXES[0]) {
        Running::Game
    } else if process.contains(GAME_EXES[1]) || process.contains(GAME_EXES[2]) {
        Running::Launcher
    } else {
        Running::Nothing
    }
}

/// Starts the game: through Steam, Epic, or a launcher the user picked (EDLaunch.exe,
/// MinEdLauncher…). `path` is only used for "exe".
#[tauri::command]
pub fn launch_game(method: String, path: String) -> Result<(), String> {
    let target = match method.as_str() {
        "steam" => "steam://rungameid/359320".to_string(),
        "epic" => {
            "com.epicgames.launcher://apps/9c203b6ed35846e8a4a9ff1e314f6593?action=launch&silent=true".to_string()
        }
        "exe" => {
            let p = std::path::Path::new(&path);
            let ok_ext = p
                .extension()
                .map(|e| e.eq_ignore_ascii_case("exe") || e.eq_ignore_ascii_case("sh") || e.eq_ignore_ascii_case("lnk"))
                .unwrap_or(false)
                || p.file_name()
                    .map(|n| n.to_string_lossy().to_lowercase().contains("minedlauncher"))
                    .unwrap_or(false);
            if !p.is_file() || !ok_ext {
                return Err("launcherNotFound".into());
            }
            logs::info("game", "Launching the game with the chosen launcher");
            let dir = p.parent().map(|d| d.to_path_buf()).unwrap_or_default();
            // A Windows shortcut (.lnk) is opened like a double click.
            if p.extension().map(|e| e.eq_ignore_ascii_case("lnk")).unwrap_or(false) {
                return open_uri(&p.to_string_lossy());
            }
            return std::process::Command::new(p)
                .current_dir(dir)
                .spawn()
                .map(|_| ())
                .map_err(|e| e.to_string());
        }
        _ => return Err("unknownLaunchMethod".into()),
    };
    logs::info("game", &format!("Launching the game through {method}"));
    open_uri(&target)
}

pub fn open_uri(uri: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let result = {
        use std::os::windows::process::CommandExt;
        std::process::Command::new("rundll32")
            .arg("url.dll,FileProtocolHandler")
            .arg(uri)
            .creation_flags(0x0800_0000)
            .spawn()
    };
    #[cfg(target_os = "macos")]
    let result = std::process::Command::new("open").arg(uri).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let result = std::process::Command::new("xdg-open").arg(uri).spawn();
    result.map(|_| ()).map_err(|e| e.to_string())
}

/// Full screen on or off (focus mode).
#[tauri::command]
pub fn set_fullscreen(window: tauri::Window, on: bool) -> Result<(), String> {
    window.set_fullscreen(on).map_err(|e| e.to_string())
}

/// What closing the window does. Creates the notification-area icon when needed.
#[tauri::command]
pub fn set_close_behavior(app: AppHandle, mode: String) -> Result<(), String> {
    let mode = match mode.as_str() {
        "minimize" | "tray" | "ask" => mode,
        _ => "quit".to_string(),
    };
    if mode == "tray" && app.tray_by_id("edch").is_none() {
        if let Err(e) = create_tray(&app) {
            logs::warn("app", &format!("Notification area icon unavailable: {e}"));
        }
    }
    *CLOSE_MODE.lock().map_err(|e| e.to_string())? = mode;
    Ok(())
}

/// Really quits (after the "are you sure?" question, or from the tray menu).
#[tauri::command]
pub fn app_quit(app: AppHandle) {
    app.exit(0);
}

pub fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "EDCH", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit / Quitter", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;
    let mut tray = TrayIconBuilder::with_id("edch").tooltip("EDCH").menu(&menu);
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.on_menu_event(|app, event| match event.id.as_ref() {
        "open" => show_main(app),
        "quit" => app.exit(0),
        _ => {}
    })
    .on_tray_icon_event(|tray, event| {
        if let TrayIconEvent::DoubleClick {
            button: MouseButton::Left,
            ..
        } = event
        {
            show_main(tray.app_handle());
        }
    })
    .build(app)?;
    Ok(())
}

/// The main window's close button, following the chosen behaviour.
pub fn on_window_event(window: &tauri::Window, event: &WindowEvent) {
    let WindowEvent::CloseRequested { api, .. } = event else {
        return;
    };
    let mode = CLOSE_MODE.lock().map(|m| m.clone()).unwrap_or_default();
    match mode.as_str() {
        "minimize" => {
            api.prevent_close();
            let _ = window.minimize();
        }
        "tray" if window.app_handle().tray_by_id("edch").is_some() => {
            api.prevent_close();
            let _ = window.hide();
        }
        "ask" => {
            api.prevent_close();
            let _ = window.emit("confirm-close", ());
        }
        _ => {}
    }
}

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

#[cfg(target_os = "windows")]
fn detect() -> String {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let Ok(out) = std::process::Command::new("tasklist").args(["/FO", "CSV", "/NH"]).creation_flags(CREATE_NO_WINDOW).output() else {
        return String::new();
    };
    classify(&String::from_utf8_lossy(&out.stdout).to_lowercase())
}

#[cfg(not(target_os = "windows"))]
fn detect() -> String {
    // Linux (Proton): the Windows exe names show up in the processes' command lines.
    let mut all = String::new();
    if let Ok(entries) = std::fs::read_dir("/proc") {
        for e in entries.flatten() {
            if let Ok(cmd) = std::fs::read(e.path().join("cmdline")) {
                all.push_str(&String::from_utf8_lossy(&cmd).to_lowercase());
                all.push('\n');
            }
        }
    }
    classify(&all)
}

fn classify(list: &str) -> String {
    if list.contains(GAME_EXES[0]) {
        "game".into()
    } else if list.contains(GAME_EXES[1]) || list.contains(GAME_EXES[2]) {
        "launcher".into()
    } else {
        String::new()
    }
}

/// Starts the game: through Steam, Epic, or a launcher the user picked (EDLaunch.exe,
/// MinEdLauncher…). `path` is only used for "exe".
#[tauri::command]
pub fn launch_game(method: String, path: String) -> Result<(), String> {
    let target = match method.as_str() {
        "steam" => "steam://rungameid/359320".to_string(),
        "epic" => "com.epicgames.launcher://apps/9c203b6ed35846e8a4a9ff1e314f6593?action=launch&silent=true".to_string(),
        "exe" => {
            let p = std::path::Path::new(&path);
            let ok_ext = p.extension().map(|e| e.eq_ignore_ascii_case("exe") || e.eq_ignore_ascii_case("sh") || e.eq_ignore_ascii_case("lnk")).unwrap_or(false)
                || p.file_name().map(|n| n.to_string_lossy().to_lowercase().contains("minedlauncher")).unwrap_or(false);
            if !p.is_file() || !ok_ext {
                return Err("Lanceur introuvable : choisis le fichier dans les Paramètres".into());
            }
            logs::info("game", "Launching the game with the chosen launcher");
            let dir = p.parent().map(|d| d.to_path_buf()).unwrap_or_default();
            // A Windows shortcut (.lnk) is opened like a double click.
            if p.extension().map(|e| e.eq_ignore_ascii_case("lnk")).unwrap_or(false) {
                return open_uri(&p.to_string_lossy());
            }
            return std::process::Command::new(p).current_dir(dir).spawn().map(|_| ()).map_err(|e| e.to_string());
        }
        _ => return Err("Méthode de lancement inconnue".into()),
    };
    logs::info("game", &format!("Launching the game through {method}"));
    open_uri(&target)
}

pub fn open_uri(uri: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let result = {
        use std::os::windows::process::CommandExt;
        std::process::Command::new("rundll32").arg("url.dll,FileProtocolHandler").arg(uri).creation_flags(0x0800_0000).spawn()
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
        if let TrayIconEvent::DoubleClick { button: MouseButton::Left, .. } = event {
            show_main(tray.app_handle());
        }
    })
    .build(app)?;
    Ok(())
}

/// The main window's close button, following the chosen behaviour.
pub fn on_window_event(window: &tauri::Window, event: &WindowEvent) {
    let WindowEvent::CloseRequested { api, .. } = event else { return };
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

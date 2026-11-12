//! Builds without the "hailport" feature (the portable exe): the same commands, which say that
//! Hailport isn't offered, so the UI hides it. No WebSocket code is included.

/// Whether this build offers Hailport: not this one.
#[tauri::command]
pub fn hailport_available() -> bool {
    false
}

#[tauri::command]
pub fn hailport_connect(port: u16) -> Result<u64, String> {
    let _ = port;
    Err("hailportUnavailable".into())
}

#[tauri::command]
pub fn hailport_disconnect() {}

#[tauri::command]
pub fn hailport_send(generation: u64, text: String) -> Result<(), String> {
    let _ = (generation, text);
    Err("hailportUnavailable".into())
}

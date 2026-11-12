// Prevents an additional console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    nvidia_rendering_workaround();
    edch_lib::run()
}

/// Linux with NVIDIA's own driver: WebKitGTK's DMA-BUF renderer can leave the window blank or
/// crash it ("GBM" errors). The usual workaround is turned on before the window is created, unless
/// the user already set the variable themselves (then their choice wins).
#[cfg(target_os = "linux")]
fn nvidia_rendering_workaround() {
    const VARIABLE: &str = "WEBKIT_DISABLE_DMABUF_RENDERER";
    let nvidia_driver = std::path::Path::new("/proc/driver/nvidia/version").exists()
        || std::path::Path::new("/sys/module/nvidia").exists();
    if nvidia_driver && std::env::var_os(VARIABLE).is_none() {
        // Single-threaded here: no other thread reads the environment yet.
        std::env::set_var(VARIABLE, "1");
    }
}

#[cfg(not(target_os = "linux"))]
fn nvidia_rendering_workaround() {}

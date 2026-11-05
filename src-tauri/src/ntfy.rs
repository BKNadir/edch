//! Live link to the wing's ntfy.sh topic: one HTTP connection kept open, ntfy pushes each
//! message as soon as it is published (instead of asking every 15 seconds). Lines are passed
//! to the UI as they come; the UI decrypts them. Reconnects by itself, resuming after the
//! last message seen so nothing is lost.

use serde::Serialize;
use std::io::{BufRead, BufReader};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

use crate::logs;

/// Bumped by every subscribe/unsubscribe: an older stream thread stops by itself.
static GENERATION: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Serialize)]
struct NtfyLine {
    topic: String,
    line: String,
}

#[derive(Clone, Serialize)]
struct NtfyState {
    topic: String,
    connected: bool,
    message: Option<String>,
}

fn valid_topic(topic: &str) -> bool {
    !topic.is_empty() && topic.len() <= 64 && topic.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

fn valid_since(since: &str) -> bool {
    !since.is_empty() && since.len() <= 32 && since.chars().all(|c| c.is_ascii_alphanumeric())
}

fn stream(app: AppHandle, topic: String, mut since: String, generation: u64) {
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(15))
        // ntfy sends a keepalive about every 45 s: silence for longer means the link is dead.
        .timeout_read(Duration::from_secs(100))
        .user_agent(concat!("EDCH/", env!("CARGO_PKG_VERSION")))
        .build();
    let mut wait = 2u64;
    while GENERATION.load(Ordering::SeqCst) == generation {
        let url = format!("https://ntfy.sh/{topic}/json?since={since}");
        match agent.get(&url).call() {
            Ok(response) => {
                logs::info("wing", "Live link to ntfy.sh open");
                let _ = app.emit("ntfy-state", NtfyState { topic: topic.clone(), connected: true, message: None });
                wait = 2;
                let reader = BufReader::new(response.into_reader());
                for line in reader.lines() {
                    if GENERATION.load(Ordering::SeqCst) != generation {
                        return;
                    }
                    let Ok(line) = line else { break };
                    if line.trim().is_empty() {
                        continue;
                    }
                    // Remember where we are, to resume there after a reconnection.
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&line) {
                        // Only real messages: keepalive and open events carry ids ntfy can't resume from.
                        if v["event"].as_str() == Some("message") {
                            if let Some(id) = v["id"].as_str().filter(|id| valid_since(id)) {
                                since = id.to_string();
                            }
                            logs::debug("wing", "ntfy message received");
                        }
                    }
                    let _ = app.emit("ntfy-line", NtfyLine { topic: topic.clone(), line });
                }
                logs::info("wing", "Live link to ntfy.sh closed, reconnecting");
            }
            Err(e) => {
                logs::warn("wing", &format!("ntfy.sh: {e}"));
                let _ = app.emit("ntfy-state", NtfyState { topic: topic.clone(), connected: false, message: Some(e.to_string()) });
            }
        }
        if GENERATION.load(Ordering::SeqCst) != generation {
            return;
        }
        thread::sleep(Duration::from_secs(wait));
        wait = (wait * 2).min(60);
    }
}

/// Opens the live link to a wing topic (replacing any previous one), starting after `since`
/// (an ntfy message id, or a duration such as "6h").
#[tauri::command]
pub fn ntfy_subscribe(app: AppHandle, topic: String, since: String) -> Result<(), String> {
    if !valid_topic(&topic) || !valid_since(&since) {
        return Err("invalidNtfyTopic".into());
    }
    let generation = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    thread::spawn(move || stream(app, topic, since, generation));
    Ok(())
}

/// Closes the live link (the thread stops at its next line or keepalive).
#[tauri::command]
pub fn ntfy_unsubscribe() {
    GENERATION.fetch_add(1, Ordering::SeqCst);
}

/// The "I'm leaving" message (already encrypted by the UI) to send when EDCH closes: the UI
/// may be gone by then, so Rust keeps it ready.
static FAREWELL: Mutex<Option<(String, String)>> = Mutex::new(None);

#[tauri::command]
pub fn ntfy_set_farewell(topic: String, text: Option<String>) -> Result<(), String> {
    if !valid_topic(&topic) {
        return Err("invalidNtfyTopic".into());
    }
    let mut f = FAREWELL.lock().map_err(|e| e.to_string())?;
    *f = text.filter(|t| t.len() < 8192).map(|t| (topic, t));
    Ok(())
}

/// Called when the app exits: tells the wing we're gone (a few seconds at most).
pub fn send_farewell() {
    let Some((topic, text)) = FAREWELL.lock().ok().and_then(|mut f| f.take()) else { return };
    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(3))
        .user_agent(concat!("EDCH/", env!("CARGO_PKG_VERSION")))
        .build();
    match agent.post(&format!("https://ntfy.sh/{topic}")).set("Content-Type", "text/plain").send_string(&text) {
        Ok(_) => logs::info("wing", "Told the wing EDCH is closing"),
        Err(e) => logs::warn("wing", &format!("Couldn't tell the wing EDCH is closing: {e}")),
    }
}

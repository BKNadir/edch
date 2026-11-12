//! Link to Hailport, the voice assistant (docs/HAILPORT.md): a WebSocket to Hailport on this PC
//! (127.0.0.1 only), opened from here because Hailport refuses web pages (they send an "Origin"
//! header; this client sends none). Rust only moves the messages: the UI writes and reads them
//! (services/hailport), and decides when to connect again. Messages are never logged.
//!
//! Built only with the "hailport" feature (on by default, off for the portable exe); without it,
//! hailport_off.rs takes this module's place.

use serde::Serialize;
use std::io::ErrorKind;
use std::net::{Ipv4Addr, SocketAddr, TcpStream};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tungstenite::client::IntoClientRequest;
use tungstenite::protocol::frame::coding::CloseCode;
use tungstenite::protocol::CloseFrame;
use tungstenite::{Message, WebSocket};

use crate::logs;

/// Bumped by every connect/disconnect: an older connection's thread stops by itself.
static GENERATION: AtomicU64 = AtomicU64::new(0);

/// The open connection, with the generation it belongs to.
static SOCKET: Mutex<Option<(u64, WebSocket<TcpStream>)>> = Mutex::new(None);

/// Hailport's limit for one message.
const MAX_MESSAGE_BYTES: usize = 64 * 1024;
/// How long a read waits before letting a send through (the socket is shared).
const READ_SLICE: Duration = Duration::from_millis(100);
/// Connecting and the WebSocket handshake: Hailport answers at once or isn't there.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(3);

/// What happened to the connection, for the UI.
#[derive(Clone, Serialize)]
struct HailportStatus {
    generation: u64,
    /// "open" or "closed".
    state: &'static str,
    /// The close code Hailport gave (4001 removed, 4002 replaced…); none when the connection
    /// failed or dropped without one.
    code: Option<u16>,
}

/// A message from Hailport, as received (JSON text).
#[derive(Clone, Serialize)]
struct HailportMessage {
    generation: u64,
    text: String,
}

/// Whether this build offers Hailport (false in the portable exe).
#[tauri::command]
pub fn hailport_available() -> bool {
    true
}

/// Opens the link to Hailport on `port` (replacing any previous one) and returns its generation.
/// The result arrives as a "hailport-status" event; messages as "hailport-message" events.
#[tauri::command]
pub fn hailport_connect(app: AppHandle, port: u16) -> Result<u64, String> {
    if port < 1024 {
        return Err("invalidPort".into());
    }
    let generation = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    close_socket();
    thread::spawn(move || run(app, port, generation));
    Ok(generation)
}

/// Closes the link (normal closure) and stops its thread.
#[tauri::command]
pub fn hailport_disconnect() {
    GENERATION.fetch_add(1, Ordering::SeqCst);
    close_socket();
}

/// Sends one message (JSON text written by the UI) on the open link.
#[tauri::command]
pub fn hailport_send(generation: u64, text: String) -> Result<(), String> {
    if text.is_empty() || text.len() > MAX_MESSAGE_BYTES {
        return Err("hailportMessageTooLarge".into());
    }
    let mut socket = SOCKET.lock().map_err(|_| "hailportNotConnected".to_string())?;
    match socket.as_mut() {
        Some((open, ws)) if *open == generation => ws.send(Message::text(text)).map_err(|e| {
            logs::warn("hailport", &format!("Message not sent: {e}"));
            "hailportNotConnected".to_string()
        }),
        _ => Err("hailportNotConnected".into()),
    }
}

/// Closes the current socket, if any, with a normal closure.
fn close_socket() {
    if let Ok(mut socket) = SOCKET.lock() {
        if let Some((_, mut ws)) = socket.take() {
            let _ = ws.close(Some(CloseFrame {
                code: CloseCode::Normal,
                reason: "".into(),
            }));
            let _ = ws.flush();
        }
    }
}

/// Whether `generation` is still the wanted connection.
fn current(generation: u64) -> bool {
    GENERATION.load(Ordering::SeqCst) == generation
}

fn emit_status(app: &AppHandle, generation: u64, state: &'static str, code: Option<u16>) {
    let _ = app.emit(
        "hailport-status",
        HailportStatus {
            generation,
            state,
            code,
        },
    );
}

/// Connects, then passes every message to the UI until the connection ends.
fn run(app: AppHandle, port: u16, generation: u64) {
    let ws = match open(port) {
        Ok(ws) => ws,
        Err(reason) => {
            // Usual when Hailport isn't running: no warning, the UI tries again later.
            logs::debug("hailport", &format!("Not connected: {reason}"));
            if current(generation) {
                emit_status(&app, generation, "closed", None);
            }
            return;
        }
    };
    if !current(generation) {
        return;
    }
    if let Ok(mut socket) = SOCKET.lock() {
        *socket = Some((generation, ws));
    }
    logs::info("hailport", "Connected to Hailport");
    emit_status(&app, generation, "open", None);
    let code = read_until_closed(generation, |text| {
        let _ = app.emit("hailport-message", HailportMessage { generation, text });
    });
    if current(generation) {
        if let Ok(mut socket) = SOCKET.lock() {
            if matches!(socket.as_ref(), Some((open, _)) if *open == generation) {
                *socket = None;
            }
        }
        logs::info(
            "hailport",
            &format!(
                "Hailport link closed ({})",
                code.map_or("no code".to_string(), |c| c.to_string())
            ),
        );
        emit_status(&app, generation, "closed", code);
    }
}

/// The TCP connection and the WebSocket handshake to ws://127.0.0.1:port/v1, without "Origin".
fn open(port: u16) -> Result<WebSocket<TcpStream>, String> {
    let address = SocketAddr::from((Ipv4Addr::LOCALHOST, port));
    let stream = TcpStream::connect_timeout(&address, CONNECT_TIMEOUT).map_err(|e| e.kind().to_string())?;
    stream
        .set_read_timeout(Some(CONNECT_TIMEOUT))
        .and_then(|_| stream.set_write_timeout(Some(CONNECT_TIMEOUT)))
        .and_then(|_| stream.set_nodelay(true))
        .map_err(|e| e.kind().to_string())?;
    let request = format!("ws://127.0.0.1:{port}/v1")
        .into_client_request()
        .map_err(|e| e.to_string())?;
    let (ws, _) = tungstenite::client::client(request, stream).map_err(|e| match e {
        tungstenite::HandshakeError::Failure(error) => error.to_string(),
        tungstenite::HandshakeError::Interrupted(_) => "handshake timed out".into(),
    })?;
    // From now on, short reads: the socket is shared with hailport_send.
    ws.get_ref()
        .set_read_timeout(Some(READ_SLICE))
        .map_err(|e| e.kind().to_string())?;
    Ok(ws)
}

/// Reads until the connection ends, giving each text message to `on_text`; returns Hailport's
/// close code, if it gave one.
fn read_until_closed(generation: u64, mut on_text: impl FnMut(String)) -> Option<u16> {
    loop {
        if !current(generation) {
            return None;
        }
        let read = {
            let Ok(mut socket) = SOCKET.lock() else {
                return None;
            };
            let (open, ws) = socket.as_mut()?;
            if *open != generation {
                return None;
            }
            let read = ws.read();
            // Answers to Hailport's pings are queued by read(): sent now.
            let _ = ws.flush();
            read
        };
        match read {
            Ok(Message::Text(text)) => {
                if text.len() <= MAX_MESSAGE_BYTES {
                    on_text(text.to_string());
                }
            }
            Ok(Message::Close(frame)) => return frame.map(|frame| u16::from(frame.code)),
            Ok(_) => {}
            Err(tungstenite::Error::Io(error))
                if matches!(error.kind(), ErrorKind::WouldBlock | ErrorKind::TimedOut) =>
            {
                // Nothing yet: let a send through, then read again.
                thread::sleep(Duration::from_millis(5));
            }
            Err(tungstenite::Error::ConnectionClosed | tungstenite::Error::AlreadyClosed) => return None,
            Err(error) => {
                logs::debug("hailport", &format!("Link error: {error}"));
                return None;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;

    /// A pretend Hailport: refuses an "Origin" header, pings, sends a message, reads the answer,
    /// then closes with 4002 ("replaced").
    #[test]
    fn talks_to_a_local_server() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = thread::spawn(move || {
            let (stream, _) = listener.accept().unwrap();
            // The handshake, read without consuming it: no "Origin", the /v1 path.
            let mut head = [0u8; 2048];
            let request = loop {
                let length = stream.peek(&mut head).unwrap();
                let text = String::from_utf8_lossy(&head[..length]).to_string();
                if text.contains("\r\n\r\n") {
                    break text.to_lowercase();
                }
            };
            assert!(request.starts_with("get /v1 "));
            assert!(!request.contains("\norigin:"));
            let mut ws = tungstenite::accept(stream).unwrap();
            ws.send(Message::Ping(vec![1, 2].into())).unwrap();
            ws.send(Message::text("{\"v\":1,\"type\":\"welcome\"}")).unwrap();
            let answer = loop {
                match ws.read().unwrap() {
                    Message::Text(text) => break text.to_string(),
                    Message::Pong(payload) => assert_eq!(payload.as_ref(), &[1, 2]),
                    _ => {}
                }
            };
            ws.close(Some(CloseFrame {
                code: CloseCode::from(4002),
                reason: "replaced".into(),
            }))
            .unwrap();
            let _ = ws.flush();
            while ws.read().is_ok() {}
            answer
        });

        let generation = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
        let ws = open(port).unwrap();
        *SOCKET.lock().unwrap() = Some((generation, ws));
        let mut received = Vec::new();
        let code = read_until_closed(generation, |text| {
            received.push(text);
            hailport_send(generation, "{\"v\":1,\"type\":\"register\"}".into()).unwrap();
        });
        assert_eq!(received, vec!["{\"v\":1,\"type\":\"welcome\"}".to_string()]);
        assert_eq!(code, Some(4002));
        assert_eq!(server.join().unwrap(), "{\"v\":1,\"type\":\"register\"}");
        assert_eq!(
            hailport_send(generation + 1, "{}".into()).unwrap_err(),
            "hailportNotConnected"
        );
    }

    #[test]
    fn nothing_listening() {
        let port = TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
        assert!(open(port).is_err());
    }
}

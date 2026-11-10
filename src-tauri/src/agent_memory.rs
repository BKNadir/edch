//! EDCH-COG-MEMORY-v1.5.3 — local per-commander/per-faction SQLite memory.
//! Does not modify the existing BGS database, Elite Dangerous journals, or binds.
use rusqlite::{params, Connection};
use serde::Serialize;
use tauri::{AppHandle, Manager};

const MAX_TEXT: usize = 2000;
const MAX_ITEMS_PER_SCOPE: i64 = 2000;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryRow {
    id: i64,
    category: String,
    text: String,
    event_key: Option<String>,
    created_at: String,
}

fn name(value: &str) -> Result<String, String> {
    let s = value.trim();
    if s.is_empty() || s.chars().count() > 160 || s.chars().any(char::is_control) {
        return Err("agentMemoryInvalidScope".into());
    }
    Ok(s.to_lowercase())
}

fn connection(app: &AppHandle) -> Result<Connection, String> {
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let con = Connection::open(dir.join("edch-agent-memory-v153.sqlite3")).map_err(|e| e.to_string())?;
    con.busy_timeout(std::time::Duration::from_millis(1500)).map_err(|e| e.to_string())?;
    con.execute_batch(
        "PRAGMA journal_mode=WAL;
         CREATE TABLE IF NOT EXISTS agent_memories (
             id INTEGER PRIMARY KEY,
             commander TEXT NOT NULL,
             faction TEXT NOT NULL,
             category TEXT NOT NULL,
             text TEXT NOT NULL,
             event_key TEXT,
             created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
         );
         CREATE INDEX IF NOT EXISTS agent_memory_scope ON agent_memories(commander,faction,id DESC);
         CREATE UNIQUE INDEX IF NOT EXISTS agent_memory_unique_event
           ON agent_memories(commander,faction,event_key) WHERE event_key IS NOT NULL;",
    ).map_err(|e| e.to_string())?;
    Ok(con)
}

#[tauri::command]
pub async fn agent_memory_add(
    app: AppHandle, commander: String, faction: String, category: String,
    text: String, event_key: Option<String>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let commander = name(&commander)?;
        let faction = name(&faction)?;
        if !matches!(category.as_str(), "note" | "event" | "decision") {
            return Err("agentMemoryInvalidCategory".into());
        }
        let text = text.trim();
        if text.is_empty() || text.len() > MAX_TEXT || text.chars().any(|c| c == '\0') {
            return Err("agentMemoryInvalidText".into());
        }
        let key = event_key.map(|v| v.trim().to_string());
        if key.as_ref().is_some_and(|v| v.is_empty() || v.len() > 180 || !v.is_ascii()) {
            return Err("agentMemoryInvalidEventKey".into());
        }
        let mut con = connection(&app)?;
        let tx = con.transaction().map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT OR IGNORE INTO agent_memories(commander,faction,category,text,event_key) VALUES(?1,?2,?3,?4,?5)",
            params![commander, faction, category, text, key],
        ).map_err(|e| e.to_string())?;
        tx.execute(
            "DELETE FROM agent_memories WHERE commander=?1 AND faction=?2 AND id NOT IN
             (SELECT id FROM agent_memories WHERE commander=?1 AND faction=?2 ORDER BY id DESC LIMIT ?3)",
            params![commander, faction, MAX_ITEMS_PER_SCOPE],
        ).map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn agent_memory_list(
    app: AppHandle, commander: String, faction: String, limit: usize,
) -> Result<Vec<MemoryRow>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let commander = name(&commander)?;
        let faction = name(&faction)?;
        let con = connection(&app)?;
        let mut stmt = con.prepare(
            "SELECT id, category, text, event_key, created_at FROM agent_memories
             WHERE commander=?1 AND faction=?2 ORDER BY id DESC LIMIT ?3",
        ).map_err(|e| e.to_string())?;
        let mapped = stmt.query_map(params![commander, faction, limit.min(100) as i64], |r| {
            Ok(MemoryRow { id: r.get(0)?, category: r.get(1)?, text: r.get(2)?,
                event_key: r.get(3)?, created_at: r.get(4)? })
        }).map_err(|e| e.to_string())?;
        mapped.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn agent_memory_delete(
    app: AppHandle, commander: String, faction: String, id: i64,
) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let commander = name(&commander)?;
        let faction = name(&faction)?;
        if id <= 0 { return Err("agentMemoryInvalidId".into()); }
        let con = connection(&app)?;
        let n = con.execute("DELETE FROM agent_memories WHERE id=?1 AND commander=?2 AND faction=?3",
            params![id,commander,faction]).map_err(|e| e.to_string())?;
        Ok(n > 0)
    }).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn scope_validation() {
        assert_eq!(name(" CMDR A ").unwrap(), "cmdr a");
        assert!(name("\n").is_err());
        assert!(name(&"x".repeat(161)).is_err());
    }
}

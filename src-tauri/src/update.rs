//! Updates from the GitHub releases of BKNadir/edch.
//!
//! check: compares the latest published release with this build's version.
//! download: fetches the NSIS installer of that release into %TEMP%\EDCH-update, reporting
//! progress, and checks its SHA-256 against the digest GitHub publishes for the asset.
//! install: starts that installer in passive mode with /R (it reopens EDCH once done) and
//! closes the app so its files can be replaced.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const REPO: &str = "BKNadir/edch";

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub current: String,
    pub notes: String,
    pub page: String,
    pub asset: String,
    pub url: String,
    pub size: u64,
    pub digest: Option<String>,
}

#[derive(Serialize, Clone)]
struct Progress {
    done: u64,
    total: u64,
}

fn agent() -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(15))
        .timeout_read(Duration::from_secs(60))
        .user_agent(concat!("EDCH/", env!("CARGO_PKG_VERSION")))
        .build()
}

/// "v1.2.3" / "1.2.3-beta" → (1, 2, 3)
fn parse_version(v: &str) -> Option<(u64, u64, u64)> {
    let core = v.trim().trim_start_matches(['v', 'V']).split(['-', '+']).next()?;
    let mut parts = core.split('.').map(|p| p.parse::<u64>().ok());
    Some((parts.next()??, parts.next().flatten().unwrap_or(0), parts.next().flatten().unwrap_or(0)))
}

fn update_dir() -> PathBuf {
    std::env::temp_dir().join("EDCH-update")
}

/// The latest published release, if it is newer than this build. Drafts and pre-releases
/// are ignored (GitHub's "latest" never returns them).
#[tauri::command]
pub fn update_check() -> Result<Option<UpdateInfo>, String> {
    let current = env!("CARGO_PKG_VERSION").to_string();
    let url = format!("https://api.github.com/repos/{REPO}/releases/latest");
    let release: serde_json::Value = match agent().get(&url).set("Accept", "application/vnd.github+json").call() {
        Ok(r) => serde_json::from_str(&r.into_string().map_err(|e| e.to_string())?).map_err(|e| e.to_string())?,
        Err(ureq::Error::Status(404, _)) => return Ok(None), // no release published yet
        Err(ureq::Error::Status(code, _)) => {
            crate::logs::warn("update", &format!("GitHub answered {code}"));
            return Err(format!("GitHub a répondu {code}"));
        }
        Err(e) => return Err(format!("Réseau : {e}")),
    };
    let tag = release["tag_name"].as_str().unwrap_or_default();
    let (Some(latest), Some(mine)) = (parse_version(tag), parse_version(&current)) else {
        return Ok(None);
    };
    if latest <= mine {
        return Ok(None);
    }
    let asset = release["assets"]
        .as_array()
        .into_iter()
        .flatten()
        .find(|a| a["name"].as_str().is_some_and(|n| n.to_lowercase().ends_with("-setup.exe")));
    let Some(asset) = asset else {
        return Ok(None); // release without a Windows installer (yet)
    };
    Ok(Some(UpdateInfo {
        version: tag.trim_start_matches(['v', 'V']).to_string(),
        current,
        notes: release["body"].as_str().unwrap_or_default().to_string(),
        page: release["html_url"].as_str().unwrap_or_default().to_string(),
        asset: asset["name"].as_str().unwrap_or_default().to_string(),
        url: asset["browser_download_url"].as_str().unwrap_or_default().to_string(),
        size: asset["size"].as_u64().unwrap_or(0),
        digest: asset["digest"].as_str().map(|d| d.to_string()),
    }))
}

fn download(app: &AppHandle, info: &UpdateInfo) -> Result<PathBuf, String> {
    let prefix = format!("https://github.com/{REPO}/releases/download/");
    if !info.url.starts_with(&prefix) {
        return Err(format!("Adresse refusée : {}", info.url));
    }
    let name = info.asset.replace(['/', '\\'], "_");
    if !name.to_lowercase().ends_with(".exe") {
        return Err("Fichier inattendu".into());
    }
    let dir = update_dir();
    let _ = fs::remove_dir_all(&dir); // old downloads
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let target = dir.join(&name);
    let partial = dir.join(format!("{name}.part"));

    let response = agent().get(&info.url).call().map_err(|e| format!("Téléchargement : {e}"))?;
    let total = response
        .header("Content-Length")
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(info.size);
    let mut reader = response.into_reader();
    let mut file = File::create(&partial).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 64 * 1024];
    let mut done: u64 = 0;
    let mut last_emit: u64 = 0;
    loop {
        let n = reader.read(&mut buf).map_err(|e| format!("Téléchargement : {e}"))?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n]).map_err(|e| e.to_string())?;
        hasher.update(&buf[..n]);
        done += n as u64;
        if done - last_emit >= 256 * 1024 {
            last_emit = done;
            let _ = app.emit("update-progress", Progress { done, total });
        }
    }
    file.flush().map_err(|e| e.to_string())?;
    drop(file);
    let _ = app.emit("update-progress", Progress { done, total: total.max(done) });

    if info.size > 0 && done != info.size {
        let _ = fs::remove_file(&partial);
        return Err("Téléchargement incomplet, réessaie".into());
    }
    if let Some(expected) = info.digest.as_deref().and_then(|d| d.strip_prefix("sha256:")) {
        let got: String = hasher.finalize().iter().map(|b| format!("{b:02x}")).collect();
        if !got.eq_ignore_ascii_case(expected) {
            let _ = fs::remove_file(&partial);
            return Err("Le fichier téléchargé ne correspond pas à la version publiée (somme de contrôle)".into());
        }
    }
    fs::rename(&partial, &target).map_err(|e| e.to_string())?;
    Ok(target)
}

#[tauri::command]
pub async fn update_download(app: AppHandle, info: UpdateInfo) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || download(&app, &info).map(|p| p.to_string_lossy().to_string()))
        .await
        .map_err(|e| e.to_string())?
}

/// Runs the downloaded installer (passive, reopens EDCH) and closes the app.
#[tauri::command]
pub fn update_install(app: AppHandle, path: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    let dir = update_dir();
    let inside = path.parent().map(|p| p == dir).unwrap_or(false);
    let is_exe = path.extension().map(|e| e.eq_ignore_ascii_case("exe")).unwrap_or(false);
    if !inside || !is_exe || !path.is_file() {
        return Err("Installateur introuvable, relance le téléchargement".into());
    }
    crate::logs::info("update", &format!("Running installer {}", path.display()));
    std::process::Command::new(&path)
        .args(["/UPDATE", "/P", "/R"])
        .spawn()
        .map_err(|e| format!("Impossible de lancer l'installation : {e}"))?;
    app.exit(0);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::parse_version;

    #[test]
    fn versions() {
        assert_eq!(parse_version("v0.5.4"), Some((0, 5, 4)));
        assert_eq!(parse_version("1.2"), Some((1, 2, 0)));
        assert_eq!(parse_version("v1.0.0-beta.1"), Some((1, 0, 0)));
        assert!(parse_version("v0.5.10") > parse_version("v0.5.9"));
        assert_eq!(parse_version("nightly"), None);
    }
}

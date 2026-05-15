use base64::{engine::general_purpose::STANDARD, Engine};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::mdns::{MdnsManager, MdnsMyInfo, MdnsPeer};
use crate::masque::MasqueState;

// ─── Shared state ─────────────────────────────────────────────────────────────

#[derive(Default)]
pub struct PpTokenStore(pub Mutex<Vec<serde_json::Value>>);

// ─── Settings ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_settings(app: AppHandle) -> serde_json::Value {
    use tauri_plugin_store::StoreExt;

    let defaults = serde_json::json!({
        "windowBounds": { "width": 1200, "height": 800 },
        "windowPosition": null,
        "startMinimized": false,
        "minimizeToTray": true,
        "alwaysOnTop": false,
        "startOnBoot": false,
        "theme": "system",
        "notificationsEnabled": true,
        "soundEnabled": true,
        "autoUpdate": true,
        "idleTimeout": 5,
        "securityMode": "high",
        "biometricLockEnabled": false,
        "lockDelay": 5,
        "hasShownTrayNotification": false
    });

    let Ok(store) = app.store("settings.json") else {
        return defaults;
    };

    let mut result = serde_json::Map::new();
    if let Some(map) = defaults.as_object() {
        for (key, default_val) in map {
            let val = store.get(key).unwrap_or_else(|| default_val.clone());
            result.insert(key.clone(), val);
        }
    }
    serde_json::Value::Object(result)
}

#[tauri::command]
pub fn set_setting(app: AppHandle, key: String, value: serde_json::Value) -> bool {
    use tauri_plugin_store::StoreExt;
    let Ok(store) = app.store("settings.json") else {
        return false;
    };
    store.set(key, value);
    store.save().is_ok()
}

// ─── App info ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

// ─── Notifications ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn show_notification(app: AppHandle, title: String, body: String) {
    use tauri_plugin_notification::NotificationExt;
    let _ = app.notification().builder().title(&title).body(&body).show();
}

// ─── Updates (stub — updater plugin not wired; emit an event response) ────────

#[tauri::command]
pub async fn check_for_updates(app: AppHandle) {
    let _ = app.emit("update-not-available", ());
}

// ─── System ───────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_system_idle_time() -> u64 {
    #[cfg(target_os = "windows")]
    return get_idle_ms_windows() / 1000;

    #[cfg(not(target_os = "windows"))]
    0
}

#[cfg(target_os = "windows")]
fn get_idle_ms_windows() -> u64 {
    use std::mem;

    #[repr(C)]
    #[allow(non_snake_case)]
    struct LASTINPUTINFO {
        cbSize: u32,
        dwTime: u32,
    }

    #[link(name = "user32")]
    extern "system" {
        fn GetLastInputInfo(plii: *mut LASTINPUTINFO) -> i32;
        fn GetTickCount() -> u32;
    }

    unsafe {
        let mut lii = LASTINPUTINFO {
            cbSize: mem::size_of::<LASTINPUTINFO>() as u32,
            dwTime: 0,
        };
        if GetLastInputInfo(&mut lii) != 0 {
            let now = GetTickCount();
            now.wrapping_sub(lii.dwTime) as u64
        } else {
            0
        }
    }
}

#[tauri::command]
pub fn set_badge(_count: i64) {
    // macOS dock badge / Windows overlay icon. Stub for now.
}

// ─── URL handling ─────────────────────────────────────────────────────────────

#[tauri::command]
pub fn open_url_external(app: AppHandle, url: String) {
    use tauri_plugin_opener::OpenerExt;
    if url.starts_with("http://") || url.starts_with("https://") {
        let _ = app.opener().open_url(&url, None::<&str>);
    }
}

#[tauri::command]
pub fn open_url_in_app(app: AppHandle, url: String) {
    use tauri::{WebviewUrl, WebviewWindowBuilder};
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return;
    }
    let Ok(parsed) = url.parse() else { return };
    let label = format!("browser-{}", epoch_ms());
    let _ = WebviewWindowBuilder::new(&app, label, WebviewUrl::External(parsed))
        .title("In-App Browser")
        .inner_size(900.0, 700.0)
        .build();
}

fn epoch_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

// ─── Window management ────────────────────────────────────────────────────────

#[tauri::command]
pub fn window_reload(app: AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.eval("window.location.reload()");
    }
}

#[tauri::command]
pub fn window_toggle_fullscreen(app: AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let is_fs = win.is_fullscreen().unwrap_or(false);
        let _ = win.set_fullscreen(!is_fs);
    }
}

#[tauri::command]
pub fn window_set_always_on_top(app: AppHandle, value: bool) -> bool {
    use tauri_plugin_store::StoreExt;
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.set_always_on_top(value);
        if let Ok(store) = app.store("settings.json") {
            store.set("alwaysOnTop", serde_json::json!(value));
            return store.save().is_ok();
        }
    }
    false
}

#[tauri::command]
pub fn window_minimize(app: AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.minimize();
    }
}

#[tauri::command]
pub fn window_zoom(app: AppHandle, direction: String) {
    if let Some(win) = app.get_webview_window("main") {
        let script = match direction.as_str() {
            "in"    => "window.__zoom=Math.min(2.0,(window.__zoom||1.0)+0.1);document.documentElement.style.zoom=window.__zoom",
            "out"   => "window.__zoom=Math.max(0.5,(window.__zoom||1.0)-0.1);document.documentElement.style.zoom=window.__zoom",
            "reset" => "window.__zoom=1.0;document.documentElement.style.zoom=1",
            _ => return,
        };
        let _ = win.eval(script);
    }
}

// ─── Proximity (basic, non-QUIC) ──────────────────────────────────────────────

#[tauri::command]
pub fn proximity_get_network_info() -> serde_json::Value {
    serde_json::json!({ "localIp": local_ip(), "interfaces": [] })
}

#[tauri::command]
pub fn proximity_get_local_ip() -> serde_json::Value {
    serde_json::json!({ "ip": local_ip() })
}

#[tauri::command]
pub fn proximity_get_device_id() -> serde_json::Value {
    serde_json::json!({ "deviceId": device_id() })
}

#[tauri::command]
pub fn proximity_get_device_name() -> serde_json::Value {
    serde_json::json!({ "name": device_name() })
}

#[tauri::command]
pub fn proximity_save_file(_file_data: serde_json::Value) -> serde_json::Value {
    serde_json::json!({ "success": false, "error": "not_implemented" })
}

#[tauri::command]
pub fn proximity_show_in_folder(app: AppHandle, file_path: String) -> serde_json::Value {
    use tauri_plugin_opener::OpenerExt;
    #[cfg(target_os = "windows")]
    let _ = app.opener().open_url(
        format!("explorer.exe /select,\"{}\"", file_path),
        None::<&str>,
    );
    #[cfg(not(target_os = "windows"))]
    let _ = app.opener().open_path(&file_path, None::<&str>);
    serde_json::json!({ "success": true })
}

#[tauri::command]
pub fn proximity_open_file(app: AppHandle, file_path: String) -> serde_json::Value {
    use tauri_plugin_opener::OpenerExt;
    let _ = app.opener().open_path(&file_path, None::<&str>);
    serde_json::json!({ "success": true })
}

fn local_ip() -> String {
    use std::net::UdpSocket;
    UdpSocket::bind("0.0.0.0:0")
        .and_then(|s| {
            s.connect("8.8.8.8:80")?;
            s.local_addr()
        })
        .map(|a| a.ip().to_string())
        .unwrap_or_else(|_| "127.0.0.1".to_string())
}

fn device_name() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "Desktop".to_string())
}

fn device_id() -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    device_name().hash(&mut hasher);
    format!("tauri-{:x}", hasher.finish())
}

// ─── mDNS peer discovery ──────────────────────────────────────────────────────

#[tauri::command]
pub async fn mdns_start(
    state: State<'_, MdnsManager>,
    app: AppHandle,
    nickname: Option<String>,
) -> Result<MdnsMyInfo, String> {
    state.start(app, nickname).await
}

#[tauri::command]
pub async fn mdns_stop(state: State<'_, MdnsManager>) -> Result<(), String> {
    state.stop().await;
    Ok(())
}

#[tauri::command]
pub async fn mdns_get_peers(state: State<'_, MdnsManager>) -> Result<Vec<MdnsPeer>, String> {
    Ok(state.get_peers().await)
}

#[tauri::command]
pub async fn mdns_get_my_info(state: State<'_, MdnsManager>) -> Result<MdnsMyInfo, String> {
    Ok(state.get_my_info().await)
}

#[tauri::command]
pub async fn mdns_send_sdp(
    state: State<'_, MdnsManager>,
    peer_ip: String,
    peer_port: u16,
    sdp: String,
) -> Result<serde_json::Value, String> {
    let ok = state.send_sdp(peer_ip, peer_port, sdp).await;
    Ok(serde_json::json!({ "success": ok }))
}

#[tauri::command]
pub async fn mdns_is_running(state: State<'_, MdnsManager>) -> Result<bool, String> {
    Ok(state.is_running().await)
}

// ─── MASQUE / UDP tunnel ──────────────────────────────────────────────────────

#[tauri::command]
pub async fn masque_init(
    state: State<'_, MasqueState>,
    proxy_url: String,
) -> Result<serde_json::Value, String> {
    match state.init(proxy_url).await {
        Ok(()) => Ok(serde_json::json!({ "success": true })),
        Err(e) => Ok(serde_json::json!({ "success": false, "error": e })),
    }
}

#[tauri::command]
pub async fn masque_is_available(
    state: State<'_, MasqueState>,
) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({ "available": state.is_available().await }))
}

#[tauri::command]
pub async fn masque_send(
    state: State<'_, MasqueState>,
    target: String,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let bytes = match &payload {
        serde_json::Value::String(s) => s.as_bytes().to_vec(),
        other => other.to_string().into_bytes(),
    };
    match state.send(&target, &bytes).await {
        Ok((success, tunneled)) => Ok(serde_json::json!({
            "success": success,
            "tunneled": tunneled,
        })),
        Err(e) => Ok(serde_json::json!({
            "success": false,
            "tunneled": false,
            "error": e,
        })),
    }
}

// ─── Security / Privacy Pass ──────────────────────────────────────────────────

#[tauri::command]
pub fn pp_store_tokens(
    state: State<PpTokenStore>,
    tokens: Vec<serde_json::Value>,
) -> serde_json::Value {
    let mut store = state.0.lock().unwrap();
    *store = tokens;
    let count = store.len();
    serde_json::json!({ "success": true, "count": count })
}

#[tauri::command]
pub fn pp_get_token(state: State<PpTokenStore>) -> serde_json::Value {
    let mut store = state.0.lock().unwrap();
    if store.is_empty() {
        serde_json::json!({ "token": null })
    } else {
        let token = store.remove(0);
        serde_json::json!({ "token": token })
    }
}

#[tauri::command]
pub fn pp_get_count(state: State<PpTokenStore>) -> serde_json::Value {
    let count = state.0.lock().unwrap().len();
    serde_json::json!({ "count": count })
}

#[tauri::command]
pub fn security_random_bytes(size: usize) -> serde_json::Value {
    let cap = size.min(1024);
    let mut buf = vec![0u8; cap];
    rand::thread_rng().fill_bytes(&mut buf);
    serde_json::json!({ "bytes": STANDARD.encode(&buf) })
}

// ─── Now Playing ─────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct NowPlayingInfo {
    pub title: String,
    pub artist: String,
    pub source: String,
}

#[tauri::command]
pub async fn now_playing_get_status() -> Option<NowPlayingInfo> {
    detect_now_playing().await
}

#[tauri::command]
pub async fn now_playing_start_polling(app: AppHandle, interval_ms: Option<u64>) -> serde_json::Value {
    let ms = interval_ms.unwrap_or(3000).max(1000);
    tokio::spawn(async move {
        let mut last_key: Option<String> = None;
        loop {
            tokio::time::sleep(tokio::time::Duration::from_millis(ms)).await;
            let status = detect_now_playing().await;
            let key = status.as_ref().map(|s| format!("{}|{}", s.title, s.artist));
            if key != last_key {
                last_key = key;
                let _ = app.emit("now-playing-update", &status);
            }
        }
    });
    serde_json::json!({ "started": true })
}

#[tauri::command]
pub async fn now_playing_stop_polling() -> serde_json::Value {
    serde_json::json!({ "stopped": true })
}

async fn detect_now_playing() -> Option<NowPlayingInfo> {
    #[cfg(target_os = "windows")]
    return detect_windows().await;
    #[cfg(target_os = "macos")]
    return detect_macos().await;
    #[cfg(target_os = "linux")]
    return detect_linux().await;
    #[allow(unreachable_code)]
    None
}

#[cfg(target_os = "windows")]
async fn detect_windows() -> Option<NowPlayingInfo> {
    use tokio::process::Command;
    let out = Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            r#"try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $mgr = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime]::RequestAsync().GetAwaiter().GetResult()
  $s = $mgr.GetCurrentSession()
  if ($s) {
    $info = $s.TryGetMediaPropertiesAsync().GetAwaiter().GetResult()
    if ($info.Title) { ConvertTo-Json @{title=$info.Title; artist=$info.Artist} }
  }
} catch {}"#,
        ])
        .output()
        .await
        .ok()?;

    let stdout = String::from_utf8_lossy(&out.stdout);
    let text = stdout.trim();
    if text.is_empty() {
        return None;
    }
    let v: serde_json::Value = serde_json::from_str(text).ok()?;
    Some(NowPlayingInfo {
        title: v["title"].as_str()?.to_string(),
        artist: v["artist"].as_str().unwrap_or("").to_string(),
        source: "system".to_string(),
    })
}

#[cfg(target_os = "macos")]
async fn detect_macos() -> Option<NowPlayingInfo> {
    use tokio::process::Command;
    let script = r#"
tell application "System Events"
  set appList to name of every application process whose background only is false
end tell
if appList contains "Spotify" then
  tell application "Spotify"
    return (name of current track) & "|" & (artist of current track) & "|spotify"
  end tell
else if appList contains "Music" then
  tell application "Music"
    return (name of current track) & "|" & (artist of current track) & "|music"
  end tell
end if
"#;
    let out = Command::new("osascript")
        .args(["-e", script])
        .output()
        .await
        .ok()?;

    let text = String::from_utf8_lossy(&out.stdout);
    let text = text.trim();
    if text.is_empty() {
        return None;
    }
    let parts: Vec<&str> = text.splitn(3, '|').collect();
    if parts[0].is_empty() {
        return None;
    }
    Some(NowPlayingInfo {
        title: parts[0].to_string(),
        artist: parts.get(1).unwrap_or(&"").to_string(),
        source: parts.get(2).unwrap_or(&"system").to_string(),
    })
}

#[cfg(target_os = "linux")]
async fn detect_linux() -> Option<NowPlayingInfo> {
    use tokio::process::Command;
    let players_out = Command::new("dbus-send")
        .args([
            "--print-reply",
            "--dest=org.freedesktop.DBus",
            "/org/freedesktop/DBus",
            "org.freedesktop.DBus.ListNames",
        ])
        .output()
        .await
        .ok()?;

    let players_text = String::from_utf8_lossy(&players_out.stdout);
    let player = players_text
        .lines()
        .find(|l| l.contains("org.mpris.MediaPlayer2."))?
        .split('"')
        .find(|s| s.starts_with("org.mpris.MediaPlayer2."))?
        .to_string();

    let out = Command::new("dbus-send")
        .args([
            "--print-reply",
            &format!("--dest={}", player),
            "/org/mpris/MediaPlayer2",
            "org.freedesktop.DBus.Properties.Get",
            "string:org.mpris.MediaPlayer2.Player",
            "string:Metadata",
        ])
        .output()
        .await
        .ok()?;

    let text = String::from_utf8_lossy(&out.stdout);
    let title = text
        .lines()
        .skip_while(|l| !l.contains("xesam:title"))
        .nth(1)?
        .split('"')
        .nth(1)?
        .to_string();

    if title.is_empty() {
        return None;
    }
    Some(NowPlayingInfo {
        title,
        artist: String::new(),
        source: "system".to_string(),
    })
}

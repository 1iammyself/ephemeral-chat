use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{mpsc, Mutex};

const SERVICE_TYPE: &str = "_ephchat._tcp.local.";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MdnsPeer {
    pub device_id: String,
    pub nickname: String,
    pub ip: String,
    pub port: u16,
    pub platform: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MdnsMyInfo {
    pub device_id: String,
    pub nickname: String,
    pub ip: String,
    pub port: u16,
}

pub struct MdnsInner {
    pub running: bool,
    pub peers: HashMap<String, MdnsPeer>,
    pub my_device_id: String,
    pub my_nickname: String,
    pub my_ip: String,
    pub sdp_port: u16,
    pub shutdown_tx: Option<mpsc::Sender<()>>,
}

pub struct MdnsManager(pub Arc<Mutex<MdnsInner>>);

impl Default for MdnsManager {
    fn default() -> Self {
        Self(Arc::new(Mutex::new(MdnsInner {
            running: false,
            peers: HashMap::new(),
            my_device_id: derive_device_id(),
            my_nickname: device_name(),
            my_ip: local_ip(),
            sdp_port: 0,
            shutdown_tx: None,
        })))
    }
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

fn derive_device_id() -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut h = DefaultHasher::new();
    device_name().hash(&mut h);
    format!("tauri-{:x}", h.finish())
}

async fn find_free_port(start: u16, end: u16) -> Option<u16> {
    for port in start..=end {
        if TcpListener::bind(format!("0.0.0.0:{}", port)).await.is_ok() {
            return Some(port);
        }
    }
    None
}

impl MdnsManager {
    pub async fn start(&self, app: AppHandle, nickname: Option<String>) -> Result<MdnsMyInfo, String> {
        let mut state = self.0.lock().await;
        if state.running {
            return Ok(MdnsMyInfo {
                device_id: state.my_device_id.clone(),
                nickname: state.my_nickname.clone(),
                ip: state.my_ip.clone(),
                port: state.sdp_port,
            });
        }

        if let Some(nick) = nickname {
            state.my_nickname = nick;
        }
        state.my_ip = local_ip();

        let port = find_free_port(47800, 47900).await
            .ok_or_else(|| "No free port in 47800-47900".to_string())?;
        state.sdp_port = port;

        let device_id = state.my_device_id.clone();
        let nickname = state.my_nickname.clone();
        let ip = state.my_ip.clone();

        // Build ServiceInfo
        let instance_name = format!("ephchat-{}", &device_id[..8.min(device_id.len())]);
        let properties: &[(&str, &str)] = &[
            ("deviceId", &device_id),
            ("nickname", &nickname[..30.min(nickname.len())]),
            ("platform", "tauri"),
            ("port", &port.to_string()),
        ];

        let daemon = ServiceDaemon::new().map_err(|e| e.to_string())?;
        let service_info = ServiceInfo::new(
            SERVICE_TYPE,
            &instance_name,
            &format!("{}.local.", instance_name),
            "",
            port,
            properties,
        ).map_err(|e| e.to_string())?;

        daemon.register(service_info).map_err(|e| e.to_string())?;

        let browse_rx = daemon.browse(SERVICE_TYPE).map_err(|e| e.to_string())?;

        let (shutdown_tx, mut shutdown_rx) = mpsc::channel::<()>(1);
        state.shutdown_tx = Some(shutdown_tx);

        // Bridge blocking mdns receiver to async using blocking recv (exits when daemon shuts down)
        let (event_tx, mut event_rx) = mpsc::unbounded_channel::<ServiceEvent>();
        std::thread::spawn({
            let rx = browse_rx.clone();
            move || {
                while let Ok(event) = rx.recv() {
                    if event_tx.send(event).is_err() {
                        break;
                    }
                }
            }
        });

        // Peer discovery task
        let state_arc = self.0.clone();
        let my_device_id = device_id.clone();
        let app_for_discovery = app.clone();
        tokio::spawn(async move {
        let app = app_for_discovery;
            loop {
                tokio::select! {
                    _ = shutdown_rx.recv() => {
                        let _ = daemon.shutdown();
                        break;
                    }
                    event = event_rx.recv() => {
                        match event {
                            Some(ServiceEvent::ServiceResolved(info)) => {
                                let peer_did = info.get_property("deviceId")
                                    .map(|p| p.val_str().to_string())
                                    .unwrap_or_default();
                                if peer_did.is_empty() || peer_did == my_device_id { continue; }

                                let peer_ip = info.get_property("ip")
                                    .map(|p| p.val_str().to_string())
                                    .unwrap_or_else(|| {
                                        info.get_addresses().iter().next()
                                            .map(|a| a.to_string())
                                            .unwrap_or_default()
                                    });
                                let peer_port: u16 = info.get_property("port")
                                    .and_then(|p| p.val_str().parse().ok())
                                    .unwrap_or_else(|| info.get_port());

                                if peer_ip.is_empty() || peer_port == 0 { continue; }

                                let peer = MdnsPeer {
                                    device_id: peer_did.clone(),
                                    nickname: info.get_property("nickname")
                                        .map(|p| p.val_str().to_string())
                                        .unwrap_or_default(),
                                    ip: peer_ip,
                                    port: peer_port,
                                    platform: info.get_property("platform")
                                        .map(|p| p.val_str().to_string())
                                        .unwrap_or_else(|| "unknown".to_string()),
                                };

                                let mut st = state_arc.lock().await;
                                let is_new = !st.peers.contains_key(&peer_did);
                                st.peers.insert(peer_did.clone(), peer.clone());
                                drop(st);

                                if is_new {
                                    let _ = app.emit("mdns-event", serde_json::json!({
                                        "type": "peer-found",
                                        "deviceId": peer.device_id,
                                        "nickname": peer.nickname,
                                        "ip": peer.ip,
                                        "port": peer.port,
                                        "platform": peer.platform,
                                        "transport": "mdns",
                                    }));
                                }
                            }
                            Some(ServiceEvent::ServiceRemoved(_, fullname)) => {
                                let mut st = state_arc.lock().await;
                                let to_remove = st.peers.iter()
                                    .find(|(_, p)| fullname.contains(&p.device_id[..8.min(p.device_id.len())]))
                                    .map(|(k, _)| k.clone());
                                if let Some(did) = to_remove {
                                    st.peers.remove(&did);
                                    drop(st);
                                    let _ = app.emit("mdns-event", serde_json::json!({
                                        "type": "peer-lost",
                                        "deviceId": did,
                                    }));
                                }
                            }
                            None => break,
                            _ => {}
                        }
                    }
                }
            }
        });

        // SDP HTTP server
        let state_arc2 = self.0.clone();
        let app2 = app;
        let did2 = device_id.clone();
        tokio::spawn(async move {
            run_sdp_server(port, state_arc2, app2, did2).await;
        });

        state.running = true;
        Ok(MdnsMyInfo { device_id: device_id.clone(), nickname, ip, port })
    }

    pub async fn stop(&self) {
        let mut state = self.0.lock().await;
        if !state.running { return; }
        if let Some(tx) = state.shutdown_tx.take() {
            let _ = tx.send(()).await;
        }
        state.peers.clear();
        state.running = false;
    }

    pub async fn get_peers(&self) -> Vec<MdnsPeer> {
        let state = self.0.lock().await;
        state.peers.values().cloned().collect()
    }

    pub async fn get_my_info(&self) -> MdnsMyInfo {
        let state = self.0.lock().await;
        MdnsMyInfo {
            device_id: state.my_device_id.clone(),
            nickname: state.my_nickname.clone(),
            ip: state.my_ip.clone(),
            port: state.sdp_port,
        }
    }

    pub async fn is_running(&self) -> bool {
        self.0.lock().await.running
    }

    pub async fn send_sdp(&self, peer_ip: String, peer_port: u16, sdp: String) -> bool {
        let device_id = self.0.lock().await.my_device_id.clone();
        send_sdp_to_peer(peer_ip, peer_port, device_id, sdp).await
    }
}

// ─── SDP HTTP Server ──────────────────────────────────────────────────────────

async fn run_sdp_server(
    port: u16,
    _state: Arc<Mutex<MdnsInner>>,
    app: AppHandle,
    my_device_id: String,
) {
    let listener = match TcpListener::bind(format!("0.0.0.0:{}", port)).await {
        Ok(l) => l,
        Err(_) => return,
    };
    loop {
        let Ok((stream, _)) = listener.accept().await else { continue };
        let app = app.clone();
        let did = my_device_id.clone();
        tokio::spawn(async move {
            handle_sdp_connection(stream, app, did).await;
        });
    }
}

async fn handle_sdp_connection(mut stream: TcpStream, app: AppHandle, my_device_id: String) {
    let mut buf = vec![0u8; 16384];
    let n = match stream.read(&mut buf).await {
        Ok(n) if n > 0 => n,
        _ => return,
    };

    let raw = String::from_utf8_lossy(&buf[..n]);
    let first_line = raw.lines().next().unwrap_or("");
    let parts: Vec<&str> = first_line.split_whitespace().collect();
    let method = parts.first().copied().unwrap_or("");
    let path = parts.get(1).copied().unwrap_or("/");

    if method == "OPTIONS" {
        let r = "HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\n\r\n";
        let _ = stream.write_all(r.as_bytes()).await;
        return;
    }

    if method == "GET" && path == "/ping" {
        let body = serde_json::json!({ "deviceId": my_device_id, "ok": true }).to_string();
        let r = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: {}\r\n\r\n{}",
            body.len(), body
        );
        let _ = stream.write_all(r.as_bytes()).await;
        return;
    }

    if method == "POST" && path.starts_with("/sdp/") {
        let from_id = url_decode(&path[5..]);
        // Body is after the blank line
        let body_start = raw.find("\r\n\r\n").map(|i| i + 4).unwrap_or(n);
        let sdp = String::from_utf8_lossy(&buf[body_start..n]).to_string();
        let _ = app.emit("mdns-event", serde_json::json!({
            "type": "sdp-received",
            "fromPeerId": from_id,
            "sdp": sdp,
        }));
        let r = "HTTP/1.1 200 OK\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: 2\r\n\r\nOK";
        let _ = stream.write_all(r.as_bytes()).await;
        return;
    }

    let r = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n";
    let _ = stream.write_all(r.as_bytes()).await;
}

fn url_decode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut bytes = s.bytes();
    while let Some(b) = bytes.next() {
        if b == b'%' {
            let h = bytes.next().unwrap_or(b'0') as char;
            let l = bytes.next().unwrap_or(b'0') as char;
            if let Ok(byte) = u8::from_str_radix(&format!("{}{}", h, l), 16) {
                out.push(byte as char);
                continue;
            }
        }
        out.push(b as char);
    }
    out
}

async fn send_sdp_to_peer(peer_ip: String, peer_port: u16, my_device_id: String, sdp: String) -> bool {
    let addr = format!("{}:{}", peer_ip, peer_port);
    let stream = tokio::time::timeout(
        Duration::from_secs(5),
        TcpStream::connect(&addr),
    ).await;

    let Ok(Ok(mut stream)) = stream else { return false };

    let path = format!("/sdp/{}", url_encode(&my_device_id));
    let body = sdp.as_bytes();
    let request = format!(
        "POST {} HTTP/1.1\r\nHost: {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n",
        path, addr, body.len()
    );
    if stream.write_all(request.as_bytes()).await.is_err() { return false; }
    if stream.write_all(body).await.is_err() { return false; }
    true
}

fn url_encode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~') {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{:02X}", b));
        }
    }
    out
}

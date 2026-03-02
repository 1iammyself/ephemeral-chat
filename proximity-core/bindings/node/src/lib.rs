//! Node.js (napi-rs) bindings for proximity-core
//!
//! Exposes the Rust QUIC engine to Electron via a native addon (.node file).
//! This is loaded by the Electron main process and communicated with via IPC.

// napi-rs bindings require global state for the engine singleton and event callback.
// These are accessed exclusively from Node.js's single main thread (event loop).
// The engine is created/destroyed dynamically via napi calls.
#![allow(static_mut_refs)]

use napi::bindgen_prelude::*;
use napi::threadsafe_function::{
    ErrorStrategy, ThreadsafeFunction, ThreadsafeFunctionCallMode,
};
use napi_derive::napi;
use proximity_core::{
    EngineConfig, EngineEvent, ProximityEngine,
    protocol::{DeviceType, Platform},
    discovery::DiscoveryEvent,
    transfer::TransferEvent,
    transport::TransportEvent,
    swarm::SwarmEvent,
};
use serde_json;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::{broadcast, Mutex};
use tracing_subscriber;

// Shared engine instance
static mut ENGINE: Option<Arc<Mutex<ProximityEngine>>> = None;
static mut EVENT_CALLBACK: Option<ThreadsafeFunction<String, ErrorStrategy::CalleeHandled>> = None;

fn get_engine() -> Result<Arc<Mutex<ProximityEngine>>> {
    unsafe {
        ENGINE
            .as_ref()
            .cloned()
            .ok_or_else(|| Error::new(Status::GenericFailure, "Engine not initialized"))
    }
}

// ─── Initialization ────────────────────────────────────────

#[napi(object)]
pub struct ProximityConfig {
    pub nickname: String,
    pub platform: String,
    pub device_type: String,
    pub bind_port: Option<u16>,
    pub download_dir: Option<String>,
    pub swarm_enabled: Option<bool>,
    pub chunk_size: Option<u32>,
    pub max_concurrent_transfers: Option<u32>,
}

#[napi]
pub fn init_logging() {
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::DEBUG)
        .with_target(false)
        .init();
}

#[napi]
pub async fn create_engine(config: ProximityConfig) -> Result<()> {
    let platform = match config.platform.as_str() {
        "electron" => Platform::Electron,
        "capacitor" | "android" => Platform::Capacitor,
        "web" => Platform::Web,
        _ => Platform::Electron,
    };

    let device_type = match config.device_type.as_str() {
        "desktop" => DeviceType::Desktop,
        "phone" => DeviceType::Phone,
        "tablet" => DeviceType::Tablet,
        _ => DeviceType::Desktop,
    };

    let engine_config = EngineConfig {
        port: config.bind_port.unwrap_or(0),
        nickname: config.nickname,
        platform,
        device_type,
        swarm_enabled: config.swarm_enabled.unwrap_or(true),
        download_dir: config
            .download_dir
            .map(PathBuf::from)
            .unwrap_or_else(|| std::env::temp_dir().join("ephemeral-chat-downloads")),
    };

    let engine = ProximityEngine::new(engine_config)
        .await
        .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to create engine: {}", e)))?;

    unsafe {
        ENGINE = Some(Arc::new(Mutex::new(engine)));
    }

    Ok(())
}

// ─── Lifecycle ─────────────────────────────────────────────

#[napi]
pub async fn start_engine() -> Result<String> {
    let engine = get_engine()?;
    let mut e = engine.lock().await;
    let addr = e
        .start()
        .await
        .map_err(|e| Error::new(Status::GenericFailure, format!("Failed to start: {}", e)))?;

    // Start event forwarding
    let rx = e.subscribe();
    drop(e);
    spawn_event_forwarder(rx);

    Ok(addr.to_string())
}

#[napi]
pub async fn stop_engine() -> Result<()> {
    let engine = get_engine()?;
    let mut e = engine.lock().await;
    e.stop().await;
    Ok(())
}

// ─── Event Subscription ───────────────────────────────────

#[napi]
pub fn on_event(callback: ThreadsafeFunction<String, ErrorStrategy::CalleeHandled>) {
    unsafe {
        EVENT_CALLBACK = Some(callback);
    }
}

fn spawn_event_forwarder(mut rx: broadcast::Receiver<EngineEvent>) {
    tokio::spawn(async move {
        while let Ok(event) = rx.recv().await {
            let json = match event_to_json(&event) {
                Ok(j) => j,
                Err(_) => continue,
            };

            unsafe {
                if let Some(ref cb) = EVENT_CALLBACK {
                    cb.call(Ok(json), ThreadsafeFunctionCallMode::NonBlocking);
                }
            }
        }
    });
}

fn event_to_json(event: &EngineEvent) -> Result<String> {
    let json = match event {
        EngineEvent::Started { local_addr } => {
            serde_json::json!({
                "type": "started",
                "localAddr": local_addr.to_string()
            })
        }
        EngineEvent::Stopped => {
            serde_json::json!({ "type": "stopped" })
        }
        EngineEvent::Discovery(disc_event) => {
            match disc_event {
                DiscoveryEvent::PeerFound(peer) => {
                    serde_json::json!({
                        "type": "peer_found",
                        "peer": {
                            "deviceId": peer.device_id,
                            "nickname": peer.nickname,
                            "addresses": peer.addresses,
                            "port": peer.port,
                            "platform": format!("{:?}", peer.platform),
                            "deviceType": format!("{:?}", peer.device_type),
                        }
                    })
                }
                DiscoveryEvent::PeerLost(device_id) => {
                    serde_json::json!({
                        "type": "peer_lost",
                        "deviceId": device_id
                    })
                }
                _ => serde_json::json!({ "type": "discovery_event" }),
            }
        }
        EngineEvent::Transfer(transfer_event) => {
            match transfer_event {
                TransferEvent::IncomingOffer { transfer_id, peer_id, file_name, file_size, mime_type } => {
                    serde_json::json!({
                        "type": "transfer_offer",
                        "transferId": transfer_id,
                        "peerId": peer_id,
                        "fileName": file_name,
                        "fileSize": file_size,
                        "mimeType": mime_type,
                    })
                }
                TransferEvent::SendProgress { transfer_id, bytes_sent, total_bytes, speed_bps } => {
                    serde_json::json!({
                        "type": "transfer_progress",
                        "transferId": transfer_id,
                        "bytesTransferred": bytes_sent,
                        "totalBytes": total_bytes,
                        "speedBps": speed_bps,
                        "direction": "send",
                    })
                }
                TransferEvent::ReceiveProgress { transfer_id, bytes_received, total_bytes, speed_bps } => {
                    serde_json::json!({
                        "type": "transfer_progress",
                        "transferId": transfer_id,
                        "bytesTransferred": bytes_received,
                        "totalBytes": total_bytes,
                        "speedBps": speed_bps,
                        "direction": "receive",
                    })
                }
                TransferEvent::Completed { transfer_id, total_bytes, duration_ms, speed_bps, verified } => {
                    serde_json::json!({
                        "type": "transfer_complete",
                        "transferId": transfer_id,
                        "totalBytes": total_bytes,
                        "durationMs": duration_ms,
                        "speedBps": speed_bps,
                        "verified": verified,
                    })
                }
                TransferEvent::Error { transfer_id, error } => {
                    serde_json::json!({
                        "type": "transfer_failed",
                        "transferId": transfer_id,
                        "error": error,
                    })
                }
                _ => serde_json::json!({ "type": "transfer_event" }),
            }
        }
        EngineEvent::Swarm(swarm_event) => {
            match swarm_event {
                SwarmEvent::PeerJoined { swarm_id, device_id, nickname } => {
                    serde_json::json!({
                        "type": "swarm_peer_joined",
                        "swarmId": swarm_id,
                        "deviceId": device_id,
                        "nickname": nickname,
                    })
                }
                SwarmEvent::PeerLeft { swarm_id, device_id, reason } => {
                    serde_json::json!({
                        "type": "swarm_peer_left",
                        "swarmId": swarm_id,
                        "deviceId": device_id,
                        "reason": reason,
                    })
                }
                SwarmEvent::TopologyChanged { swarm_id, peer_count, .. } => {
                    serde_json::json!({
                        "type": "swarm_topology_changed",
                        "swarmId": swarm_id,
                        "peerCount": peer_count,
                    })
                }
                _ => serde_json::json!({ "type": "swarm_event" }),
            }
        }
        EngineEvent::Error(msg) => {
            serde_json::json!({ "type": "error", "message": msg })
        }
        EngineEvent::Transport(transport_event) => {
            match transport_event {
                TransportEvent::IncomingConnection { peer_id, nickname, pairing_code, .. } => {
                    serde_json::json!({
                        "type": "incoming_connection",
                        "peerId": peer_id,
                        "nickname": nickname,
                        "pairingCode": pairing_code,
                    })
                }
                TransportEvent::OutgoingConnection { peer_id, nickname, pairing_code, .. } => {
                    serde_json::json!({
                        "type": "outgoing_connection",
                        "peerId": peer_id,
                        "nickname": nickname,
                        "pairingCode": pairing_code,
                    })
                }
                TransportEvent::ConnectionLost { peer_id, reason } => {
                    serde_json::json!({
                        "type": "connection_lost",
                        "peerId": peer_id,
                        "reason": reason,
                    })
                }
                _ => serde_json::json!({ "type": "transport_event" }),
            }
        }
    };

    serde_json::to_string(&json)
        .map_err(|e| Error::new(Status::GenericFailure, format!("JSON error: {}", e)))
}

// ─── Discovery ─────────────────────────────────────────────

#[napi(object)]
pub struct JsPeer {
    pub device_id: String,
    pub nickname: String,
    pub addresses: Vec<String>,
    pub port: u16,
    pub platform: String,
    pub device_type: String,
}

#[napi]
pub async fn get_discovered_peers() -> Result<Vec<JsPeer>> {
    let engine = get_engine()?;
    let e = engine.lock().await;
    let peers = e.get_discovered_peers();
    Ok(peers
        .into_iter()
        .map(|p| JsPeer {
            device_id: p.device_id,
            nickname: p.nickname,
            addresses: p.addresses.iter().map(|a| a.to_string()).collect(),
            port: p.port,
            platform: format!("{:?}", p.platform),
            device_type: format!("{:?}", p.device_type),
        })
        .collect())
}

// ─── Connection ────────────────────────────────────────────

#[napi]
pub async fn connect_to_peer(address: String) -> Result<String> {
    let addr = address
        .parse()
        .map_err(|e| Error::new(Status::InvalidArg, format!("Invalid address: {}", e)))?;
    let engine = get_engine()?;
    let e = engine.lock().await;
    e.connect_to_peer(addr)
        .await
        .map_err(|e| Error::new(Status::GenericFailure, format!("Connect failed: {}", e)))
}

#[napi]
pub async fn get_pairing_code(_peer_id: String) -> Result<Option<String>> {
    // Pairing codes are delivered via transport events (incoming_connection / outgoing_connection).
    // This is a convenience accessor — returns None since codes are ephemeral and event-driven.
    Ok(None)
}

// ─── Transfer ──────────────────────────────────────────────

#[napi]
pub async fn send_file(peer_id: String, file_path: String) -> Result<String> {
    let engine = get_engine()?;
    let e = engine.lock().await;
    e.send_file(&peer_id, &file_path)
        .await
        .map_err(|e| Error::new(Status::GenericFailure, format!("Send failed: {}", e)))
}

#[napi]
pub async fn accept_transfer(transfer_id: String) -> Result<()> {
    let engine = get_engine()?;
    let e = engine.lock().await;
    e.accept_transfer(&transfer_id)
        .await
        .map_err(|e| Error::new(Status::GenericFailure, format!("Accept failed: {}", e)))
}

#[napi]
pub async fn reject_transfer(transfer_id: String) -> Result<()> {
    let engine = get_engine()?;
    let e = engine.lock().await;
    e.reject_transfer(&transfer_id)
        .await
        .map_err(|e| Error::new(Status::GenericFailure, format!("Reject failed: {}", e)))
}

#[napi]
pub async fn cancel_transfer(transfer_id: String) -> Result<()> {
    let engine = get_engine()?;
    let e = engine.lock().await;
    e.cancel_transfer(&transfer_id)
        .await
        .map_err(|e| Error::new(Status::GenericFailure, format!("Cancel failed: {}", e)))
}

// ─── Swarm ─────────────────────────────────────────────────

#[napi(object)]
pub struct JsSwarmInfo {
    pub swarm_id: String,
    pub peer_count: u32,
    pub peers: Vec<JsSwarmPeer>,
}

#[napi(object)]
pub struct JsSwarmPeer {
    pub device_id: String,
    pub nickname: String,
    pub directly_connected: bool,
    pub rtt_ms: u32,
}

#[napi]
pub async fn create_swarm() -> Result<String> {
    let engine = get_engine()?;
    let e = engine.lock().await;
    e.create_swarm()
        .await
        .map_err(|e| Error::new(Status::GenericFailure, format!("Create swarm failed: {}", e)))
}

#[napi]
pub async fn join_swarm(swarm_id: String, known_peers: Vec<String>) -> Result<()> {
    let engine = get_engine()?;
    let e = engine.lock().await;
    e.join_swarm(&swarm_id, known_peers)
        .await
        .map_err(|e| Error::new(Status::GenericFailure, format!("Join swarm failed: {}", e)))
}

#[napi]
pub async fn leave_swarm() -> Result<()> {
    let engine = get_engine()?;
    let e = engine.lock().await;
    e.leave_swarm()
        .await
        .map_err(|e| Error::new(Status::GenericFailure, format!("Leave swarm failed: {}", e)))
}

#[napi]
pub async fn get_swarm_info() -> Result<Option<JsSwarmInfo>> {
    let engine = get_engine()?;
    let e = engine.lock().await;
    match e.get_swarm_info().await {
        Some(info) => Ok(Some(JsSwarmInfo {
            swarm_id: info.swarm_id,
            peer_count: info.peer_count as u32,
            peers: info
                .peers
                .into_iter()
                .map(|p| JsSwarmPeer {
                    device_id: p.device_id,
                    nickname: p.nickname,
                    directly_connected: p.directly_connected,
                    rtt_ms: p.rtt_ms,
                })
                .collect(),
        })),
        None => Ok(None),
    }
}

#[napi]
pub async fn calculate_swarm_route(
    source: String,
    dest: String,
    parallel_paths: u32,
) -> Result<Vec<Vec<String>>> {
    let engine = get_engine()?;
    let e = engine.lock().await;
    e.calculate_swarm_route(&source, &dest, parallel_paths)
        .await
        .map_err(|e| Error::new(Status::GenericFailure, format!("Route failed: {}", e)))
}

// ─── Utils ─────────────────────────────────────────────────

#[napi]
pub fn get_device_id() -> Result<String> {
    let engine = unsafe {
        ENGINE
            .as_ref()
            .ok_or_else(|| Error::new(Status::GenericFailure, "Engine not initialized"))?
    };
    // Return device_id — we need sync access so we use try_lock
    match engine.try_lock() {
        Ok(e) => Ok(e.device_id().to_string()),
        Err(_) => Err(Error::new(Status::GenericFailure, "Engine is busy")),
    }
}

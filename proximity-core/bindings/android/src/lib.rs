//! Android JNI bindings for proximity-core
//!
//! Exposes the Rust QUIC engine to Android (Capacitor) via JNI.
//! Loaded as a native library (.so) by the Android app.

// JNI bindings require global state for the JavaVM handle and engine instance.
// These are always accessed from Android's single JNI thread or synchronized via Mutex.
// OnceLock is not suitable here because JNI_OnLoad requires runtime initialization
// and the engine is created/destroyed dynamically via JNI calls.
#![allow(static_mut_refs)]

use jni::objects::{JClass, JObject, JString, JValue};
use jni::sys::{jboolean, jint, jstring, JNI_VERSION_1_6};
use jni::{JNIEnv, JavaVM};
use proximity_core::{
    EngineConfig, EngineEvent, ProximityEngine,
    protocol::{DeviceType, Platform},
};
use serde_json;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::runtime::Runtime;
use tokio::sync::Mutex;
use tracing::info;

// ─── Global State ──────────────────────────────────────────

static mut RUNTIME: Option<Runtime> = None;
static mut ENGINE: Option<Arc<Mutex<ProximityEngine>>> = None;
static mut JAVA_VM: Option<JavaVM> = None;
static mut CALLBACK_OBJ: Option<jni::objects::GlobalRef> = None;

fn get_runtime() -> &'static Runtime {
    unsafe { RUNTIME.as_ref().expect("Runtime not initialized") }
}

fn get_engine() -> Arc<Mutex<ProximityEngine>> {
    unsafe { ENGINE.as_ref().cloned().expect("Engine not initialized") }
}

// ─── JNI Lifecycle ─────────────────────────────────────────

#[no_mangle]
pub extern "system" fn JNI_OnLoad(vm: JavaVM, _reserved: *mut std::ffi::c_void) -> jint {
    // Initialize Android logging
    #[cfg(target_os = "android")]
    android_logger::init_once(
        android_logger::Config::default()
            .with_max_level(log::LevelFilter::Debug)
            .with_tag("ProximityCore"),
    );

    // Store JavaVM for callbacks
    unsafe {
        JAVA_VM = Some(vm);
    }

    // Create tokio runtime
    let runtime = Runtime::new().expect("Failed to create tokio runtime");
    unsafe {
        RUNTIME = Some(runtime);
    }

    info!("[JNI] Loaded proximity-core native library");
    JNI_VERSION_1_6 as jint
}

// ─── Engine Creation ───────────────────────────────────────

#[no_mangle]
pub extern "system" fn Java_me_kyere_chat_ProximityNative_createEngine(
    mut env: JNIEnv,
    _class: JClass,
    nickname: JString,
    download_dir: JString,
    bind_port: jint,
    swarm_enabled: jboolean,
) {
    let nickname: String = env.get_string(&nickname).unwrap().into();
    let download_dir: String = env.get_string(&download_dir).unwrap().into();

    let config = EngineConfig {
        port: bind_port as u16,
        nickname,
        platform: Platform::Capacitor,
        device_type: DeviceType::Phone,
        swarm_enabled: swarm_enabled != 0,
        download_dir: PathBuf::from(download_dir),
    };

    let rt = get_runtime();
    rt.block_on(async {
        match ProximityEngine::new(config).await {
            Ok(engine) => {
                unsafe {
                    ENGINE = Some(Arc::new(Mutex::new(engine)));
                }
                info!("[JNI] Engine created");
            }
            Err(e) => {
                let msg = format!("Failed to create engine: {}", e);
                let _ = env.throw_new("java/lang/RuntimeException", &msg);
            }
        }
    });
}

// ─── Engine Start/Stop ─────────────────────────────────────

#[no_mangle]
pub extern "system" fn Java_me_kyere_chat_ProximityNative_startEngine<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
) -> jstring {
    let rt = get_runtime();
    let engine = get_engine();

    let result = rt.block_on(async {
        let mut e = engine.lock().await;
        e.start().await
    });

    match result {
        Ok(addr) => {
            // Start event forwarding
            let engine2 = get_engine();
            rt.spawn(async move {
                let e = engine2.lock().await;
                let mut rx = e.subscribe();
                drop(e);

                while let Ok(event) = rx.recv().await {
                    forward_event_to_java(&event);
                }
            });

            let addr_str = addr.to_string();
            env.new_string(addr_str).unwrap().into_raw()
        }
        Err(e) => {
            let msg = format!("Failed to start: {}", e);
            let _ = env.throw_new("java/lang/RuntimeException", &msg);
            std::ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "system" fn Java_me_kyere_chat_ProximityNative_stopEngine(
    _env: JNIEnv,
    _class: JClass,
) {
    let rt = get_runtime();
    let engine = get_engine();
    rt.block_on(async {
        let mut e = engine.lock().await;
        e.stop().await;
    });
}

// ─── Event Callback Registration ───────────────────────────

#[no_mangle]
pub extern "system" fn Java_me_kyere_chat_ProximityNative_setEventCallback(
    env: JNIEnv,
    _class: JClass,
    callback: JObject,
) {
    let global_ref = env.new_global_ref(callback).unwrap();
    unsafe {
        CALLBACK_OBJ = Some(global_ref);
    }
    info!("[JNI] Event callback registered");
}

fn forward_event_to_java(event: &EngineEvent) {
    unsafe {
        let vm = match JAVA_VM.as_ref() {
            Some(vm) => vm,
            None => return,
        };
        let callback = match CALLBACK_OBJ.as_ref() {
            Some(cb) => cb,
            None => return,
        };

        let mut env = match vm.attach_current_thread() {
            Ok(env) => env,
            Err(_) => return,
        };

        let json = match event_to_json(event) {
            Some(j) => j,
            None => return,
        };

        if let Ok(jstr) = env.new_string(&json) {
            let _ = env.call_method(
                callback.as_obj(),
                "onEvent",
                "(Ljava/lang/String;)V",
                &[JValue::Object(&jstr.into())],
            );
        }
    }
}

fn event_to_json(event: &EngineEvent) -> Option<String> {
    let json = match event {
        EngineEvent::Started { local_addr } => {
            serde_json::json!({ "type": "started", "localAddr": local_addr.to_string() })
        }
        EngineEvent::Stopped => serde_json::json!({ "type": "stopped" }),
        EngineEvent::Discovery(disc) => {
            match disc {
                proximity_core::discovery::DiscoveryEvent::PeerFound(peer) => {
                    serde_json::json!({
                        "type": "peer_found",
                        "peer": {
                            "deviceId": peer.device_id,
                            "nickname": peer.nickname,
                            "port": peer.port,
                        }
                    })
                }
                proximity_core::discovery::DiscoveryEvent::PeerLost(id) => {
                    serde_json::json!({ "type": "peer_lost", "deviceId": id })
                }
                _ => serde_json::json!({ "type": "discovery" }),
            }
        }
        EngineEvent::Transfer(t) => {
            match t {
                proximity_core::transfer::TransferEvent::IncomingOffer {
                    transfer_id,
                    peer_id,
                    file_name,
                    file_size,
                    mime_type,
                } => serde_json::json!({
                    "type": "transfer_offer",
                    "transferId": transfer_id,
                    "peerId": peer_id,
                    "fileName": file_name,
                    "fileSize": file_size,
                    "mimeType": mime_type,
                }),
                proximity_core::transfer::TransferEvent::SendProgress {
                    transfer_id,
                    bytes_sent,
                    total_bytes,
                    speed_bps,
                } => serde_json::json!({
                    "type": "transfer_progress",
                    "transferId": transfer_id,
                    "bytesTransferred": bytes_sent,
                    "totalBytes": total_bytes,
                    "speedBps": speed_bps,
                    "direction": "send",
                }),
                proximity_core::transfer::TransferEvent::ReceiveProgress {
                    transfer_id,
                    bytes_received,
                    total_bytes,
                    speed_bps,
                } => serde_json::json!({
                    "type": "transfer_progress",
                    "transferId": transfer_id,
                    "bytesTransferred": bytes_received,
                    "totalBytes": total_bytes,
                    "speedBps": speed_bps,
                    "direction": "receive",
                }),
                proximity_core::transfer::TransferEvent::Completed {
                    transfer_id,
                    total_bytes,
                    duration_ms,
                    speed_bps,
                    verified,
                } => serde_json::json!({
                    "type": "transfer_complete",
                    "transferId": transfer_id,
                    "totalBytes": total_bytes,
                    "durationMs": duration_ms,
                    "speedBps": speed_bps,
                    "verified": verified,
                }),
                proximity_core::transfer::TransferEvent::Error {
                    transfer_id,
                    error,
                } => serde_json::json!({
                    "type": "transfer_failed",
                    "transferId": transfer_id,
                    "error": error,
                }),
                _ => serde_json::json!({ "type": "transfer" }),
            }
        }
        EngineEvent::Swarm(s) => {
            match s {
                proximity_core::swarm::SwarmEvent::PeerJoined {
                    swarm_id,
                    device_id,
                    nickname,
                } => serde_json::json!({
                    "type": "swarm_peer_joined",
                    "swarmId": swarm_id,
                    "deviceId": device_id,
                    "nickname": nickname,
                }),
                proximity_core::swarm::SwarmEvent::PeerLeft {
                    swarm_id,
                    device_id,
                    reason,
                } => serde_json::json!({
                    "type": "swarm_peer_left",
                    "swarmId": swarm_id,
                    "deviceId": device_id,
                    "reason": reason,
                }),
                _ => serde_json::json!({ "type": "swarm" }),
            }
        }
        EngineEvent::Error(msg) => serde_json::json!({ "type": "error", "message": msg }),
        EngineEvent::Transport(t) => {
            match t {
                proximity_core::transport::TransportEvent::IncomingConnection {
                    peer_id,
                    nickname,
                    pairing_code,
                    ..
                } => serde_json::json!({
                    "type": "incoming_connection",
                    "peerId": peer_id,
                    "nickname": nickname,
                    "pairingCode": pairing_code,
                }),
                proximity_core::transport::TransportEvent::OutgoingConnection {
                    peer_id,
                    nickname,
                    pairing_code,
                    ..
                } => serde_json::json!({
                    "type": "outgoing_connection",
                    "peerId": peer_id,
                    "nickname": nickname,
                    "pairingCode": pairing_code,
                }),
                proximity_core::transport::TransportEvent::ConnectionLost {
                    peer_id,
                    reason,
                } => serde_json::json!({
                    "type": "connection_lost",
                    "peerId": peer_id,
                    "reason": reason,
                }),
                _ => serde_json::json!({ "type": "transport" }),
            }
        }
    };

    serde_json::to_string(&json).ok()
}

// ─── Discovery ─────────────────────────────────────────────

#[no_mangle]
pub extern "system" fn Java_me_kyere_chat_ProximityNative_getDiscoveredPeers<'local>(
    env: JNIEnv<'local>,
    _class: JClass<'local>,
) -> jstring {
    let rt = get_runtime();
    let engine = get_engine();

    let peers = rt.block_on(async {
        let e = engine.lock().await;
        e.get_discovered_peers()
    });

    let json = serde_json::json!(
        peers
            .iter()
            .map(|p| serde_json::json!({
                "deviceId": p.device_id,
                "nickname": p.nickname,
                "addresses": p.addresses.iter().map(|a| a.to_string()).collect::<Vec<_>>(),
                "port": p.port,
            }))
            .collect::<Vec<_>>()
    );

    let json_str = serde_json::to_string(&json).unwrap_or_else(|_| "[]".to_string());
    env.new_string(json_str).unwrap().into_raw()
}

// ─── Connection ────────────────────────────────────────────

#[no_mangle]
pub extern "system" fn Java_me_kyere_chat_ProximityNative_connectToPeer<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    address: JString<'local>,
) -> jstring {
    let address: String = env.get_string(&address).unwrap().into();
    let rt = get_runtime();
    let engine = get_engine();

    let addr = match address.parse() {
        Ok(a) => a,
        Err(e) => {
            let _ = env.throw_new("java/lang/IllegalArgumentException", &format!("Invalid address: {}", e));
            return std::ptr::null_mut();
        }
    };

    match rt.block_on(async {
        let e = engine.lock().await;
        e.connect_to_peer(addr).await
    }) {
        Ok(peer_id) => env.new_string(peer_id).unwrap().into_raw(),
        Err(e) => {
            let _ = env.throw_new("java/lang/RuntimeException", &format!("Connect failed: {}", e));
            std::ptr::null_mut()
        }
    }
}

// ─── Transfer ──────────────────────────────────────────────

#[no_mangle]
pub extern "system" fn Java_me_kyere_chat_ProximityNative_sendFile<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
    peer_id: JString<'local>,
    file_path: JString<'local>,
) -> jstring {
    let peer_id: String = env.get_string(&peer_id).unwrap().into();
    let file_path: String = env.get_string(&file_path).unwrap().into();
    let rt = get_runtime();
    let engine = get_engine();

    match rt.block_on(async {
        let e = engine.lock().await;
        e.send_file(&peer_id, &file_path).await
    }) {
        Ok(transfer_id) => env.new_string(transfer_id).unwrap().into_raw(),
        Err(e) => {
            let _ = env.throw_new("java/lang/RuntimeException", &format!("Send failed: {}", e));
            std::ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "system" fn Java_me_kyere_chat_ProximityNative_acceptTransfer(
    mut env: JNIEnv,
    _class: JClass,
    transfer_id: JString,
) {
    let transfer_id: String = env.get_string(&transfer_id).unwrap().into();
    let rt = get_runtime();
    let engine = get_engine();

    if let Err(e) = rt.block_on(async {
        let e = engine.lock().await;
        e.accept_transfer(&transfer_id).await
    }) {
        let _ = env.throw_new("java/lang/RuntimeException", &format!("Accept failed: {}", e));
    }
}

#[no_mangle]
pub extern "system" fn Java_me_kyere_chat_ProximityNative_rejectTransfer(
    mut env: JNIEnv,
    _class: JClass,
    transfer_id: JString,
) {
    let transfer_id: String = env.get_string(&transfer_id).unwrap().into();
    let rt = get_runtime();
    let engine = get_engine();

    if let Err(e) = rt.block_on(async {
        let e = engine.lock().await;
        e.reject_transfer(&transfer_id).await
    }) {
        let _ = env.throw_new("java/lang/RuntimeException", &format!("Reject failed: {}", e));
    }
}

// ─── Swarm ─────────────────────────────────────────────────

#[no_mangle]
pub extern "system" fn Java_me_kyere_chat_ProximityNative_createSwarm<'local>(
    mut env: JNIEnv<'local>,
    _class: JClass<'local>,
) -> jstring {
    let rt = get_runtime();
    let engine = get_engine();

    match rt.block_on(async {
        let e = engine.lock().await;
        e.create_swarm().await
    }) {
        Ok(swarm_id) => env.new_string(swarm_id).unwrap().into_raw(),
        Err(e) => {
            let _ = env.throw_new("java/lang/RuntimeException", &format!("Create swarm failed: {}", e));
            std::ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "system" fn Java_me_kyere_chat_ProximityNative_getSwarmInfo<'local>(
    env: JNIEnv<'local>,
    _class: JClass<'local>,
) -> jstring {
    let rt = get_runtime();
    let engine = get_engine();

    let info = rt.block_on(async {
        let e = engine.lock().await;
        e.get_swarm_info().await
    });

    let json = match info {
        Some(i) => serde_json::json!({
            "swarmId": i.swarm_id,
            "peerCount": i.peer_count,
            "peers": i.peers.iter().map(|p| serde_json::json!({
                "deviceId": p.device_id,
                "nickname": p.nickname,
                "directlyConnected": p.directly_connected,
                "rttMs": p.rtt_ms,
            })).collect::<Vec<_>>()
        }),
        None => serde_json::json!(null),
    };

    let json_str = serde_json::to_string(&json).unwrap_or_else(|_| "null".to_string());
    env.new_string(json_str).unwrap().into_raw()
}

// ─── Device Info ───────────────────────────────────────────

#[no_mangle]
pub extern "system" fn Java_me_kyere_chat_ProximityNative_getDeviceId<'local>(
    env: JNIEnv<'local>,
    _class: JClass<'local>,
) -> jstring {
    let engine = get_engine();
    let result = match engine.try_lock() {
        Ok(e) => env.new_string(e.device_id()).unwrap().into_raw(),
        Err(_) => env.new_string("").unwrap().into_raw(),
    };
    result
}

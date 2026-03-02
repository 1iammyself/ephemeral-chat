//! Proximity Core — Rust QUIC engine for ephemeral peer-to-peer communication
//!
//! This is the core library that powers all proximity features:
//! - mDNS peer discovery on local network
//! - QUIC transport (Quinn) with ephemeral TLS certificates
//! - Chunked file transfers with integrity verification
//! - Multi-peer swarm mesh for 3+ device transfers
//!
//! The public API is exposed through the `ProximityEngine` struct,
//! which orchestrates all subsystems.

pub mod crypto;
pub mod discovery;
pub mod protocol;
pub mod swarm;
pub mod transfer;
pub mod transport;

use discovery::{DiscoveredPeer, DiscoveryEvent, DiscoveryService};
use protocol::{DeviceType, Platform};
use swarm::{SwarmEvent, SwarmManager};
use transfer::{TransferEvent, TransferManager};
use transport::{TransportEvent, TransportService};

use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::{broadcast, mpsc, Mutex, RwLock};
use tracing::info;

// ─── Engine Configuration ──────────────────────────────────

#[derive(Debug, Clone)]
pub struct EngineConfig {
    /// Port to bind for QUIC (0 = auto-assign)
    pub port: u16,
    /// Our device nickname shown to peers
    pub nickname: String,
    /// Platform type (Electron, Capacitor, Web)
    pub platform: Platform,
    /// Device type (Desktop, Phone, Tablet)
    pub device_type: DeviceType,
    /// Whether to enable swarm mode
    pub swarm_enabled: bool,
    /// Download directory for received files
    pub download_dir: PathBuf,
}

impl Default for EngineConfig {
    fn default() -> Self {
        Self {
            port: 0,
            nickname: "Unknown".to_string(),
            platform: Platform::Electron,
            device_type: DeviceType::Desktop,
            swarm_enabled: true,
            download_dir: std::env::temp_dir().join("ephemeral-chat-downloads"),
        }
    }
}

// ─── Engine Events ─────────────────────────────────────────

#[derive(Debug, Clone)]
pub enum EngineEvent {
    /// Engine started, bound to this address
    Started { local_addr: SocketAddr },
    /// Engine stopped
    Stopped,
    /// Peer discovery event
    Discovery(DiscoveryEvent),
    /// Transport event
    Transport(TransportEvent),
    /// Transfer event
    Transfer(TransferEvent),
    /// Swarm event
    Swarm(SwarmEvent),
    /// Error occurred
    Error(String),
}

// ─── ProximityEngine ───────────────────────────────────────

/// The main entry point for all proximity features.
///
/// ```no_run
/// use proximity_core::{ProximityEngine, EngineConfig};
///
/// #[tokio::main]
/// async fn main() {
///     let config = EngineConfig::default();
///     let mut engine = ProximityEngine::new(config).await.unwrap();
///     engine.start().await.unwrap();
///
///     // Subscribe to events
///     let mut rx = engine.subscribe();
///     while let Ok(event) = rx.recv().await {
///         println!("{:?}", event);
///     }
/// }
/// ```
pub struct ProximityEngine {
    config: EngineConfig,
    device_id: String,

    // Subsystems
    discovery: Option<DiscoveryService>,
    transport: Option<Arc<Mutex<TransportService>>>,
    transfer: Option<Arc<Mutex<TransferManager>>>,
    swarm: Option<Arc<Mutex<SwarmManager>>>,

    // Event broadcasting
    event_tx: broadcast::Sender<EngineEvent>,

    // Lifecycle
    running: Arc<RwLock<bool>>,
    shutdown_tx: Option<mpsc::Sender<()>>,
}

impl ProximityEngine {
    /// Create a new engine instance (does NOT start networking yet)
    pub async fn new(config: EngineConfig) -> Result<Self, EngineError> {
        // Generate a device_id from hostname + platform
        let hostname = hostname::get()
            .map(|h| h.to_string_lossy().to_string())
            .unwrap_or_else(|_| "unknown".to_string());
        let raw = format!("{}-{:?}-{}", hostname, config.platform, config.nickname);
        let device_id = crypto::hash_file_data(raw.as_bytes())[..16].to_string();

        let (event_tx, _) = broadcast::channel(512);

        // Ensure download dir exists
        tokio::fs::create_dir_all(&config.download_dir)
            .await
            .map_err(|e| EngineError::IoError(e.to_string()))?;

        info!(
            "[Engine] Created with device_id={}, nickname={}",
            device_id, config.nickname
        );

        Ok(Self {
            config,
            device_id,
            discovery: None,
            transport: None,
            transfer: None,
            swarm: None,
            event_tx,
            running: Arc::new(RwLock::new(false)),
            shutdown_tx: None,
        })
    }

    /// Start the engine: bind QUIC port, start mDNS, begin accepting connections
    pub async fn start(&mut self) -> Result<SocketAddr, EngineError> {
        if *self.running.read().await {
            return Err(EngineError::AlreadyRunning);
        }

        // 1. Create transport (QUIC endpoint)
        let mut transport_service = TransportService::new(
            self.device_id.clone(),
            self.config.nickname.clone(),
            self.config.platform.clone(),
            self.config.device_type.clone(),
        )
        .map_err(|e| EngineError::TransportError(e.to_string()))?;

        // Start listening (binds UDP port, begins accept loop)
        let local_addr = transport_service
            .start(self.config.port)
            .await
            .map_err(|e| EngineError::TransportError(e.to_string()))?;

        let transport = Arc::new(Mutex::new(transport_service));

        // 2. Create transfer manager
        let transfer_manager = TransferManager::new(
            transport.clone(),
            self.config.download_dir.clone(),
        );
        let transfer = Arc::new(Mutex::new(transfer_manager));

        // 3. Create swarm manager (if enabled)
        let swarm = if self.config.swarm_enabled {
            let swarm_mgr = SwarmManager::new(transport.clone());
            Some(Arc::new(Mutex::new(swarm_mgr)))
        } else {
            None
        };

        // 4. Start mDNS discovery
        let mut discovery = DiscoveryService::new(
            self.device_id.clone(),
            self.config.nickname.clone(),
            self.config.platform.clone(),
            self.config.device_type.clone(),
            local_addr.port(),
        );
        let discovery_rx = discovery.subscribe();
        discovery
            .start()
            .map_err(|e| EngineError::DiscoveryError(e.to_string()))?;

        // Store subsystems
        self.transport = Some(transport.clone());
        self.transfer = Some(transfer.clone());
        self.swarm = swarm.clone();
        self.discovery = Some(discovery);

        // 5. Start event forwarding loop
        let (shutdown_tx, _shutdown_rx) = mpsc::channel(1);
        self.shutdown_tx = Some(shutdown_tx);

        let event_tx = self.event_tx.clone();
        let running = self.running.clone();

        // Forward discovery events
        let event_tx2 = event_tx.clone();
        tokio::spawn(async move {
            let mut rx = discovery_rx;
            while let Ok(event) = rx.recv().await {
                let _ = event_tx2.send(EngineEvent::Discovery(event));
            }
        });

        // Forward transport events
        let transport_rx = {
            let t = transport.lock().await;
            t.subscribe()
        };
        let event_tx3 = event_tx.clone();
        tokio::spawn(async move {
            let mut rx = transport_rx;
            while let Ok(event) = rx.recv().await {
                let _ = event_tx3.send(EngineEvent::Transport(event));
            }
        });

        // Forward transfer events
        let transfer_rx = {
            let t = transfer.lock().await;
            t.subscribe()
        };
        let event_tx4 = event_tx.clone();
        tokio::spawn(async move {
            let mut rx = transfer_rx;
            while let Ok(event) = rx.recv().await {
                let _ = event_tx4.send(EngineEvent::Transfer(event));
            }
        });

        // Forward swarm events
        if let Some(ref swarm) = swarm {
            let swarm_rx = {
                let s = swarm.lock().await;
                s.subscribe()
            };
            let event_tx5 = event_tx.clone();
            tokio::spawn(async move {
                let mut rx = swarm_rx;
                while let Ok(event) = rx.recv().await {
                    let _ = event_tx5.send(EngineEvent::Swarm(event));
                }
            });
        }

        *running.write().await = true;

        let _ = event_tx.send(EngineEvent::Started { local_addr });
        info!("[Engine] Started on {}", local_addr);

        Ok(local_addr)
    }

    /// Stop the engine and all subsystems
    pub async fn stop(&mut self) {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.try_send(());
        }

        // Leave swarm if active
        if let Some(ref swarm) = self.swarm {
            let mut s = swarm.lock().await;
            s.leave_swarm("engine stopping").await;
        }

        // Stop discovery
        if let Some(ref mut discovery) = self.discovery {
            discovery.stop();
        }

        // Stop transport
        if let Some(ref transport) = self.transport {
            let mut t = transport.lock().await;
            t.stop();
        }

        *self.running.write().await = false;
        let _ = self.event_tx.send(EngineEvent::Stopped);
        info!("[Engine] Stopped");
    }

    /// Subscribe to all engine events
    pub fn subscribe(&self) -> broadcast::Receiver<EngineEvent> {
        self.event_tx.subscribe()
    }

    // ─── Discovery API ─────────────────────────────────────

    /// Get currently discovered peers
    pub fn get_discovered_peers(&self) -> Vec<DiscoveredPeer> {
        self.discovery
            .as_ref()
            .map(|d| d.get_peers())
            .unwrap_or_default()
    }

    // ─── Connection API ────────────────────────────────────

    /// Connect to a specific peer by address
    pub async fn connect_to_peer(&self, addr: SocketAddr) -> Result<String, EngineError> {
        let transport = self
            .transport
            .as_ref()
            .ok_or(EngineError::NotRunning)?;
        let t = transport.lock().await;
        t.connect(addr)
            .await
            .map_err(|e| EngineError::TransportError(e.to_string()))
    }

    /// Disconnect from a peer
    pub fn disconnect_peer(&self, peer_id: &str) {
        if let Some(ref transport) = self.transport {
            if let Ok(t) = transport.try_lock() {
                t.disconnect_peer(peer_id);
            }
        }
    }

    // ─── Transfer API ──────────────────────────────────────

    /// Send a file to a connected peer
    pub async fn send_file(
        &self,
        peer_id: &str,
        file_path: &str,
    ) -> Result<String, EngineError> {
        let transfer = self.transfer.as_ref().ok_or(EngineError::NotRunning)?;
        let t = transfer.lock().await;
        t.send_file(peer_id, Path::new(file_path))
            .await
            .map_err(|e| EngineError::TransferError(e.to_string()))
    }

    /// Accept an incoming transfer offer
    pub async fn accept_transfer(&self, transfer_id: &str) -> Result<(), EngineError> {
        let transfer = self.transfer.as_ref().ok_or(EngineError::NotRunning)?;
        let t = transfer.lock().await;
        t.accept_transfer(transfer_id)
            .await
            .map_err(|e| EngineError::TransferError(e.to_string()))
    }

    /// Reject an incoming transfer offer
    pub async fn reject_transfer(&self, transfer_id: &str) -> Result<(), EngineError> {
        let transfer = self.transfer.as_ref().ok_or(EngineError::NotRunning)?;
        let t = transfer.lock().await;
        t.reject_transfer(transfer_id, "user rejected")
            .await
            .map_err(|e| EngineError::TransferError(e.to_string()))
    }

    /// Cancel an active transfer
    pub async fn cancel_transfer(&self, transfer_id: &str) -> Result<(), EngineError> {
        let transfer = self.transfer.as_ref().ok_or(EngineError::NotRunning)?;
        let t = transfer.lock().await;
        t.cancel_transfer(transfer_id, "user cancelled")
            .await
            .map_err(|e| EngineError::TransferError(e.to_string()))
    }

    // ─── Swarm API ─────────────────────────────────────────

    /// Create a new swarm (this device is the first member)
    pub async fn create_swarm(&self) -> Result<String, EngineError> {
        let swarm = self.swarm.as_ref().ok_or(EngineError::SwarmDisabled)?;
        let mut s = swarm.lock().await;
        let swarm_id = s
            .create_swarm(
                &self.device_id,
                &self.config.nickname,
                self.config.platform.clone(),
                self.config.device_type.clone(),
            )
            .await;
        Ok(swarm_id)
    }

    /// Join an existing swarm
    pub async fn join_swarm(
        &self,
        swarm_id: &str,
        known_peer_ids: Vec<String>,
    ) -> Result<(), EngineError> {
        let swarm = self.swarm.as_ref().ok_or(EngineError::SwarmDisabled)?;
        let mut s = swarm.lock().await;
        s.join_swarm(
            swarm_id,
            &self.device_id,
            &self.config.nickname,
            self.config.platform.clone(),
            self.config.device_type.clone(),
            known_peer_ids,
        )
        .await
        .map_err(|e| EngineError::SwarmError(e.to_string()))
    }

    /// Leave the current swarm
    pub async fn leave_swarm(&self) -> Result<(), EngineError> {
        let swarm = self.swarm.as_ref().ok_or(EngineError::SwarmDisabled)?;
        let mut s = swarm.lock().await;
        s.leave_swarm("user requested").await;
        Ok(())
    }

    /// Get current swarm info
    pub async fn get_swarm_info(&self) -> Option<swarm::SwarmInfo> {
        if let Some(ref swarm) = self.swarm {
            let s = swarm.lock().await;
            s.get_swarm_info().await
        } else {
            None
        }
    }

    /// Calculate multi-path routes in swarm
    pub async fn calculate_swarm_route(
        &self,
        source: &str,
        dest: &str,
        parallel_paths: u32,
    ) -> Result<Vec<Vec<String>>, EngineError> {
        let swarm = self.swarm.as_ref().ok_or(EngineError::SwarmDisabled)?;
        let s = swarm.lock().await;
        s.calculate_route(source, dest, parallel_paths)
            .await
            .map_err(|e| EngineError::SwarmError(e.to_string()))
    }

    // ─── Getters ───────────────────────────────────────────

    pub fn device_id(&self) -> &str {
        &self.device_id
    }

    pub fn nickname(&self) -> &str {
        &self.config.nickname
    }

    pub async fn is_running_async(&self) -> bool {
        *self.running.read().await
    }

    pub fn transport(&self) -> Option<&Arc<Mutex<TransportService>>> {
        self.transport.as_ref()
    }
}

// ─── Engine Errors ─────────────────────────────────────────

#[derive(Debug, thiserror::Error)]
pub enum EngineError {
    #[error("engine is already running")]
    AlreadyRunning,
    #[error("engine is not running")]
    NotRunning,
    #[error("swarm mode is disabled")]
    SwarmDisabled,
    #[error("crypto error: {0}")]
    CryptoError(String),
    #[error("transport error: {0}")]
    TransportError(String),
    #[error("discovery error: {0}")]
    DiscoveryError(String),
    #[error("transfer error: {0}")]
    TransferError(String),
    #[error("swarm error: {0}")]
    SwarmError(String),
    #[error("IO error: {0}")]
    IoError(String),
}

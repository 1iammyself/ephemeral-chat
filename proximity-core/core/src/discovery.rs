//! Discovery — mDNS-based peer discovery on the local network
//!
//! Advertises this device as `_ephchat._udp.local` with TXT records
//! containing device info. Browses for other devices advertising the same.
//! Runs in a background task, emitting events when peers appear/disappear.

use crate::protocol::{DeviceType, PeerInfoPayload, Platform};
use dashmap::DashMap;
use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{broadcast, mpsc};
use tracing::{debug, error, info};

/// mDNS service type for Ephemeral Chat proximity discovery
const SERVICE_TYPE: &str = "_ephchat._udp.local.";

/// How long before a peer is considered stale
const PEER_TIMEOUT: Duration = Duration::from_secs(15);

/// How often to check for stale peers
const CLEANUP_INTERVAL: Duration = Duration::from_secs(5);

/// How often to re-announce ourselves
#[allow(dead_code)]
const ANNOUNCE_INTERVAL: Duration = Duration::from_secs(3);

// ─── Discovery Events ──────────────────────────────────────

#[derive(Debug, Clone)]
pub enum DiscoveryEvent {
    /// A new peer appeared
    PeerFound(DiscoveredPeer),
    /// A peer's info was updated
    PeerUpdated(DiscoveredPeer),
    /// A peer disappeared (timeout or explicit departure)
    PeerLost(String), // device_id
}

#[derive(Debug, Clone)]
pub struct DiscoveredPeer {
    pub device_id: String,
    pub nickname: String,
    pub platform: Platform,
    pub device_type: DeviceType,
    pub addresses: Vec<String>,
    pub port: u16,
    pub last_seen: Instant,
}

impl DiscoveredPeer {
    pub fn to_peer_info(&self) -> PeerInfoPayload {
        PeerInfoPayload {
            device_id: self.device_id.clone(),
            nickname: self.nickname.clone(),
            platform: self.platform.clone(),
            device_type: self.device_type.clone(),
            addresses: self.addresses.clone(),
            capabilities: Default::default(),
        }
    }
}

// ─── Discovery Service ─────────────────────────────────────

pub struct DiscoveryService {
    /// Our device info
    device_id: String,
    nickname: String,
    platform: Platform,
    device_type: DeviceType,
    port: u16,

    /// Known peers
    peers: Arc<DashMap<String, DiscoveredPeer>>,

    /// Event broadcaster
    event_tx: broadcast::Sender<DiscoveryEvent>,

    /// Shutdown signal
    shutdown_tx: Option<mpsc::Sender<()>>,
}

impl DiscoveryService {
    /// Create a new discovery service (doesn't start yet)
    pub fn new(
        device_id: String,
        nickname: String,
        platform: Platform,
        device_type: DeviceType,
        port: u16,
    ) -> Self {
        let (event_tx, _) = broadcast::channel(256);
        Self {
            device_id,
            nickname,
            platform,
            device_type,
            port,
            peers: Arc::new(DashMap::new()),
            event_tx,
            shutdown_tx: None,
        }
    }

    /// Subscribe to discovery events
    pub fn subscribe(&self) -> broadcast::Receiver<DiscoveryEvent> {
        self.event_tx.subscribe()
    }

    /// Get a snapshot of all known peers
    pub fn get_peers(&self) -> Vec<DiscoveredPeer> {
        self.peers.iter().map(|r| r.value().clone()).collect()
    }

    /// Get a specific peer by device_id
    pub fn get_peer(&self, device_id: &str) -> Option<DiscoveredPeer> {
        self.peers.get(device_id).map(|r| r.value().clone())
    }

    /// Number of known peers
    pub fn peer_count(&self) -> usize {
        self.peers.len()
    }

    /// Start the discovery service (advertise + browse)
    pub fn start(&mut self) -> Result<(), DiscoveryError> {
        if self.shutdown_tx.is_some() {
            return Err(DiscoveryError::AlreadyRunning);
        }

        let (shutdown_tx, mut shutdown_rx) = mpsc::channel::<()>(1);
        self.shutdown_tx = Some(shutdown_tx);

        // Create the mDNS daemon
        let mdns = ServiceDaemon::new()
            .map_err(|e| DiscoveryError::DaemonStart(e.to_string()))?;

        // Register our service
        let instance_name = format!("ephchat-{}", &self.device_id[..8.min(self.device_id.len())]);
        let platform_str = self.platform.to_string();
        let device_type_str = format!("{:?}", self.device_type);
        let properties = vec![
            ("device_id", self.device_id.as_str()),
            ("nickname", self.nickname.as_str()),
            ("platform", platform_str.as_str()),
            ("device_type", device_type_str.as_str()),
            ("version", "1"),
        ];

        let txt_properties: Vec<(&str, &str)> = properties;

        let service_info = ServiceInfo::new(
            SERVICE_TYPE,
            &instance_name,
            &format!("{}.local.", &instance_name),
            "",
            self.port,
            &txt_properties[..],
        )
        .map_err(|e| DiscoveryError::Registration(e.to_string()))?;

        mdns.register(service_info.clone())
            .map_err(|e| DiscoveryError::Registration(e.to_string()))?;

        info!(
            "[Discovery] Registered as {} on port {}",
            instance_name, self.port
        );

        // Browse for peers
        let browse_receiver = mdns
            .browse(SERVICE_TYPE)
            .map_err(|e| DiscoveryError::Browse(e.to_string()))?;

        let peers = self.peers.clone();
        let event_tx = self.event_tx.clone();
        let my_device_id = self.device_id.clone();

        // Spawn the browse + cleanup task
        tokio::spawn(async move {
            let mut cleanup_timer = tokio::time::interval(CLEANUP_INTERVAL);

            loop {
                tokio::select! {
                    _ = shutdown_rx.recv() => {
                        info!("[Discovery] Shutting down");
                        let _ = mdns.unregister(service_info.get_fullname());
                        let _ = mdns.shutdown();
                        break;
                    }

                    _ = cleanup_timer.tick() => {
                        // Remove stale peers
                        let now = Instant::now();
                        let stale: Vec<String> = peers
                            .iter()
                            .filter(|r| now.duration_since(r.last_seen) > PEER_TIMEOUT)
                            .map(|r| r.key().clone())
                            .collect();
                        for device_id in stale {
                            if peers.remove(&device_id).is_some() {
                                debug!("[Discovery] Peer timed out: {}", device_id);
                                let _ = event_tx.send(DiscoveryEvent::PeerLost(device_id));
                            }
                        }
                    }

                    event = tokio::task::spawn_blocking({
                        let receiver = browse_receiver.clone();
                        move || receiver.recv_timeout(Duration::from_millis(200))
                    }) => {
                        match event {
                            Ok(Ok(service_event)) => {
                                handle_service_event(
                                    service_event,
                                    &my_device_id,
                                    &peers,
                                    &event_tx,
                                );
                            }
                            Ok(Err(_)) => {
                                // recv_timeout — no events, continue
                            }
                            Err(e) => {
                                error!("[Discovery] Browse task error: {}", e);
                            }
                        }
                    }
                }
            }
        });

        Ok(())
    }

    /// Stop the discovery service
    pub fn stop(&mut self) {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.try_send(());
        }
    }

    /// Check if the service is running
    pub fn is_running(&self) -> bool {
        self.shutdown_tx.is_some()
    }
}

impl Drop for DiscoveryService {
    fn drop(&mut self) {
        self.stop();
    }
}

// ─── Event Handling ────────────────────────────────────────

fn handle_service_event(
    event: ServiceEvent,
    my_device_id: &str,
    peers: &DashMap<String, DiscoveredPeer>,
    event_tx: &broadcast::Sender<DiscoveryEvent>,
) {
    match event {
        ServiceEvent::ServiceResolved(info) => {
            let device_id = get_txt_property(&info, "device_id").unwrap_or_default();

            // Don't discover ourselves
            if device_id == my_device_id || device_id.is_empty() {
                return;
            }

            let nickname = get_txt_property(&info, "nickname").unwrap_or_else(|| "Unknown".into());
            let platform = match get_txt_property(&info, "platform").as_deref() {
                Some("electron") => Platform::Electron,
                Some("android") => Platform::Android,
                Some("web") => Platform::Web,
                _ => Platform::Unknown,
            };
            let device_type = match get_txt_property(&info, "device_type").as_deref() {
                Some("Desktop") => DeviceType::Desktop,
                Some("Phone") => DeviceType::Phone,
                Some("Tablet") => DeviceType::Tablet,
                _ => DeviceType::Unknown,
            };

            let addresses: Vec<String> = info
                .get_addresses()
                .iter()
                .map(|a| a.to_string())
                .collect();

            let peer = DiscoveredPeer {
                device_id: device_id.clone(),
                nickname,
                platform,
                device_type,
                addresses,
                port: info.get_port(),
                last_seen: Instant::now(),
            };

            let is_new = !peers.contains_key(&device_id);
            peers.insert(device_id.clone(), peer.clone());

            if is_new {
                info!("[Discovery] Found peer: {} ({})", peer.nickname, device_id);
                let _ = event_tx.send(DiscoveryEvent::PeerFound(peer));
            } else {
                debug!("[Discovery] Updated peer: {}", device_id);
                let _ = event_tx.send(DiscoveryEvent::PeerUpdated(peer));
            }
        }
        ServiceEvent::ServiceRemoved(_, fullname) => {
            // Try to find the peer by instance name
            let maybe_device_id: Option<String> = peers
                .iter()
                .find(|r| fullname.contains(&r.device_id[..8.min(r.device_id.len())]))
                .map(|r| r.key().clone());

            if let Some(device_id) = maybe_device_id {
                peers.remove(&device_id);
                info!("[Discovery] Peer removed: {}", device_id);
                let _ = event_tx.send(DiscoveryEvent::PeerLost(device_id));
            }
        }
        ServiceEvent::SearchStarted(_) => {
            debug!("[Discovery] mDNS browse started");
        }
        ServiceEvent::SearchStopped(_) => {
            debug!("[Discovery] mDNS browse stopped");
        }
        _ => {}
    }
}

fn get_txt_property(info: &ServiceInfo, key: &str) -> Option<String> {
    info.get_property(key)
        .map(|p| p.val_str().to_string())
}

// ─── Errors ────────────────────────────────────────────────

#[derive(Debug, thiserror::Error)]
pub enum DiscoveryError {
    #[error("discovery service already running")]
    AlreadyRunning,
    #[error("failed to start mDNS daemon: {0}")]
    DaemonStart(String),
    #[error("failed to register service: {0}")]
    Registration(String),
    #[error("failed to start browsing: {0}")]
    Browse(String),
}

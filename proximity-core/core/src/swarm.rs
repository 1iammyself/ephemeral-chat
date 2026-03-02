//! Swarm — Multi-peer mesh network for 3+ device transfers
//!
//! Enables multiple peers to form a mesh topology where:
//! - Every peer can discover and connect to every other peer
//! - Files can be relayed through intermediary peers
//! - Large files can be split across multiple paths for parallel transfer
//! - The topology is self-healing: if a peer drops, routes are recalculated
//!
//! Architecture:
//! ```text
//!   Alice ──── Bob
//!     │  \    / │
//!     │   \  /  │
//!     │    \/   │
//!     │    /\   │
//!     │   /  \  │
//!     │  /    \ │
//!   Charlie ── Dave
//! ```
//!
//! Use cases:
//! 1. Send file to ALL peers simultaneously (broadcast/multicast)
//! 2. Send file to a specific peer, routed through the best path
//! 3. Split a large file across multiple paths for maximum throughput
//! 4. Relay files between peers that can't directly connect

use crate::protocol::{
    DeviceType, MessageType, PeerInfoPayload, PeerStats, Platform, SwarmJoinPayload,
    SwarmLeavePayload, SwarmRelayPayload, SwarmTopologyPayload,
};
use crate::transport::TransportService;
use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{broadcast, mpsc, Mutex, RwLock};
use tracing::{debug, info, warn};
use uuid::Uuid;

/// Maximum TTL for relayed messages (prevent infinite loops)
#[allow(dead_code)]
const MAX_RELAY_TTL: u8 = 10;

/// How often to broadcast topology updates
const TOPOLOGY_BROADCAST_INTERVAL: Duration = Duration::from_secs(5);

/// How often to measure peer latency
const LATENCY_PROBE_INTERVAL: Duration = Duration::from_secs(3);

/// Maximum peers in a single swarm
const MAX_SWARM_PEERS: usize = 20;

// ─── Swarm Events ──────────────────────────────────────────

#[derive(Debug, Clone)]
pub enum SwarmEvent {
    /// A new peer joined the swarm
    PeerJoined {
        swarm_id: String,
        device_id: String,
        nickname: String,
    },
    /// A peer left the swarm
    PeerLeft {
        swarm_id: String,
        device_id: String,
        reason: String,
    },
    /// Topology changed (peers added/removed, routes recalculated)
    TopologyChanged {
        swarm_id: String,
        peer_count: usize,
        adjacency: HashMap<String, Vec<String>>,
    },
    /// Route was calculated for a transfer
    RouteCalculated {
        transfer_id: String,
        paths: Vec<Vec<String>>,
    },
    /// Relay data received (we're an intermediary)
    RelayForward {
        transfer_id: String,
        next_hop: String,
    },
}

// ─── Swarm Peer ────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct SwarmPeer {
    pub device_id: String,
    pub nickname: String,
    pub platform: Platform,
    pub device_type: DeviceType,
    /// Direct connections from this peer
    pub connections: HashSet<String>,
    pub stats: PeerStats,
    pub last_seen: Instant,
    /// Whether we have a direct QUIC connection to this peer
    pub directly_connected: bool,
}

// ─── Swarm State ───────────────────────────────────────────

#[allow(dead_code)]
struct SwarmState {
    swarm_id: String,
    my_device_id: String,
    /// All known peers in the swarm (including ourselves)
    peers: HashMap<String, SwarmPeer>,
    /// Full adjacency map: peer → set of connected peers
    adjacency: HashMap<String, HashSet<String>>,
    /// Cached shortest paths between peer pairs
    route_cache: HashMap<(String, String), Vec<Vec<String>>>,
    /// When the route cache was last computed
    route_cache_time: Instant,
}

impl SwarmState {
    fn new(swarm_id: String, my_device_id: String) -> Self {
        Self {
            swarm_id,
            my_device_id,
            peers: HashMap::new(),
            adjacency: HashMap::new(),
            route_cache: HashMap::new(),
            route_cache_time: Instant::now(),
        }
    }

    /// Add or update a peer in the swarm
    fn upsert_peer(&mut self, peer: SwarmPeer) {
        let device_id = peer.device_id.clone();
        self.adjacency
            .entry(device_id.clone())
            .or_default()
            .extend(peer.connections.iter().cloned());
        self.peers.insert(device_id, peer);
        self.invalidate_routes();
    }

    /// Remove a peer from the swarm
    fn remove_peer(&mut self, device_id: &str) {
        self.peers.remove(device_id);
        self.adjacency.remove(device_id);
        // Remove from other peers' adjacency lists
        for connections in self.adjacency.values_mut() {
            connections.remove(device_id);
        }
        self.invalidate_routes();
    }

    /// Record a direct connection between two peers
    fn add_edge(&mut self, a: &str, b: &str) {
        self.adjacency.entry(a.to_string()).or_default().insert(b.to_string());
        self.adjacency.entry(b.to_string()).or_default().insert(a.to_string());
        if let Some(peer) = self.peers.get_mut(a) {
            peer.connections.insert(b.to_string());
        }
        if let Some(peer) = self.peers.get_mut(b) {
            peer.connections.insert(a.to_string());
        }
        self.invalidate_routes();
    }

    /// Remove a connection edge
    #[allow(dead_code)]
    fn remove_edge(&mut self, a: &str, b: &str) {
        if let Some(set) = self.adjacency.get_mut(a) {
            set.remove(b);
        }
        if let Some(set) = self.adjacency.get_mut(b) {
            set.remove(a);
        }
        self.invalidate_routes();
    }

    fn invalidate_routes(&mut self) {
        self.route_cache.clear();
    }

    /// Find ALL paths between source and destination (BFS, up to max_paths)
    fn find_paths(&mut self, source: &str, dest: &str, max_paths: usize) -> Vec<Vec<String>> {
        let cache_key = (source.to_string(), dest.to_string());
        if let Some(cached) = self.route_cache.get(&cache_key) {
            return cached.clone();
        }

        let mut all_paths: Vec<Vec<String>> = Vec::new();
        let mut queue: VecDeque<Vec<String>> = VecDeque::new();
        queue.push_back(vec![source.to_string()]);

        while let Some(path) = queue.pop_front() {
            if all_paths.len() >= max_paths {
                break;
            }

            let current = path.last().unwrap();
            if current == dest {
                all_paths.push(path);
                continue;
            }

            if let Some(neighbors) = self.adjacency.get(current) {
                for neighbor in neighbors {
                    if !path.contains(neighbor) {
                        let mut new_path = path.clone();
                        new_path.push(neighbor.clone());
                        queue.push_back(new_path);
                    }
                }
            }
        }

        // Sort by path length (shortest first)
        all_paths.sort_by_key(|p| p.len());

        self.route_cache.insert(cache_key, all_paths.clone());
        all_paths
    }

    /// Find the shortest path between two peers
    fn shortest_path(&mut self, source: &str, dest: &str) -> Option<Vec<String>> {
        self.find_paths(source, dest, 1).into_iter().next()
    }

    /// Score a path based on latency and bandwidth of each hop
    fn score_path(&self, path: &[String]) -> f64 {
        if path.len() <= 1 {
            return f64::MAX; // Invalid
        }

        let mut total_latency = 0.0;
        let mut min_bandwidth = u64::MAX;

        for peer_id in path {
            if let Some(peer) = self.peers.get(peer_id) {
                total_latency += peer.stats.rtt_ms as f64;
                min_bandwidth = min_bandwidth.min(peer.stats.bandwidth_bps);
            }
        }

        // Higher score = better path
        // Prefer low latency and high bandwidth
        let hops = (path.len() - 1) as f64;
        if min_bandwidth == 0 {
            return 0.0;
        }
        (min_bandwidth as f64) / (total_latency + hops * 10.0)
    }

    /// Find the best multi-path route for a transfer (for parallel streaming)
    fn find_multi_path_route(
        &mut self,
        source: &str,
        dest: &str,
        num_paths: u32,
    ) -> Vec<Vec<String>> {
        let mut paths = self.find_paths(source, dest, num_paths as usize * 3);

        // Score and sort by quality
        paths.sort_by(|a, b| {
            self.score_path(b)
                .partial_cmp(&self.score_path(a))
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        // Return up to num_paths best disjoint-ish paths
        let mut selected: Vec<Vec<String>> = Vec::new();
        let mut used_intermediaries: HashSet<String> = HashSet::new();

        for path in paths {
            // Prefer paths that use different intermediaries
            let intermediaries: HashSet<String> = path[1..path.len() - 1]
                .iter()
                .cloned()
                .collect();
            let overlap = intermediaries.intersection(&used_intermediaries).count();

            if selected.len() < num_paths as usize {
                if overlap == 0 || selected.is_empty() {
                    used_intermediaries.extend(intermediaries);
                    selected.push(path);
                }
            }
        }

        // If we couldn't find enough disjoint paths, just take the best ones
        if selected.len() < num_paths as usize {
            let all = self.find_paths(source, dest, num_paths as usize);
            for path in all {
                if selected.len() >= num_paths as usize {
                    break;
                }
                if !selected.contains(&path) {
                    selected.push(path);
                }
            }
        }

        selected
    }

    /// Build the topology payload for broadcasting
    fn to_topology_payload(&self) -> SwarmTopologyPayload {
        SwarmTopologyPayload {
            swarm_id: self.swarm_id.clone(),
            adjacency: self
                .adjacency
                .iter()
                .map(|(k, v)| (k.clone(), v.iter().cloned().collect()))
                .collect(),
            peer_stats: self
                .peers
                .iter()
                .map(|(k, v)| (k.clone(), v.stats.clone()))
                .collect(),
        }
    }
}

// ─── Swarm Manager ─────────────────────────────────────────

pub struct SwarmManager {
    transport: Arc<Mutex<TransportService>>,
    state: Arc<RwLock<Option<SwarmState>>>,
    event_tx: broadcast::Sender<SwarmEvent>,
    shutdown_tx: Option<mpsc::Sender<()>>,
}

impl SwarmManager {
    pub fn new(transport: Arc<Mutex<TransportService>>) -> Self {
        let (event_tx, _) = broadcast::channel(256);
        Self {
            transport,
            state: Arc::new(RwLock::new(None)),
            event_tx,
            shutdown_tx: None,
        }
    }

    /// Subscribe to swarm events
    pub fn subscribe(&self) -> broadcast::Receiver<SwarmEvent> {
        self.event_tx.subscribe()
    }

    /// Create a new swarm (this device becomes the initial member)
    pub async fn create_swarm(
        &mut self,
        my_device_id: &str,
        my_nickname: &str,
        my_platform: Platform,
        my_device_type: DeviceType,
    ) -> String {
        let swarm_id = Uuid::new_v4().to_string();

        let my_peer = SwarmPeer {
            device_id: my_device_id.to_string(),
            nickname: my_nickname.to_string(),
            platform: my_platform,
            device_type: my_device_type,
            connections: HashSet::new(),
            stats: PeerStats {
                device_id: my_device_id.to_string(),
                rtt_ms: 0,
                bandwidth_bps: 0,
                cpu_load: 0.0,
                active_transfers: 0,
            },
            last_seen: Instant::now(),
            directly_connected: true,
        };

        let mut state = SwarmState::new(swarm_id.clone(), my_device_id.to_string());
        state.upsert_peer(my_peer);
        *self.state.write().await = Some(state);

        self.start_background_tasks().await;

        info!("[Swarm] Created swarm: {}", swarm_id);
        swarm_id
    }

    /// Join an existing swarm
    pub async fn join_swarm(
        &mut self,
        swarm_id: &str,
        my_device_id: &str,
        my_nickname: &str,
        my_platform: Platform,
        my_device_type: DeviceType,
        known_peers: Vec<String>,
    ) -> Result<(), SwarmError> {
        let my_peer = SwarmPeer {
            device_id: my_device_id.to_string(),
            nickname: my_nickname.to_string(),
            platform: my_platform.clone(),
            device_type: my_device_type.clone(),
            connections: HashSet::new(),
            stats: PeerStats {
                device_id: my_device_id.to_string(),
                rtt_ms: 0,
                bandwidth_bps: 0,
                cpu_load: 0.0,
                active_transfers: 0,
            },
            last_seen: Instant::now(),
            directly_connected: true,
        };

        let mut state = SwarmState::new(swarm_id.to_string(), my_device_id.to_string());
        state.upsert_peer(my_peer);
        *self.state.write().await = Some(state);

        // Announce to all known peers
        let transport = self.transport.lock().await;
        for peer_id in &known_peers {
            let _ = transport
                .send_message(
                    peer_id,
                    MessageType::SwarmJoin(SwarmJoinPayload {
                        swarm_id: swarm_id.to_string(),
                        peer_info: PeerInfoPayload {
                            device_id: my_device_id.to_string(),
                            nickname: my_nickname.to_string(),
                            platform: my_platform.clone(),
                            device_type: my_device_type.clone(),
                            addresses: Vec::new(),
                            capabilities: Default::default(),
                        },
                        known_peers: known_peers.clone(),
                    }),
                )
                .await;
        }
        drop(transport);

        self.start_background_tasks().await;

        info!(
            "[Swarm] Joined swarm: {} with {} known peers",
            swarm_id,
            known_peers.len()
        );
        Ok(())
    }

    /// Leave the current swarm
    pub async fn leave_swarm(&mut self, reason: &str) {
        let state_guard = self.state.read().await;
        if let Some(state) = state_guard.as_ref() {
            let swarm_id = state.swarm_id.clone();
            let my_id = state.my_device_id.clone();
            let peer_ids: Vec<String> = state
                .peers
                .keys()
                .filter(|id| *id != &my_id)
                .cloned()
                .collect();
            drop(state_guard);

            // Announce departure
            let transport = self.transport.lock().await;
            for peer_id in &peer_ids {
                let _ = transport
                    .send_message(
                        peer_id,
                        MessageType::SwarmLeave(SwarmLeavePayload {
                            swarm_id: swarm_id.clone(),
                            device_id: my_id.clone(),
                            reason: reason.to_string(),
                        }),
                    )
                    .await;
            }
            drop(transport);

            // Stop background tasks
            if let Some(tx) = self.shutdown_tx.take() {
                let _ = tx.try_send(());
            }

            *self.state.write().await = None;
            info!("[Swarm] Left swarm: {}", swarm_id);
        }
    }

    /// Handle a peer joining the swarm
    pub async fn handle_peer_join(&self, join: SwarmJoinPayload) {
        let mut state_guard = self.state.write().await;
        if let Some(state) = state_guard.as_mut() {
            if state.peers.len() >= MAX_SWARM_PEERS {
                warn!("[Swarm] Swarm full, rejecting peer: {}", join.peer_info.device_id);
                return;
            }

            let peer = SwarmPeer {
                device_id: join.peer_info.device_id.clone(),
                nickname: join.peer_info.nickname.clone(),
                platform: join.peer_info.platform.clone(),
                device_type: join.peer_info.device_type.clone(),
                connections: HashSet::new(),
                stats: PeerStats {
                    device_id: join.peer_info.device_id.clone(),
                    rtt_ms: 0,
                    bandwidth_bps: 0,
                    cpu_load: 0.0,
                    active_transfers: 0,
                },
                last_seen: Instant::now(),
                directly_connected: true,
            };

            // Add edge between us and the new peer
            state.add_edge(&state.my_device_id.clone(), &peer.device_id);
            state.upsert_peer(peer);

            let _ = self.event_tx.send(SwarmEvent::PeerJoined {
                swarm_id: state.swarm_id.clone(),
                device_id: join.peer_info.device_id,
                nickname: join.peer_info.nickname,
            });
        }
    }

    /// Handle a peer leaving the swarm
    pub async fn handle_peer_leave(&self, leave: SwarmLeavePayload) {
        let mut state_guard = self.state.write().await;
        if let Some(state) = state_guard.as_mut() {
            state.remove_peer(&leave.device_id);

            let _ = self.event_tx.send(SwarmEvent::PeerLeft {
                swarm_id: leave.swarm_id,
                device_id: leave.device_id,
                reason: leave.reason,
            });
        }
    }

    /// Handle a topology update from another peer
    pub async fn handle_topology_update(&self, topology: SwarmTopologyPayload) {
        let mut state_guard = self.state.write().await;
        if let Some(state) = state_guard.as_mut() {
            // Merge adjacency information
            for (peer_id, connections) in &topology.adjacency {
                for conn_id in connections {
                    state.add_edge(peer_id, conn_id);
                }
            }

            // Update peer stats
            for (peer_id, stats) in &topology.peer_stats {
                if let Some(peer) = state.peers.get_mut(peer_id) {
                    peer.stats = stats.clone();
                    peer.last_seen = Instant::now();
                }
            }
        }
    }

    /// Calculate the best route for a transfer between two peers
    pub async fn calculate_route(
        &self,
        source: &str,
        dest: &str,
        parallel_paths: u32,
    ) -> Result<Vec<Vec<String>>, SwarmError> {
        let mut state_guard = self.state.write().await;
        let state = state_guard.as_mut().ok_or(SwarmError::NotInSwarm)?;

        let paths = state.find_multi_path_route(source, dest, parallel_paths);
        if paths.is_empty() {
            return Err(SwarmError::NoRoute(source.to_string(), dest.to_string()));
        }

        let _ = self.event_tx.send(SwarmEvent::RouteCalculated {
            transfer_id: String::new(), // Set by caller
            paths: paths.clone(),
        });

        Ok(paths)
    }

    /// Handle relay data — forward to next hop or deliver locally
    pub async fn handle_relay(
        &self,
        relay: SwarmRelayPayload,
        _data: Vec<u8>,
    ) -> Result<(), SwarmError> {
        if relay.ttl == 0 {
            warn!("[Swarm] Relay TTL expired for transfer {}", relay.transfer_id);
            return Err(SwarmError::TtlExpired);
        }

        let state_guard = self.state.read().await;
        let state = state_guard.as_ref().ok_or(SwarmError::NotInSwarm)?;

        if relay.dest_id == state.my_device_id {
            // We're the destination — deliver locally
            debug!(
                "[Swarm] Relay delivered: transfer {} chunk {}",
                relay.transfer_id, relay.chunk_index
            );
            // The caller (TransferManager) will handle the actual data
            return Ok(());
        }

        // We're an intermediary — find next hop and forward
        drop(state_guard);
        let mut state_guard = self.state.write().await;
        let state = state_guard.as_mut().ok_or(SwarmError::NotInSwarm)?;

        let path = state
            .shortest_path(&state.my_device_id.clone(), &relay.dest_id)
            .ok_or_else(|| {
                SwarmError::NoRoute(state.my_device_id.clone(), relay.dest_id.clone())
            })?;

        if path.len() < 2 {
            return Err(SwarmError::NoRoute(
                state.my_device_id.clone(),
                relay.dest_id.clone(),
            ));
        }

        let next_hop = &path[1];

        let _ = self.event_tx.send(SwarmEvent::RelayForward {
            transfer_id: relay.transfer_id.clone(),
            next_hop: next_hop.clone(),
        });

        // Forward with decremented TTL
        let transport = self.transport.lock().await;
        transport
            .send_message(
                next_hop,
                MessageType::SwarmRelayData(SwarmRelayPayload {
                    transfer_id: relay.transfer_id,
                    source_id: relay.source_id,
                    dest_id: relay.dest_id,
                    path_index: relay.path_index,
                    chunk_index: relay.chunk_index,
                    ttl: relay.ttl - 1,
                }),
            )
            .await
            .map_err(|e| SwarmError::RelayFailed(e.to_string()))?;

        Ok(())
    }

    /// Get current swarm info
    pub async fn get_swarm_info(&self) -> Option<SwarmInfo> {
        let state = self.state.read().await;
        state.as_ref().map(|s| SwarmInfo {
            swarm_id: s.swarm_id.clone(),
            peer_count: s.peers.len(),
            peers: s
                .peers
                .values()
                .map(|p| SwarmPeerInfo {
                    device_id: p.device_id.clone(),
                    nickname: p.nickname.clone(),
                    directly_connected: p.directly_connected,
                    rtt_ms: p.stats.rtt_ms,
                })
                .collect(),
        })
    }

    /// Check if we're in a swarm
    pub async fn is_in_swarm(&self) -> bool {
        self.state.read().await.is_some()
    }

    // ─── Background Tasks ──────────────────────────────────

    async fn start_background_tasks(&mut self) {
        let (shutdown_tx, mut shutdown_rx) = mpsc::channel(1);
        self.shutdown_tx = Some(shutdown_tx);

        let state = self.state.clone();
        let transport = self.transport.clone();
        let _event_tx = self.event_tx.clone();

        tokio::spawn(async move {
            let mut topology_interval = tokio::time::interval(TOPOLOGY_BROADCAST_INTERVAL);
            let mut latency_interval = tokio::time::interval(LATENCY_PROBE_INTERVAL);

            loop {
                tokio::select! {
                    _ = shutdown_rx.recv() => break,

                    _ = topology_interval.tick() => {
                        // Broadcast our topology to all directly connected peers
                        let state_guard = state.read().await;
                        if let Some(s) = state_guard.as_ref() {
                            let topology = s.to_topology_payload();
                            let my_id = s.my_device_id.clone();
                            let peer_ids: Vec<String> = s.peers.keys()
                                .filter(|id| *id != &my_id)
                                .cloned()
                                .collect();
                            drop(state_guard);

                            let transport = transport.lock().await;
                            for peer_id in peer_ids {
                                let _ = transport.send_message(
                                    &peer_id,
                                    MessageType::SwarmTopology(topology.clone()),
                                ).await;
                            }
                        }
                    }

                    _ = latency_interval.tick() => {
                        // Ping all connected peers
                        let state_guard = state.read().await;
                        if let Some(s) = state_guard.as_ref() {
                            let my_id = s.my_device_id.clone();
                            let peer_ids: Vec<String> = s.peers.keys()
                                .filter(|id| *id != &my_id)
                                .cloned()
                                .collect();
                            drop(state_guard);

                            let now = std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .unwrap_or_default()
                                .as_millis() as u64;

                            let transport = transport.lock().await;
                            for peer_id in peer_ids {
                                let _ = transport.send_message(
                                    &peer_id,
                                    MessageType::Ping(now),
                                ).await;
                            }
                        }
                    }
                }
            }
        });
    }
}

impl Drop for SwarmManager {
    fn drop(&mut self) {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.try_send(());
        }
    }
}

// ─── Public Info Types ─────────────────────────────────────

#[derive(Debug, Clone)]
pub struct SwarmInfo {
    pub swarm_id: String,
    pub peer_count: usize,
    pub peers: Vec<SwarmPeerInfo>,
}

#[derive(Debug, Clone)]
pub struct SwarmPeerInfo {
    pub device_id: String,
    pub nickname: String,
    pub directly_connected: bool,
    pub rtt_ms: u32,
}

// ─── Errors ────────────────────────────────────────────────

#[derive(Debug, thiserror::Error)]
pub enum SwarmError {
    #[error("not in a swarm")]
    NotInSwarm,
    #[error("swarm is full")]
    SwarmFull,
    #[error("no route from {0} to {1}")]
    NoRoute(String, String),
    #[error("relay TTL expired")]
    TtlExpired,
    #[error("relay failed: {0}")]
    RelayFailed(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_peer(id: &str) -> SwarmPeer {
        SwarmPeer {
            device_id: id.to_string(),
            nickname: id.to_string(),
            platform: Platform::Electron,
            device_type: DeviceType::Desktop,
            connections: HashSet::new(),
            stats: PeerStats {
                device_id: id.to_string(),
                rtt_ms: 10,
                bandwidth_bps: 100_000_000,
                cpu_load: 0.5,
                active_transfers: 0,
            },
            last_seen: Instant::now(),
            directly_connected: true,
        }
    }

    #[test]
    fn test_shortest_path_direct() {
        let mut state = SwarmState::new("test".into(), "A".into());
        state.upsert_peer(make_peer("A"));
        state.upsert_peer(make_peer("B"));
        state.add_edge("A", "B");

        let path = state.shortest_path("A", "B");
        assert_eq!(path, Some(vec!["A".to_string(), "B".to_string()]));
    }

    #[test]
    fn test_shortest_path_via_relay() {
        let mut state = SwarmState::new("test".into(), "A".into());
        state.upsert_peer(make_peer("A"));
        state.upsert_peer(make_peer("B"));
        state.upsert_peer(make_peer("C"));
        state.add_edge("A", "B");
        state.add_edge("B", "C");
        // A cannot reach C directly, must go through B

        let path = state.shortest_path("A", "C");
        assert_eq!(
            path,
            Some(vec!["A".to_string(), "B".to_string(), "C".to_string()])
        );
    }

    #[test]
    fn test_multi_path() {
        let mut state = SwarmState::new("test".into(), "A".into());
        state.upsert_peer(make_peer("A"));
        state.upsert_peer(make_peer("B"));
        state.upsert_peer(make_peer("C"));
        state.upsert_peer(make_peer("D"));
        state.add_edge("A", "B");
        state.add_edge("A", "C");
        state.add_edge("B", "D");
        state.add_edge("C", "D");

        let paths = state.find_multi_path_route("A", "D", 2);
        assert_eq!(paths.len(), 2);
        // Both paths should be length 3 (A→B→D and A→C→D)
        assert!(paths.iter().all(|p| p.len() == 3));
    }

    #[test]
    fn test_no_route() {
        let mut state = SwarmState::new("test".into(), "A".into());
        state.upsert_peer(make_peer("A"));
        state.upsert_peer(make_peer("B"));
        // No edge between A and B

        let path = state.shortest_path("A", "B");
        assert_eq!(path, None);
    }

    #[test]
    fn test_topology_self_healing() {
        let mut state = SwarmState::new("test".into(), "A".into());
        state.upsert_peer(make_peer("A"));
        state.upsert_peer(make_peer("B"));
        state.upsert_peer(make_peer("C"));
        state.add_edge("A", "B");
        state.add_edge("B", "C");
        state.add_edge("A", "C");

        // Remove B — A and C should still connect directly
        state.remove_peer("B");
        let path = state.shortest_path("A", "C");
        assert_eq!(path, Some(vec!["A".to_string(), "C".to_string()]));
    }
}

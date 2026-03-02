//! Protocol — Wire format for all QUIC P2P messages
//!
//! Every message over QUIC streams is length-prefixed + bincode-serialized.
//! File data is sent as raw bytes on dedicated unidirectional streams.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Magic bytes at the start of every control message frame
pub const FRAME_MAGIC: &[u8; 4] = b"EPHM";

/// Current protocol version
pub const PROTOCOL_VERSION: u8 = 1;

/// Maximum control message size (64 KB)
pub const MAX_CONTROL_MSG_SIZE: usize = 65_536;

/// Default chunk size for file transfers (256 KB — matches WebRTC impl)
pub const DEFAULT_CHUNK_SIZE: usize = 256 * 1024;

/// High-throughput chunk size (1 MB — for LAN QUIC transfers)
pub const HIGH_THROUGHPUT_CHUNK_SIZE: usize = 1024 * 1024;

/// Ultra-high-throughput chunk size (4 MB — for swarm parallel streams)
pub const ULTRA_CHUNK_SIZE: usize = 4 * 1024 * 1024;

// ─── Top-Level Message Envelope ────────────────────────────

/// Every control message on a bi-directional QUIC stream
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub version: u8,
    pub msg_type: MessageType,
    pub sender_id: String,
    pub timestamp: u64,
}

impl Message {
    pub fn new(msg_type: MessageType, sender_id: String) -> Self {
        Self {
            version: PROTOCOL_VERSION,
            msg_type,
            sender_id,
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64,
        }
    }
}

// ─── Message Types ─────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MessageType {
    // ── Handshake ──
    Hello(HelloPayload),
    HelloAck(HelloAckPayload),

    // ── Discovery (over mDNS — these are for post-connection peer info exchange) ──
    PeerInfo(PeerInfoPayload),
    PeerListRequest,
    PeerList(PeerListPayload),

    // ── Transfer ──
    TransferOffer(TransferOfferPayload),
    TransferAccept(TransferAcceptPayload),
    TransferReject(TransferRejectPayload),
    TransferProgress(TransferProgressPayload),
    TransferComplete(TransferCompletePayload),
    TransferCancel(TransferCancelPayload),

    // ── Text ──
    TextMessage(TextPayload),

    // ── Swarm ──
    SwarmJoin(SwarmJoinPayload),
    SwarmLeave(SwarmLeavePayload),
    SwarmTopology(SwarmTopologyPayload),
    SwarmRouteRequest(SwarmRoutePayload),
    SwarmRelayData(SwarmRelayPayload),

    // ── Control ──
    Ping(u64),
    Pong(u64),
    Disconnect(String),
}

// ─── Handshake ─────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HelloPayload {
    pub device_id: String,
    pub nickname: String,
    pub platform: Platform,
    pub device_type: DeviceType,
    pub capabilities: Capabilities,
    pub cert_fingerprint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HelloAckPayload {
    pub device_id: String,
    pub nickname: String,
    pub platform: Platform,
    pub device_type: DeviceType,
    pub capabilities: Capabilities,
    pub cert_fingerprint: String,
    pub pairing_code: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Capabilities {
    /// Supports high-throughput chunking (1MB+)
    pub high_throughput: bool,
    /// Supports swarm/mesh mode
    pub swarm: bool,
    /// Supports relay for other peers
    pub relay: bool,
    /// Maximum concurrent streams
    pub max_streams: u32,
    /// Custom protocol extensions
    pub extensions: Vec<String>,
}

impl Default for Capabilities {
    fn default() -> Self {
        Self {
            high_throughput: true,
            swarm: true,
            relay: true,
            max_streams: 100,
            extensions: Vec::new(),
        }
    }
}

// ─── Peer Info ─────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum Platform {
    Electron,
    Capacitor,
    Android,
    Web,
    Unknown,
}

impl std::fmt::Display for Platform {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Platform::Electron => write!(f, "electron"),
            Platform::Capacitor => write!(f, "capacitor"),
            Platform::Android => write!(f, "android"),
            Platform::Web => write!(f, "web"),
            Platform::Unknown => write!(f, "unknown"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum DeviceType {
    Desktop,
    Phone,
    Tablet,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeerInfoPayload {
    pub device_id: String,
    pub nickname: String,
    pub platform: Platform,
    pub device_type: DeviceType,
    pub addresses: Vec<String>,
    pub capabilities: Capabilities,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeerListPayload {
    pub peers: Vec<PeerInfoPayload>,
}

// ─── Transfer ──────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferOfferPayload {
    pub transfer_id: String,
    pub file_name: String,
    pub file_size: u64,
    pub mime_type: String,
    pub total_chunks: u64,
    pub chunk_size: usize,
    /// SHA-256 hash of the complete file (for integrity verification)
    pub file_hash: Option<String>,
    /// Extra metadata (e.g., transfer type, batch info)
    pub metadata: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferAcceptPayload {
    pub transfer_id: String,
    /// Preferred chunk size (receiver can negotiate)
    pub preferred_chunk_size: Option<usize>,
    /// Number of parallel streams to use (for high-throughput)
    pub parallel_streams: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferRejectPayload {
    pub transfer_id: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferProgressPayload {
    pub transfer_id: String,
    pub bytes_transferred: u64,
    pub total_bytes: u64,
    pub chunks_completed: u64,
    pub speed_bytes_per_sec: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferCompletePayload {
    pub transfer_id: String,
    pub total_bytes: u64,
    pub duration_ms: u64,
    pub file_hash: String,
    pub verified: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferCancelPayload {
    pub transfer_id: String,
    pub reason: String,
    /// Bytes transferred before cancellation (for potential resume)
    pub bytes_transferred: u64,
}

// ─── Text ──────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextPayload {
    pub text: String,
    pub message_id: String,
}

// ─── Swarm ─────────────────────────────────────────────────

/// Swarm mode allows 3+ peers to form a mesh network.
/// Each peer maintains connections to multiple other peers.
/// Files can be routed through intermediary peers and
/// split across multiple paths for parallel transfer.

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwarmJoinPayload {
    pub swarm_id: String,
    pub peer_info: PeerInfoPayload,
    /// Known peers already in the swarm
    pub known_peers: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwarmLeavePayload {
    pub swarm_id: String,
    pub device_id: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwarmTopologyPayload {
    pub swarm_id: String,
    /// Full mesh adjacency: device_id → list of connected device_ids
    pub adjacency: HashMap<String, Vec<String>>,
    /// Each peer's capabilities and latency info
    pub peer_stats: HashMap<String, PeerStats>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeerStats {
    pub device_id: String,
    pub rtt_ms: u32,
    pub bandwidth_bps: u64,
    pub cpu_load: f32,
    pub active_transfers: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwarmRoutePayload {
    /// The file transfer this routing request is for
    pub transfer_id: String,
    /// Source peer
    pub source_id: String,
    /// Destination peer
    pub dest_id: String,
    /// Ordered list of intermediary peers for relay
    pub relay_path: Vec<String>,
    /// Number of parallel paths (for multi-path transfer)
    pub parallel_paths: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwarmRelayPayload {
    pub transfer_id: String,
    /// Original source
    pub source_id: String,
    /// Final destination
    pub dest_id: String,
    /// Which path index this chunk is on (for multi-path)
    pub path_index: u32,
    /// Chunk index within the file
    pub chunk_index: u64,
    /// TTL to prevent infinite relay loops
    pub ttl: u8,
}

// ─── Frame Encoding ────────────────────────────────────────

/// Encode a Message into a length-prefixed frame
/// Format: [MAGIC:4][LENGTH:4][BINCODE_DATA:LENGTH]
pub fn encode_message(msg: &Message) -> Result<Vec<u8>, EncodeError> {
    let data = bincode::serialize(msg).map_err(EncodeError::Serialize)?;
    if data.len() > MAX_CONTROL_MSG_SIZE {
        return Err(EncodeError::TooLarge(data.len()));
    }
    let len = data.len() as u32;
    let mut frame = Vec::with_capacity(8 + data.len());
    frame.extend_from_slice(FRAME_MAGIC);
    frame.extend_from_slice(&len.to_be_bytes());
    frame.extend(data);
    Ok(frame)
}

/// Decode a length-prefixed frame into a Message
pub fn decode_message(frame: &[u8]) -> Result<Message, DecodeError> {
    if frame.len() < 8 {
        return Err(DecodeError::TooShort);
    }
    if &frame[0..4] != FRAME_MAGIC {
        return Err(DecodeError::InvalidMagic);
    }
    let len = u32::from_be_bytes([frame[4], frame[5], frame[6], frame[7]]) as usize;
    if frame.len() < 8 + len {
        return Err(DecodeError::Incomplete { expected: 8 + len, got: frame.len() });
    }
    let msg = bincode::deserialize(&frame[8..8 + len]).map_err(DecodeError::Deserialize)?;
    Ok(msg)
}

// ─── Errors ────────────────────────────────────────────────

#[derive(Debug, thiserror::Error)]
pub enum EncodeError {
    #[error("serialization failed: {0}")]
    Serialize(bincode::Error),
    #[error("message too large: {0} bytes (max {MAX_CONTROL_MSG_SIZE})")]
    TooLarge(usize),
}

#[derive(Debug, thiserror::Error)]
pub enum DecodeError {
    #[error("frame too short")]
    TooShort,
    #[error("invalid magic bytes")]
    InvalidMagic,
    #[error("incomplete frame: expected {expected} bytes, got {got}")]
    Incomplete { expected: usize, got: usize },
    #[error("deserialization failed: {0}")]
    Deserialize(bincode::Error),
}

// ─── File Data Stream Header ───────────────────────────────

/// Header sent at the beginning of a unidirectional QUIC stream
/// carrying raw file chunk data. After this header, raw bytes follow.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileStreamHeader {
    pub transfer_id: String,
    pub chunk_index: u64,
    pub chunk_size: u64,
    pub offset: u64,
    /// For multi-path swarm: which path this chunk travels on
    pub path_index: u32,
}

impl FileStreamHeader {
    pub fn encode(&self) -> Result<Vec<u8>, bincode::Error> {
        bincode::serialize(self)
    }

    pub fn decode(data: &[u8]) -> Result<Self, bincode::Error> {
        bincode::deserialize(data)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encode_decode_roundtrip() {
        let msg = Message::new(
            MessageType::Ping(42),
            "test-device".to_string(),
        );
        let frame = encode_message(&msg).unwrap();
        let decoded = decode_message(&frame).unwrap();
        assert_eq!(decoded.sender_id, "test-device");
        match decoded.msg_type {
            MessageType::Ping(n) => assert_eq!(n, 42),
            _ => panic!("wrong message type"),
        }
    }

    #[test]
    fn test_invalid_magic() {
        let result = decode_message(b"BADM\x00\x00\x00\x04test");
        assert!(matches!(result, Err(DecodeError::InvalidMagic)));
    }

    #[test]
    fn test_too_short() {
        let result = decode_message(b"EPH");
        assert!(matches!(result, Err(DecodeError::TooShort)));
    }
}

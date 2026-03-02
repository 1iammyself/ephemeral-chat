//! Transport — QUIC connection management with Quinn
//!
//! Handles creating QUIC endpoints (server+client), accepting/initiating
//! connections, managing bi-directional control streams and unidirectional
//! file data streams. Uses ephemeral self-signed TLS certs.

use crate::crypto::{derive_pairing_code, SessionIdentity};
use crate::protocol::{
    decode_message, encode_message, Capabilities, DeviceType, FileStreamHeader, HelloAckPayload,
    HelloPayload, Message, MessageType, Platform, FRAME_MAGIC,
};
use dashmap::DashMap;
use quinn::{
    ClientConfig, Connection, Endpoint, RecvStream, SendStream, ServerConfig, TransportConfig,
    VarInt,
};
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{broadcast, mpsc};
use tracing::{debug, info, warn};

/// Default QUIC port range start
pub const DEFAULT_PORT: u16 = 7743;

/// Maximum number of concurrent uni-directional streams (for parallel file transfers)
const MAX_UNI_STREAMS: u32 = 200;

/// Maximum number of concurrent bi-directional streams (for control)
const MAX_BI_STREAMS: u32 = 50;

/// Keep-alive interval
const KEEP_ALIVE_INTERVAL: Duration = Duration::from_secs(5);

/// Idle timeout
const IDLE_TIMEOUT: Duration = Duration::from_secs(30);

/// Maximum receive window (64 MB — for ultra-high throughput)
const MAX_RECEIVE_WINDOW: u64 = 64 * 1024 * 1024;

/// Maximum stream receive window (16 MB)
const MAX_STREAM_WINDOW: u32 = 16 * 1024 * 1024;

// ─── Connection Events ─────────────────────────────────────

#[derive(Debug, Clone)]
pub enum TransportEvent {
    /// New incoming connection established
    IncomingConnection {
        peer_id: String,
        nickname: String,
        platform: Platform,
        pairing_code: String,
    },
    /// Outgoing connection established
    OutgoingConnection {
        peer_id: String,
        nickname: String,
        platform: Platform,
        pairing_code: String,
    },
    /// Control message received from a peer
    MessageReceived {
        peer_id: String,
        message: Message,
    },
    /// File stream data received
    FileChunkReceived {
        peer_id: String,
        header: FileStreamHeader,
        data: Vec<u8>,
    },
    /// Connection to a peer was lost
    ConnectionLost {
        peer_id: String,
        reason: String,
    },
}

// ─── Peer Connection ───────────────────────────────────────

#[allow(dead_code)]
struct PeerConnection {
    device_id: String,
    nickname: String,
    platform: Platform,
    connection: Connection,
    control_tx: mpsc::Sender<Message>,
}

// ─── Transport Service ─────────────────────────────────────

pub struct TransportService {
    identity: SessionIdentity,
    device_id: String,
    nickname: String,
    platform: Platform,
    device_type: DeviceType,

    endpoint: Option<Endpoint>,
    connections: Arc<DashMap<String, PeerConnection>>,

    event_tx: broadcast::Sender<TransportEvent>,
    shutdown_tx: Option<mpsc::Sender<()>>,
}

impl TransportService {
    /// Create a new transport service
    pub fn new(
        device_id: String,
        nickname: String,
        platform: Platform,
        device_type: DeviceType,
    ) -> Result<Self, TransportError> {
        let identity =
            SessionIdentity::generate().map_err(|e| TransportError::Setup(e.to_string()))?;
        let (event_tx, _) = broadcast::channel(512);

        Ok(Self {
            identity,
            device_id,
            nickname,
            platform,
            device_type,
            endpoint: None,
            connections: Arc::new(DashMap::new()),
            event_tx,
            shutdown_tx: None,
        })
    }

    /// Get our certificate fingerprint
    pub fn fingerprint(&self) -> &str {
        &self.identity.fingerprint
    }

    /// Subscribe to transport events
    pub fn subscribe(&self) -> broadcast::Receiver<TransportEvent> {
        self.event_tx.subscribe()
    }

    /// Get the local address we're bound to
    pub fn local_addr(&self) -> Option<SocketAddr> {
        self.endpoint.as_ref().and_then(|ep| ep.local_addr().ok())
    }

    /// Get connected peer count
    pub fn connection_count(&self) -> usize {
        self.connections.len()
    }

    /// Check if connected to a specific peer
    pub fn is_connected(&self, device_id: &str) -> bool {
        self.connections.contains_key(device_id)
    }

    /// Start the transport layer — binds to a UDP port and listens
    pub async fn start(&mut self, port: u16) -> Result<SocketAddr, TransportError> {
        if self.endpoint.is_some() {
            return Err(TransportError::AlreadyRunning);
        }

        let (shutdown_tx, mut shutdown_rx) = mpsc::channel::<()>(1);
        self.shutdown_tx = Some(shutdown_tx);

        // Build Quinn server + client configs
        let server_config = self.build_server_config()?;
        let client_config = self.build_client_config()?;

        // Bind the endpoint
        let addr: SocketAddr = format!("0.0.0.0:{}", port).parse().unwrap();
        let mut endpoint = Endpoint::server(server_config, addr)
            .map_err(|e| TransportError::Bind(e.to_string()))?;
        endpoint.set_default_client_config(client_config);

        let local_addr = endpoint
            .local_addr()
            .map_err(|e| TransportError::Bind(e.to_string()))?;
        info!("[Transport] Listening on {}", local_addr);

        self.endpoint = Some(endpoint.clone());

        // Spawn the accept loop
        let connections = self.connections.clone();
        let event_tx = self.event_tx.clone();
        let identity = self.identity.clone();
        let my_device_id = self.device_id.clone();
        let my_nickname = self.nickname.clone();
        let my_platform = self.platform.clone();
        let my_device_type = self.device_type.clone();

        tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = shutdown_rx.recv() => {
                        info!("[Transport] Shutting down accept loop");
                        endpoint.close(VarInt::from_u32(0), b"shutdown");
                        break;
                    }

                    incoming = endpoint.accept() => {
                        match incoming {
                            Some(incoming_conn) => {
                                let connections = connections.clone();
                                let event_tx = event_tx.clone();
                                let identity = identity.clone();
                                let my_device_id = my_device_id.clone();
                                let my_nickname = my_nickname.clone();
                                let my_platform = my_platform.clone();
                                let my_device_type = my_device_type.clone();

                                tokio::spawn(async move {
                                    match incoming_conn.await {
                                        Ok(connection) => {
                                            if let Err(e) = handle_incoming_connection(
                                                connection,
                                                &identity,
                                                &my_device_id,
                                                &my_nickname,
                                                &my_platform,
                                                &my_device_type,
                                                connections.clone(),
                                                &event_tx,
                                            ).await {
                                                warn!("[Transport] Incoming connection error: {}", e);
                                            }
                                        }
                                        Err(e) => {
                                            warn!("[Transport] Failed to accept: {}", e);
                                        }
                                    }
                                });
                            }
                            None => {
                                info!("[Transport] Endpoint closed");
                                break;
                            }
                        }
                    }
                }
            }
        });

        Ok(local_addr)
    }

    /// Connect to a peer at a specific address
    pub async fn connect(&self, addr: SocketAddr) -> Result<String, TransportError> {
        let endpoint = self
            .endpoint
            .as_ref()
            .ok_or(TransportError::NotRunning)?;

        let connection = endpoint
            .connect(addr, "ephemeral-chat.local")
            .map_err(|e| TransportError::Connect(e.to_string()))?
            .await
            .map_err(|e| TransportError::Connect(e.to_string()))?;

        info!("[Transport] Connected to {}", addr);

        // Perform handshake
        let (device_id, _pairing_code) = perform_client_handshake(
            &connection,
            &self.identity,
            &self.device_id,
            &self.nickname,
            &self.platform,
            &self.device_type,
        )
        .await?;

        let (control_tx, control_rx) = mpsc::channel(128);

        let peer = PeerConnection {
            device_id: device_id.clone(),
            nickname: String::new(), // will be filled from Hello
            platform: Platform::Unknown,
            connection: connection.clone(),
            control_tx,
        };
        self.connections.insert(device_id.clone(), peer);

        // Spawn reader/writer tasks for this connection
        spawn_connection_tasks(
            device_id.clone(),
            connection,
            control_rx,
            self.connections.clone(),
            self.event_tx.clone(),
        );

        Ok(device_id)
    }

    /// Send a control message to a peer
    pub async fn send_message(
        &self,
        peer_id: &str,
        msg_type: MessageType,
    ) -> Result<(), TransportError> {
        let conn = self
            .connections
            .get(peer_id)
            .ok_or_else(|| TransportError::PeerNotFound(peer_id.to_string()))?;

        let msg = Message::new(msg_type, self.device_id.clone());
        conn.control_tx
            .send(msg)
            .await
            .map_err(|_| TransportError::SendFailed("control channel closed".into()))?;
        Ok(())
    }

    /// Open a unidirectional stream for sending file data
    pub async fn open_file_stream(
        &self,
        peer_id: &str,
        header: &FileStreamHeader,
    ) -> Result<SendStream, TransportError> {
        let conn = self
            .connections
            .get(peer_id)
            .ok_or_else(|| TransportError::PeerNotFound(peer_id.to_string()))?;

        let mut send = conn
            .connection
            .open_uni()
            .await
            .map_err(|e| TransportError::StreamOpen(e.to_string()))?;

        // Write the header first
        let header_bytes = header.encode().map_err(|e| TransportError::Protocol(e.to_string()))?;
        let header_len = header_bytes.len() as u32;
        send.write_all(&header_len.to_be_bytes())
            .await
            .map_err(|e| TransportError::SendFailed(e.to_string()))?;
        send.write_all(&header_bytes)
            .await
            .map_err(|e| TransportError::SendFailed(e.to_string()))?;

        Ok(send)
    }

    /// Disconnect from a specific peer
    pub fn disconnect_peer(&self, peer_id: &str) {
        if let Some((_, peer)) = self.connections.remove(peer_id) {
            peer.connection.close(VarInt::from_u32(0), b"disconnect");
            info!("[Transport] Disconnected from {}", peer_id);
        }
    }

    /// Stop the transport layer entirely
    pub fn stop(&mut self) {
        // Signal shutdown
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.try_send(());
        }
        // Close all connections
        for entry in self.connections.iter() {
            entry
                .connection
                .close(VarInt::from_u32(0), b"shutting down");
        }
        self.connections.clear();
        self.endpoint = None;
    }

    // ─── Internal Config Builders ──────────────────────────

    fn build_server_config(&self) -> Result<ServerConfig, TransportError> {
        let tls_config = self
            .identity
            .server_config()
            .map_err(|e| TransportError::Setup(e.to_string()))?;

        let mut transport = TransportConfig::default();
        transport.keep_alive_interval(Some(KEEP_ALIVE_INTERVAL));
        transport.max_idle_timeout(Some(
            IDLE_TIMEOUT
                .try_into()
                .map_err(|e: quinn::VarIntBoundsExceeded| TransportError::Setup(e.to_string()))?,
        ));
        transport.max_concurrent_uni_streams(VarInt::from_u32(MAX_UNI_STREAMS));
        transport.max_concurrent_bidi_streams(VarInt::from_u32(MAX_BI_STREAMS));
        transport.receive_window(VarInt::try_from(MAX_RECEIVE_WINDOW).unwrap_or(VarInt::MAX));
        transport.stream_receive_window(VarInt::from_u32(MAX_STREAM_WINDOW));

        let quic_server_config = quinn::crypto::rustls::QuicServerConfig::try_from(tls_config)
            .map_err(|e| TransportError::Setup(e.to_string()))?;
        let mut server_config =
            ServerConfig::with_crypto(Arc::new(quic_server_config));
        server_config.transport_config(Arc::new(transport));

        Ok(server_config)
    }

    fn build_client_config(&self) -> Result<ClientConfig, TransportError> {
        let tls_config = self
            .identity
            .client_config()
            .map_err(|e| TransportError::Setup(e.to_string()))?;

        let mut transport = TransportConfig::default();
        transport.keep_alive_interval(Some(KEEP_ALIVE_INTERVAL));
        transport.max_idle_timeout(Some(
            IDLE_TIMEOUT
                .try_into()
                .map_err(|e: quinn::VarIntBoundsExceeded| TransportError::Setup(e.to_string()))?,
        ));
        transport.max_concurrent_uni_streams(VarInt::from_u32(MAX_UNI_STREAMS));
        transport.max_concurrent_bidi_streams(VarInt::from_u32(MAX_BI_STREAMS));
        transport.receive_window(VarInt::try_from(MAX_RECEIVE_WINDOW).unwrap_or(VarInt::MAX));
        transport.stream_receive_window(VarInt::from_u32(MAX_STREAM_WINDOW));

        let quic_client_config = quinn::crypto::rustls::QuicClientConfig::try_from(tls_config)
            .map_err(|e| TransportError::Setup(e.to_string()))?;
        let mut client_config = ClientConfig::new(Arc::new(quic_client_config));
        client_config.transport_config(Arc::new(transport));

        Ok(client_config)
    }
}

impl Drop for TransportService {
    fn drop(&mut self) {
        self.stop();
    }
}

// ─── Connection Handling ───────────────────────────────────

async fn handle_incoming_connection(
    connection: Connection,
    identity: &SessionIdentity,
    my_device_id: &str,
    my_nickname: &str,
    my_platform: &Platform,
    my_device_type: &DeviceType,
    connections: Arc<DashMap<String, PeerConnection>>,
    event_tx: &broadcast::Sender<TransportEvent>,
) -> Result<(), TransportError> {
    // Read Hello from the peer
    let (mut send, mut recv) = connection
        .accept_bi()
        .await
        .map_err(|e| TransportError::Handshake(e.to_string()))?;

    let hello_msg = read_control_message(&mut recv).await?;
    let (peer_device_id, peer_nickname, peer_platform, peer_fingerprint) = match &hello_msg.msg_type
    {
        MessageType::Hello(h) => (
            h.device_id.clone(),
            h.nickname.clone(),
            h.platform.clone(),
            h.cert_fingerprint.clone(),
        ),
        _ => return Err(TransportError::Handshake("expected Hello message".into())),
    };

    // Derive pairing code
    let pairing_code = derive_pairing_code(&identity.fingerprint, &peer_fingerprint);

    // Send HelloAck
    let ack = Message::new(
        MessageType::HelloAck(HelloAckPayload {
            device_id: my_device_id.to_string(),
            nickname: my_nickname.to_string(),
            platform: my_platform.clone(),
            device_type: my_device_type.clone(),
            capabilities: Capabilities::default(),
            cert_fingerprint: identity.fingerprint.clone(),
            pairing_code: pairing_code.clone(),
        }),
        my_device_id.to_string(),
    );
    write_control_message(&mut send, &ack).await?;

    info!(
        "[Transport] Incoming handshake complete: {} ({})",
        peer_nickname, peer_device_id
    );

    let (control_tx, control_rx) = mpsc::channel(128);

    connections.insert(
        peer_device_id.clone(),
        PeerConnection {
            device_id: peer_device_id.clone(),
            nickname: peer_nickname.clone(),
            platform: peer_platform.clone(),
            connection: connection.clone(),
            control_tx,
        },
    );

    let _ = event_tx.send(TransportEvent::IncomingConnection {
        peer_id: peer_device_id.clone(),
        nickname: peer_nickname,
        platform: peer_platform,
        pairing_code,
    });

    spawn_connection_tasks(
        peer_device_id,
        connection,
        control_rx,
        connections.clone(),
        event_tx.clone(),
    );

    Ok(())
}

async fn perform_client_handshake(
    connection: &Connection,
    identity: &SessionIdentity,
    my_device_id: &str,
    my_nickname: &str,
    my_platform: &Platform,
    my_device_type: &DeviceType,
) -> Result<(String, String), TransportError> {
    let (mut send, mut recv) = connection
        .open_bi()
        .await
        .map_err(|e| TransportError::Handshake(e.to_string()))?;

    // Send Hello
    let hello = Message::new(
        MessageType::Hello(HelloPayload {
            device_id: my_device_id.to_string(),
            nickname: my_nickname.to_string(),
            platform: my_platform.clone(),
            device_type: my_device_type.clone(),
            capabilities: Capabilities::default(),
            cert_fingerprint: identity.fingerprint.clone(),
        }),
        my_device_id.to_string(),
    );
    write_control_message(&mut send, &hello).await?;

    // Read HelloAck
    let ack = read_control_message(&mut recv).await?;
    match ack.msg_type {
        MessageType::HelloAck(h) => {
            let pairing_code = derive_pairing_code(&identity.fingerprint, &h.cert_fingerprint);
            Ok((h.device_id, pairing_code))
        }
        _ => Err(TransportError::Handshake("expected HelloAck".into())),
    }
}

// ─── Stream I/O Helpers ────────────────────────────────────

async fn read_control_message(recv: &mut RecvStream) -> Result<Message, TransportError> {
    // Read magic + length
    let mut header = [0u8; 8];
    recv.read_exact(&mut header)
        .await
        .map_err(|e| TransportError::Protocol(e.to_string()))?;

    if &header[0..4] != FRAME_MAGIC {
        return Err(TransportError::Protocol("invalid frame magic".into()));
    }
    let len = u32::from_be_bytes([header[4], header[5], header[6], header[7]]) as usize;

    // Read body
    let mut body = vec![0u8; len];
    recv.read_exact(&mut body)
        .await
        .map_err(|e| TransportError::Protocol(e.to_string()))?;

    // Reconstruct full frame for decode
    let mut frame = Vec::with_capacity(8 + len);
    frame.extend_from_slice(&header);
    frame.extend(body);

    decode_message(&frame).map_err(|e| TransportError::Protocol(e.to_string()))
}

async fn write_control_message(
    send: &mut SendStream,
    msg: &Message,
) -> Result<(), TransportError> {
    let frame = encode_message(msg).map_err(|e| TransportError::Protocol(e.to_string()))?;
    send.write_all(&frame)
        .await
        .map_err(|e| TransportError::SendFailed(e.to_string()))?;
    Ok(())
}

// ─── Per-Connection Tasks ──────────────────────────────────

fn spawn_connection_tasks(
    peer_id: String,
    connection: Connection,
    mut control_rx: mpsc::Receiver<Message>,
    connections: Arc<DashMap<String, PeerConnection>>,
    event_tx: broadcast::Sender<TransportEvent>,
) {
    let peer_id_clone = peer_id.clone();
    let connection_clone = connection.clone();
    let event_tx_clone = event_tx.clone();
    let connections_clone = connections.clone();

    // Task: Read incoming bi-directional streams (control messages)
    tokio::spawn(async move {
        loop {
            match connection_clone.accept_bi().await {
                Ok((_, mut recv)) => {
                    let peer_id = peer_id_clone.clone();
                    let event_tx = event_tx_clone.clone();
                    tokio::spawn(async move {
                        match read_control_message(&mut recv).await {
                            Ok(msg) => {
                                let _ = event_tx.send(TransportEvent::MessageReceived {
                                    peer_id,
                                    message: msg,
                                });
                            }
                            Err(e) => {
                                debug!("[Transport] Error reading from {}: {}", peer_id, e);
                            }
                        }
                    });
                }
                Err(e) => {
                    info!("[Transport] Connection lost to {}: {}", peer_id_clone, e);
                    connections_clone.remove(&peer_id_clone);
                    let _ = event_tx_clone.send(TransportEvent::ConnectionLost {
                        peer_id: peer_id_clone,
                        reason: e.to_string(),
                    });
                    break;
                }
            }
        }
    });

    let peer_id_clone2 = peer_id.clone();
    let connection_clone2 = connection.clone();
    let event_tx_clone2 = event_tx.clone();
    let _connections_clone2 = connections.clone();

    // Task: Read incoming uni-directional streams (file data)
    tokio::spawn(async move {
        loop {
            match connection_clone2.accept_uni().await {
                Ok(mut recv) => {
                    let peer_id = peer_id_clone2.clone();
                    let event_tx = event_tx_clone2.clone();
                    tokio::spawn(async move {
                        if let Err(e) = handle_file_stream(&mut recv, &peer_id, &event_tx).await {
                            debug!(
                                "[Transport] Error reading file stream from {}: {}",
                                peer_id, e
                            );
                        }
                    });
                }
                Err(e) => {
                    debug!(
                        "[Transport] Uni-stream accept error for {}: {}",
                        peer_id_clone2, e
                    );
                    break;
                }
            }
        }
    });

    // Task: Write outgoing control messages
    tokio::spawn(async move {
        while let Some(msg) = control_rx.recv().await {
            match connection.open_bi().await {
                Ok((mut send, _)) => {
                    if let Err(e) = write_control_message(&mut send, &msg).await {
                        warn!(
                            "[Transport] Failed to send control message to {}: {}",
                            peer_id, e
                        );
                    }
                    let _ = send.finish();
                }
                Err(e) => {
                    warn!(
                        "[Transport] Failed to open bi-stream to {}: {}",
                        peer_id, e
                    );
                    break;
                }
            }
        }
    });
}

async fn handle_file_stream(
    recv: &mut RecvStream,
    peer_id: &str,
    event_tx: &broadcast::Sender<TransportEvent>,
) -> Result<(), TransportError> {
    // Read header length
    let mut len_buf = [0u8; 4];
    recv.read_exact(&mut len_buf)
        .await
        .map_err(|e| TransportError::Protocol(e.to_string()))?;
    let header_len = u32::from_be_bytes(len_buf) as usize;

    // Read header
    let mut header_buf = vec![0u8; header_len];
    recv.read_exact(&mut header_buf)
        .await
        .map_err(|e| TransportError::Protocol(e.to_string()))?;
    let header =
        FileStreamHeader::decode(&header_buf).map_err(|e| TransportError::Protocol(e.to_string()))?;

    // Read all remaining data (the chunk)
    let mut data = Vec::with_capacity(header.chunk_size as usize);
    let mut buf = vec![0u8; 64 * 1024]; // 64KB read buffer
    loop {
        match recv.read(&mut buf).await {
            Ok(Some(n)) => data.extend_from_slice(&buf[..n]),
            Ok(None) => break,
            Err(e) => return Err(TransportError::Protocol(e.to_string())),
        }
    }

    let _ = event_tx.send(TransportEvent::FileChunkReceived {
        peer_id: peer_id.to_string(),
        header,
        data,
    });

    Ok(())
}

// ─── Errors ────────────────────────────────────────────────

#[derive(Debug, thiserror::Error)]
pub enum TransportError {
    #[error("transport setup failed: {0}")]
    Setup(String),
    #[error("already running")]
    AlreadyRunning,
    #[error("not running")]
    NotRunning,
    #[error("bind failed: {0}")]
    Bind(String),
    #[error("connect failed: {0}")]
    Connect(String),
    #[error("handshake failed: {0}")]
    Handshake(String),
    #[error("protocol error: {0}")]
    Protocol(String),
    #[error("send failed: {0}")]
    SendFailed(String),
    #[error("stream open failed: {0}")]
    StreamOpen(String),
    #[error("peer not found: {0}")]
    PeerNotFound(String),
}

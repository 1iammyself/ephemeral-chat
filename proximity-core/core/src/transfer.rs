//! Transfer — Chunked file streaming over QUIC
//!
//! Handles the full lifecycle of file transfers:
//! 1. Offer → Accept/Reject negotiation (over control stream)
//! 2. Chunked file streaming (over uni-directional streams)
//! 3. Progress reporting, cancellation, integrity verification
//! 4. Multi-stream parallel transfer for ultra-high throughput
//!
//! Key feature: uses multiple QUIC uni-streams in parallel to saturate
//! the link. Each stream carries a chunk with a FileStreamHeader,
//! then raw bytes. The receiver reassembles out-of-order chunks.

use crate::crypto::StreamingHasher;
use crate::protocol::{
    FileStreamHeader, MessageType, TransferAcceptPayload, TransferCancelPayload,
    TransferCompletePayload, TransferOfferPayload,
    TransferRejectPayload, DEFAULT_CHUNK_SIZE, HIGH_THROUGHPUT_CHUNK_SIZE, ULTRA_CHUNK_SIZE,
};
use crate::transport::TransportService;
use dashmap::DashMap;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Instant;
use tokio::fs::File;
use tokio::io::{AsyncReadExt, AsyncWriteExt, BufWriter};
use tokio::sync::{broadcast, mpsc, oneshot, Mutex};
use tracing::{error, info};
use uuid::Uuid;

// ─── Transfer Events ───────────────────────────────────────

#[derive(Debug, Clone)]
pub enum TransferEvent {
    /// Incoming transfer offer
    IncomingOffer {
        transfer_id: String,
        peer_id: String,
        file_name: String,
        file_size: u64,
        mime_type: String,
    },
    /// Transfer was accepted
    Accepted {
        transfer_id: String,
        parallel_streams: u32,
    },
    /// Transfer was rejected
    Rejected {
        transfer_id: String,
        reason: String,
    },
    /// Send progress update
    SendProgress {
        transfer_id: String,
        bytes_sent: u64,
        total_bytes: u64,
        speed_bps: u64,
    },
    /// Receive progress update
    ReceiveProgress {
        transfer_id: String,
        bytes_received: u64,
        total_bytes: u64,
        speed_bps: u64,
    },
    /// Transfer completed
    Completed {
        transfer_id: String,
        total_bytes: u64,
        duration_ms: u64,
        speed_bps: u64,
        verified: bool,
    },
    /// Transfer cancelled
    Cancelled {
        transfer_id: String,
        reason: String,
    },
    /// Transfer error
    Error {
        transfer_id: String,
        error: String,
    },
}

// ─── Active Transfer State ─────────────────────────────────

#[derive(Debug, Clone, PartialEq)]
pub enum TransferState {
    Pending,
    Negotiating,
    Transferring,
    Complete,
    Cancelled,
    Error(String),
}

#[allow(dead_code)]
struct ActiveSend {
    transfer_id: String,
    peer_id: String,
    file_path: PathBuf,
    file_size: u64,
    chunk_size: usize,
    parallel_streams: u32,
    state: TransferState,
    bytes_sent: u64,
    start_time: Option<Instant>,
    hasher: StreamingHasher,
    accept_tx: Option<oneshot::Sender<TransferAcceptPayload>>,
    cancel_tx: Option<mpsc::Sender<()>>,
}

#[allow(dead_code)]
struct ActiveReceive {
    transfer_id: String,
    peer_id: String,
    file_name: String,
    file_size: u64,
    total_chunks: u64,
    chunk_size: usize,
    state: TransferState,
    bytes_received: u64,
    start_time: Option<Instant>,
    /// Received chunks (may arrive out of order from parallel streams)
    chunks: BTreeMap<u64, Vec<u8>>,
    next_write_index: u64,
    hasher: StreamingHasher,
    expected_hash: Option<String>,
    output_path: Option<PathBuf>,
    writer: Option<BufWriter<File>>,
}

// ─── Transfer Manager ──────────────────────────────────────

pub struct TransferManager {
    transport: Arc<Mutex<TransportService>>,
    active_sends: Arc<DashMap<String, ActiveSend>>,
    active_receives: Arc<DashMap<String, ActiveReceive>>,
    event_tx: broadcast::Sender<TransferEvent>,
    download_dir: PathBuf,
    /// Adaptive chunk size based on connection quality
    preferred_chunk_size: usize,
    /// Maximum parallel streams per transfer
    max_parallel_streams: u32,
}

impl TransferManager {
    pub fn new(
        transport: Arc<Mutex<TransportService>>,
        download_dir: PathBuf,
    ) -> Self {
        let (event_tx, _) = broadcast::channel(256);
        Self {
            transport,
            active_sends: Arc::new(DashMap::new()),
            active_receives: Arc::new(DashMap::new()),
            event_tx,
            download_dir,
            preferred_chunk_size: HIGH_THROUGHPUT_CHUNK_SIZE,
            max_parallel_streams: 4,
        }
    }

    /// Subscribe to transfer events
    pub fn subscribe(&self) -> broadcast::Receiver<TransferEvent> {
        self.event_tx.subscribe()
    }

    /// Set chunk size for future transfers
    pub fn set_chunk_size(&mut self, size: usize) {
        self.preferred_chunk_size = size.clamp(DEFAULT_CHUNK_SIZE, ULTRA_CHUNK_SIZE);
    }

    /// Set max parallel streams
    pub fn set_max_parallel_streams(&mut self, count: u32) {
        self.max_parallel_streams = count.clamp(1, 32);
    }

    // ─── Sending ───────────────────────────────────────────

    /// Initiate a file transfer to a peer
    pub async fn send_file(
        &self,
        peer_id: &str,
        file_path: &Path,
    ) -> Result<String, TransferError> {
        let metadata = tokio::fs::metadata(file_path)
            .await
            .map_err(|e| TransferError::FileAccess(e.to_string()))?;

        let file_size = metadata.len();
        let file_name = file_path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        let mime_type = mime_guess_from_path(file_path);

        let transfer_id = Uuid::new_v4().to_string();
        let chunk_size = self.preferred_chunk_size;
        let total_chunks = (file_size as f64 / chunk_size as f64).ceil() as u64;

        // Create the active send
        let (accept_tx, accept_rx) = oneshot::channel();
        let (cancel_tx, cancel_rx) = mpsc::channel(1);

        let send = ActiveSend {
            transfer_id: transfer_id.clone(),
            peer_id: peer_id.to_string(),
            file_path: file_path.to_path_buf(),
            file_size,
            chunk_size,
            parallel_streams: self.max_parallel_streams,
            state: TransferState::Pending,
            bytes_sent: 0,
            start_time: None,
            hasher: StreamingHasher::new(),
            accept_tx: Some(accept_tx),
            cancel_tx: Some(cancel_tx),
        };
        self.active_sends.insert(transfer_id.clone(), send);

        // Send the offer
        let transport = self.transport.lock().await;
        transport
            .send_message(
                peer_id,
                MessageType::TransferOffer(TransferOfferPayload {
                    transfer_id: transfer_id.clone(),
                    file_name: file_name.clone(),
                    file_size,
                    mime_type,
                    total_chunks,
                    chunk_size,
                    file_hash: None, // computed during send
                    metadata: Default::default(),
                }),
            )
            .await
            .map_err(|e| TransferError::Send(e.to_string()))?;
        drop(transport);

        // Spawn the send task
        let active_sends = self.active_sends.clone();
        let transport = self.transport.clone();
        let event_tx = self.event_tx.clone();
        let tid = transfer_id.clone();
        let pid = peer_id.to_string();
        let fpath = file_path.to_path_buf();
        let max_parallel = self.max_parallel_streams;

        tokio::spawn(async move {
            // Wait for accept
            let accept = match accept_rx.await {
                Ok(a) => a,
                Err(_) => {
                    // Transfer was cancelled/rejected before acceptance
                    return;
                }
            };

            let parallel = accept.parallel_streams.unwrap_or(1).min(max_parallel);
            let csize = accept.preferred_chunk_size.unwrap_or(chunk_size);

            // Update state
            if let Some(mut s) = active_sends.get_mut(&tid) {
                s.state = TransferState::Transferring;
                s.start_time = Some(Instant::now());
                s.parallel_streams = parallel;
                s.chunk_size = csize;
            }

            let _ = event_tx.send(TransferEvent::Accepted {
                transfer_id: tid.clone(),
                parallel_streams: parallel,
            });

            // Execute the send
            if let Err(e) = execute_send(
                &tid,
                &pid,
                &fpath,
                file_size,
                csize,
                parallel,
                total_chunks,
                &transport,
                &active_sends,
                &event_tx,
                cancel_rx,
            )
            .await
            {
                error!("[Transfer] Send error for {}: {}", tid, e);
                let _ = event_tx.send(TransferEvent::Error {
                    transfer_id: tid.clone(),
                    error: e.to_string(),
                });
                if let Some(mut s) = active_sends.get_mut(&tid) {
                    s.state = TransferState::Error(e.to_string());
                }
            }
        });

        Ok(transfer_id)
    }

    // ─── Receiving ─────────────────────────────────────────

    /// Handle an incoming transfer offer
    pub fn handle_offer(&self, peer_id: &str, offer: TransferOfferPayload) {
        let recv = ActiveReceive {
            transfer_id: offer.transfer_id.clone(),
            peer_id: peer_id.to_string(),
            file_name: offer.file_name.clone(),
            file_size: offer.file_size,
            total_chunks: offer.total_chunks,
            chunk_size: offer.chunk_size,
            state: TransferState::Pending,
            bytes_received: 0,
            start_time: None,
            chunks: BTreeMap::new(),
            next_write_index: 0,
            hasher: StreamingHasher::new(),
            expected_hash: offer.file_hash.clone(),
            output_path: None,
            writer: None,
        };
        self.active_receives
            .insert(offer.transfer_id.clone(), recv);

        let _ = self.event_tx.send(TransferEvent::IncomingOffer {
            transfer_id: offer.transfer_id,
            peer_id: peer_id.to_string(),
            file_name: offer.file_name,
            file_size: offer.file_size,
            mime_type: offer.mime_type,
        });
    }

    /// Accept a transfer offer
    pub async fn accept_transfer(&self, transfer_id: &str) -> Result<(), TransferError> {
        let mut recv = self
            .active_receives
            .get_mut(transfer_id)
            .ok_or_else(|| TransferError::NotFound(transfer_id.to_string()))?;

        recv.state = TransferState::Negotiating;
        recv.start_time = Some(Instant::now());

        // Create output file
        let output_path = self.download_dir.join(&recv.file_name);
        let file = File::create(&output_path)
            .await
            .map_err(|e| TransferError::FileAccess(e.to_string()))?;
        recv.output_path = Some(output_path);
        recv.writer = Some(BufWriter::new(file));

        let peer_id = recv.peer_id.clone();
        drop(recv);

        // Send accept message
        let transport = self.transport.lock().await;
        transport
            .send_message(
                &peer_id,
                MessageType::TransferAccept(TransferAcceptPayload {
                    transfer_id: transfer_id.to_string(),
                    preferred_chunk_size: Some(self.preferred_chunk_size),
                    parallel_streams: Some(self.max_parallel_streams),
                }),
            )
            .await
            .map_err(|e| TransferError::Send(e.to_string()))?;

        // Also notify the sender's accept channel
        if let Some(mut send) = self.active_sends.get_mut(transfer_id) {
            if let Some(tx) = send.accept_tx.take() {
                let _ = tx.send(TransferAcceptPayload {
                    transfer_id: transfer_id.to_string(),
                    preferred_chunk_size: Some(self.preferred_chunk_size),
                    parallel_streams: Some(self.max_parallel_streams),
                });
            }
        }

        Ok(())
    }

    /// Reject a transfer offer
    pub async fn reject_transfer(
        &self,
        transfer_id: &str,
        reason: &str,
    ) -> Result<(), TransferError> {
        let recv = self
            .active_receives
            .remove(transfer_id)
            .ok_or_else(|| TransferError::NotFound(transfer_id.to_string()))?;

        let transport = self.transport.lock().await;
        transport
            .send_message(
                &recv.1.peer_id,
                MessageType::TransferReject(TransferRejectPayload {
                    transfer_id: transfer_id.to_string(),
                    reason: reason.to_string(),
                }),
            )
            .await
            .map_err(|e| TransferError::Send(e.to_string()))?;

        let _ = self.event_tx.send(TransferEvent::Rejected {
            transfer_id: transfer_id.to_string(),
            reason: reason.to_string(),
        });

        Ok(())
    }

    /// Handle received file chunk data (called by transport layer)
    pub async fn handle_chunk(
        &self,
        _peer_id: &str,
        header: FileStreamHeader,
        data: Vec<u8>,
    ) -> Result<(), TransferError> {
        let mut recv = self
            .active_receives
            .get_mut(&header.transfer_id)
            .ok_or_else(|| TransferError::NotFound(header.transfer_id.clone()))?;

        if recv.state == TransferState::Negotiating {
            recv.state = TransferState::Transferring;
        }

        recv.bytes_received += data.len() as u64;

        // Store the chunk (may be out of order from parallel streams)
        recv.chunks.insert(header.chunk_index, data);

        // Write sequential chunks to disk
        loop {
            let idx = recv.next_write_index;
            let chunk_data = match recv.chunks.remove(&idx) {
                Some(data) => data,
                None => break,
            };
            if let Some(writer) = &mut recv.writer {
                writer
                    .write_all(&chunk_data)
                    .await
                    .map_err(|e| TransferError::FileAccess(e.to_string()))?;
                recv.hasher.update(&chunk_data);
            }
            recv.next_write_index += 1;
        }

        // Progress
        let bytes_received = recv.bytes_received;
        let total = recv.file_size;
        let start = recv.start_time.unwrap_or_else(Instant::now);
        let elapsed = start.elapsed().as_secs_f64();
        let speed = if elapsed > 0.0 {
            (bytes_received as f64 / elapsed) as u64
        } else {
            0
        };

        let _ = self.event_tx.send(TransferEvent::ReceiveProgress {
            transfer_id: header.transfer_id.clone(),
            bytes_received,
            total_bytes: total,
            speed_bps: speed,
        });

        // Check if complete
        if recv.next_write_index >= recv.total_chunks && recv.chunks.is_empty() {
            // Flush and close file
            if let Some(mut writer) = recv.writer.take() {
                let _ = writer.flush().await;
            }

            let duration_ms = start.elapsed().as_millis() as u64;
            let file_hash = std::mem::replace(&mut recv.hasher, StreamingHasher::new()).finalize();
            let verified = recv
                .expected_hash
                .as_ref()
                .map(|h| h == &file_hash)
                .unwrap_or(false);

            recv.state = TransferState::Complete;

            let _ = self.event_tx.send(TransferEvent::Completed {
                transfer_id: header.transfer_id.clone(),
                total_bytes: total,
                duration_ms,
                speed_bps: if duration_ms > 0 {
                    total * 1000 / duration_ms
                } else {
                    0
                },
                verified,
            });

            // Send completion message back to sender
            let peer_id = recv.peer_id.clone();
            drop(recv);

            let transport = self.transport.lock().await;
            let _ = transport
                .send_message(
                    &peer_id,
                    MessageType::TransferComplete(TransferCompletePayload {
                        transfer_id: header.transfer_id,
                        total_bytes: total,
                        duration_ms,
                        file_hash,
                        verified,
                    }),
                )
                .await;
        }

        Ok(())
    }

    /// Cancel an active transfer (send or receive)
    pub async fn cancel_transfer(
        &self,
        transfer_id: &str,
        reason: &str,
    ) -> Result<(), TransferError> {
        // Cancel send
        if let Some(mut send) = self.active_sends.get_mut(transfer_id) {
            send.state = TransferState::Cancelled;
            if let Some(cancel) = send.cancel_tx.take() {
                let _ = cancel.send(()).await;
            }
            let peer_id = send.peer_id.clone();
            drop(send);

            let transport = self.transport.lock().await;
            let _ = transport
                .send_message(
                    &peer_id,
                    MessageType::TransferCancel(TransferCancelPayload {
                        transfer_id: transfer_id.to_string(),
                        reason: reason.to_string(),
                        bytes_transferred: 0,
                    }),
                )
                .await;
        }

        // Cancel receive
        if let Some((_, mut recv)) = self.active_receives.remove(transfer_id) {
            recv.state = TransferState::Cancelled;
            // Clean up partial file
            if let Some(path) = &recv.output_path {
                let _ = tokio::fs::remove_file(path).await;
            }
        }

        let _ = self.event_tx.send(TransferEvent::Cancelled {
            transfer_id: transfer_id.to_string(),
            reason: reason.to_string(),
        });

        Ok(())
    }

    /// Get the state of a transfer
    pub fn get_transfer_state(&self, transfer_id: &str) -> Option<TransferState> {
        if let Some(s) = self.active_sends.get(transfer_id) {
            return Some(s.state.clone());
        }
        if let Some(r) = self.active_receives.get(transfer_id) {
            return Some(r.state.clone());
        }
        None
    }
}

// ─── Send Execution ────────────────────────────────────────

async fn execute_send(
    transfer_id: &str,
    peer_id: &str,
    file_path: &Path,
    file_size: u64,
    chunk_size: usize,
    parallel_streams: u32,
    _total_chunks: u64,
    transport: &Arc<Mutex<TransportService>>,
    active_sends: &DashMap<String, ActiveSend>,
    event_tx: &broadcast::Sender<TransferEvent>,
    mut cancel_rx: mpsc::Receiver<()>,
) -> Result<(), TransferError> {
    let file = File::open(file_path)
        .await
        .map_err(|e| TransferError::FileAccess(e.to_string()))?;
    let mut reader = tokio::io::BufReader::new(file);

    let (chunk_tx, mut chunk_rx) = mpsc::channel::<(u64, Vec<u8>)>(parallel_streams as usize * 2);

    // Chunk reader task
    let tid = transfer_id.to_string();
    let csize = chunk_size;
    tokio::spawn(async move {
        let mut chunk_index = 0u64;
        loop {
            let mut buf = vec![0u8; csize];
            match reader.read(&mut buf).await {
                Ok(0) => break,
                Ok(n) => {
                    buf.truncate(n);
                    if chunk_tx.send((chunk_index, buf)).await.is_err() {
                        break;
                    }
                    chunk_index += 1;
                }
                Err(e) => {
                    error!("[Transfer] Read error for {}: {}", tid, e);
                    break;
                }
            }
        }
    });

    // Send chunks over QUIC uni-streams
    let mut bytes_sent = 0u64;
    let start = Instant::now();

    // Use a semaphore to limit parallel streams
    let semaphore = Arc::new(tokio::sync::Semaphore::new(parallel_streams as usize));

    loop {
        tokio::select! {
            _ = cancel_rx.recv() => {
                info!("[Transfer] Send cancelled: {}", transfer_id);
                return Ok(());
            }

            chunk = chunk_rx.recv() => {
                match chunk {
                    Some((chunk_index, data)) => {
                        let permit = semaphore.clone().acquire_owned().await
                            .map_err(|_| TransferError::Send("semaphore closed".into()))?;

                        let data_len = data.len();
                        bytes_sent += data_len as u64;

                        let header = FileStreamHeader {
                            transfer_id: transfer_id.to_string(),
                            chunk_index,
                            chunk_size: data_len as u64,
                            offset: chunk_index * chunk_size as u64,
                            path_index: 0,
                        };

                        let transport = transport.lock().await;
                        let mut send_stream = transport
                            .open_file_stream(peer_id, &header)
                            .await
                            .map_err(|e| TransferError::Send(e.to_string()))?;
                        drop(transport);

                        // Send data on the uni-stream
                        tokio::spawn(async move {
                            let _ = send_stream.write_all(&data).await;
                            let _ = send_stream.finish();
                            drop(permit); // Release semaphore
                        });

                        // Update progress
                        let elapsed = start.elapsed().as_secs_f64();
                        let speed = if elapsed > 0.0 { (bytes_sent as f64 / elapsed) as u64 } else { 0 };

                        if let Some(mut s) = active_sends.get_mut(transfer_id) {
                            s.bytes_sent = bytes_sent;
                        }

                        let _ = event_tx.send(TransferEvent::SendProgress {
                            transfer_id: transfer_id.to_string(),
                            bytes_sent,
                            total_bytes: file_size,
                            speed_bps: speed,
                        });
                    }
                    None => {
                        // All chunks sent
                        break;
                    }
                }
            }
        }
    }

    // Wait for all parallel streams to complete
    let _ = semaphore
        .acquire_many(parallel_streams)
        .await;

    let duration = start.elapsed();
    let speed = if duration.as_secs_f64() > 0.0 {
        (file_size as f64 / duration.as_secs_f64()) as u64
    } else {
        0
    };

    info!(
        "[Transfer] Send complete: {} ({} bytes in {:?}, {} MB/s)",
        transfer_id,
        file_size,
        duration,
        speed / 1_000_000
    );

    if let Some(mut s) = active_sends.get_mut(transfer_id) {
        s.state = TransferState::Complete;
    }

    let _ = event_tx.send(TransferEvent::Completed {
        transfer_id: transfer_id.to_string(),
        total_bytes: file_size,
        duration_ms: duration.as_millis() as u64,
        speed_bps: speed,
        verified: false, // Sender doesn't verify
    });

    Ok(())
}

// ─── Helpers ───────────────────────────────────────────────

fn mime_guess_from_path(path: &Path) -> String {
    let ext = path
        .extension()
        .unwrap_or_default()
        .to_string_lossy()
        .to_lowercase();
    match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "mp4" => "video/mp4",
        "mp3" => "audio/mpeg",
        "pdf" => "application/pdf",
        "zip" => "application/zip",
        "txt" => "text/plain",
        "html" => "text/html",
        "json" => "application/json",
        _ => "application/octet-stream",
    }
    .to_string()
}

// ─── Errors ────────────────────────────────────────────────

#[derive(Debug, thiserror::Error)]
pub enum TransferError {
    #[error("file access error: {0}")]
    FileAccess(String),
    #[error("transfer not found: {0}")]
    NotFound(String),
    #[error("send error: {0}")]
    Send(String),
    #[error("cancelled")]
    Cancelled,
}

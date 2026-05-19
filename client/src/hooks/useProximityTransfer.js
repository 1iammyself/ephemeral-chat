/**
 * useProximityTransfer — React hook for file transfer state
 * 
 * Manages sending/receiving files, progress tracking, and transfer lifecycle.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getProximityService, formatBytes, formatSpeed } from '../utils/proximity';
import { downloadFileOnDevice } from '../utils/downloadHelper';

/**
 * @typedef {Object} TransferState
 * @property {string} transferId
 * @property {string} peerId
 * @property {'sending'|'receiving'} direction
 * @property {'pending'|'transferring'|'complete'|'error'|'cancelled'} state
 * @property {Object} metadata - File metadata
 * @property {number} progress - 0-1
 * @property {number} speed - bytes/sec
 * @property {number} bytesTransferred
 * @property {number} totalBytes
 * @property {Blob} [blob] - Received file blob (receiving only)
 * @property {string} [error]
 */

export function useProximityTransfer() {
  const [transfers, setTransfers] = useState([]); // Active/recent transfers
  const [incomingRequest, setIncomingRequest] = useState(null); // Pending incoming transfer
  const [textMessages, setTextMessages] = useState([]); // Received text messages
  const serviceRef = useRef(null);
  const cleanupRef = useRef([]);

  const getService = useCallback(() => {
    if (!serviceRef.current) {
      serviceRef.current = getProximityService();
    }
    return serviceRef.current;
  }, []);

  // Subscribe to transfer events
  useEffect(() => {
    const service = getService();
    const unsubs = [];

    // Incoming transfer request
    unsubs.push(service.on('incoming-transfer', ({ peerId, transferId, metadata }) => {
      setIncomingRequest({ peerId, transferId, metadata });
    }));

    // Send progress
    unsubs.push(service.on('send-progress', (progress) => {
      setTransfers(prev => prev.map(t =>
        t.transferId === progress.transferId
          ? {
              ...t,
              state: 'transferring',
              progress: progress.progress,
              speed: progress.speed,
              bytesTransferred: progress.bytesSent,
              totalBytes: progress.totalBytes
            }
          : t
      ));
    }));

    // Send complete
    unsubs.push(service.on('send-complete', ({ transferId, speed }) => {
      setTransfers(prev => prev.map(t =>
        t.transferId === transferId
          ? { ...t, state: 'complete', progress: 1, speed }
          : t
      ));
    }));

    // Receive progress
    unsubs.push(service.on('receive-progress', (progress) => {
      setTransfers(prev => {
        const existing = prev.find(t => t.transferId === progress.transferId);
        if (existing) {
          return prev.map(t =>
            t.transferId === progress.transferId
              ? {
                  ...t,
                  state: 'transferring',
                  progress: progress.progress,
                  speed: progress.speed,
                  bytesTransferred: progress.bytesReceived,
                  totalBytes: progress.totalBytes
                }
              : t
          );
        }
        return prev;
      });
    }));

    // Receive complete
    unsubs.push(service.on('receive-complete', ({ transferId, metadata, blob, speed }) => {
      setTransfers(prev => prev.map(t =>
        t.transferId === transferId
          ? { ...t, state: 'complete', progress: 1, blob, speed }
          : t
      ));
    }));

    // Transfer cancelled
    unsubs.push(service.on('transfer-cancelled', ({ transferId }) => {
      setTransfers(prev => prev.map(t =>
        t.transferId === transferId
          ? { ...t, state: 'cancelled' }
          : t
      ));
      setIncomingRequest(prev => prev?.transferId === transferId ? null : prev);
    }));

    // Text messages
    unsubs.push(service.on('text-received', ({ peerId, text }) => {
      setTextMessages(prev => [...prev, {
        id: Date.now().toString(),
        peerId,
        text,
        timestamp: Date.now(),
        direction: 'received'
      }]);
    }));

    cleanupRef.current = unsubs;

    return () => {
      unsubs.forEach(unsub => {
        if (typeof unsub === 'function') unsub();
      });
    };
  }, [getService]);

  // Send file
  const sendFile = useCallback(async (peerId, file, extraMetadata = {}) => {
    const service = getService();
    const transferId = `send-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Add to transfers list immediately with the transferId we'll pass to service
    const transfer = {
      transferId,
      peerId,
      direction: 'sending',
      state: 'pending',
      metadata: {
        name: file.name,
        size: file.size,
        type: file.type
      },
      progress: 0,
      speed: 0,
      bytesTransferred: 0,
      totalBytes: file.size
    };
    setTransfers(prev => [transfer, ...prev]);

    try {
      // Pass our transferId to the service so events match
      await service.sendFile(peerId, file, { ...extraMetadata, _transferId: transferId });
      return { transferId };
    } catch (e) {
      setTransfers(prev => prev.map(t =>
        t.transferId === transferId
          ? { ...t, state: 'error', error: e.message }
          : t
      ));
      throw e;
    }
  }, [getService]);

  // Accept incoming transfer
  const acceptTransfer = useCallback((transferId) => {
    const service = getService();
    service.acceptTransfer(transferId);

    // Find the request and add to transfers
    if (incomingRequest?.transferId === transferId) {
      setTransfers(prev => [{
        transferId,
        peerId: incomingRequest.peerId,
        direction: 'receiving',
        state: 'receiving',
        metadata: incomingRequest.metadata,
        progress: 0,
        speed: 0,
        bytesTransferred: 0,
        totalBytes: incomingRequest.metadata.size
      }, ...prev]);
      setIncomingRequest(null);
    }
  }, [getService, incomingRequest]);

  // Reject incoming transfer
  const rejectTransfer = useCallback((transferId, reason) => {
    const service = getService();
    service.rejectTransfer(transferId, reason);
    setIncomingRequest(null);
  }, [getService]);

  // Cancel transfer
  const cancelTransfer = useCallback((transferId) => {
    const service = getService();
    service.cancelTransfer(transferId);
  }, [getService]);

  // Send text
  const sendText = useCallback((peerId, text) => {
    const service = getService();
    service.sendText(peerId, text);
    setTextMessages(prev => [...prev, {
      id: Date.now().toString(),
      peerId,
      text,
      timestamp: Date.now(),
      direction: 'sent'
    }]);
  }, [getService]);

  // Download received file — works on desktop, mobile browsers, and Capacitor
  const downloadFile = useCallback(async (transfer) => {
    if (!transfer?.blob) return;

    const fileName = transfer.metadata?.name || 'download';
    const mimeType = transfer.metadata?.type || transfer.blob.type || 'application/octet-stream';

    try {
      await downloadFileOnDevice(transfer.blob, fileName, mimeType);
    } catch (e) {
    }
  }, []);

  // Clear completed/cancelled transfers
  const clearTransfer = useCallback((transferId) => {
    setTransfers(prev => prev.filter(t => t.transferId !== transferId));
  }, []);

  // Clear all completed
  const clearCompleted = useCallback(() => {
    setTransfers(prev => prev.filter(t => 
      t.state === 'transferring' || t.state === 'pending' || t.state === 'receiving'
    ));
  }, []);

  return {
    transfers,
    incomingRequest,
    textMessages,
    sendFile,
    sendText,
    acceptTransfer,
    rejectTransfer,
    cancelTransfer,
    downloadFile,
    clearTransfer,
    clearCompleted,
    formatBytes,
    formatSpeed
  };
}

export default useProximityTransfer;

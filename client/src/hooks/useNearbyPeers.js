/**
 * useNearbyPeers — React hook for peer discovery
 * 
 * Manages the discovery lifecycle and provides a reactive list of nearby peers.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getProximityService, destroyProximityService } from '../utils/proximity';

/**
 * @typedef {Object} UseNearbyPeersReturn
 * @property {Array} peers - List of discovered peers
 * @property {boolean} isDiscovering - Whether discovery is active
 * @property {boolean} isConnected - Whether connected to signaling server
 * @property {string|null} error - Error message if any
 * @property {Function} startDiscovery - Start discovering peers
 * @property {Function} stopDiscovery - Stop discovering
 * @property {Function} connectToPeer - Connect to a specific peer
 * @property {Function} disconnectFromPeer - Disconnect from a peer
 * @property {Object|null} connectedPeer - Currently connected peer with pairing code
 */

export function useNearbyPeers() {
  const [peers, setPeers] = useState([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);
  const [connectedPeer, setConnectedPeer] = useState(null);
  const [pairingCode, setPairingCode] = useState(null);
  const serviceRef = useRef(null);
  const cleanupRef = useRef([]);

  // Get or create service
  const getService = useCallback(() => {
    if (!serviceRef.current) {
      serviceRef.current = getProximityService();
    }
    return serviceRef.current;
  }, []);

  // Start discovery
  const startDiscovery = useCallback(async (nickname) => {
    setError(null);
    try {
      const service = getService();

      // Subscribe to events
      const unsubs = [];

      unsubs.push(service.on('peer-discovered', (peer) => {
        setPeers(prev => {
          const exists = prev.find(p => p.id === peer.id);
          if (exists) return prev.map(p => p.id === peer.id ? { ...p, ...peer } : p);
          return [...prev, peer];
        });
      }));

      unsubs.push(service.on('peer-lost', ({ id }) => {
        setPeers(prev => prev.filter(p => p.id !== id));
        setConnectedPeer(prev => prev?.id === id ? null : prev);
      }));

      unsubs.push(service.on('peer-updated', (peer) => {
        setPeers(prev => prev.map(p => p.id === peer.id ? { ...p, ...peer } : p));
      }));

      unsubs.push(service.on('connected', () => {
        setIsConnected(true);
      }));

      unsubs.push(service.on('disconnected', () => {
        setIsConnected(false);
      }));

      unsubs.push(service.on('pairing-code', ({ peerId, code }) => {
        setPairingCode(code);
        setConnectedPeer(prev => prev?.id === peerId ? { ...prev, pairingCode: code } : prev);
      }));

      unsubs.push(service.on('peer-disconnected', ({ id }) => {
        setConnectedPeer(prev => prev?.id === id ? null : prev);
        setPairingCode(null);
      }));

      cleanupRef.current = unsubs;

      await service.startDiscovery(nickname);
      setIsDiscovering(true);
    } catch (e) {
      setError(e.message || 'Failed to start discovery');
      setIsDiscovering(false);
    }
  }, [getService]);

  // Stop discovery
  const stopDiscovery = useCallback(() => {
    const service = serviceRef.current;
    if (service) {
      service.stopDiscovery();
    }
    // Cleanup event listeners
    cleanupRef.current.forEach(unsub => {
      if (typeof unsub === 'function') unsub();
    });
    cleanupRef.current = [];
    setIsDiscovering(false);
    setIsConnected(false);
    setPeers([]);
    setConnectedPeer(null);
    setPairingCode(null);
  }, []);

  // Connect to peer
  const connectToPeer = useCallback(async (peerId) => {
    setError(null);
    try {
      const service = getService();
      // Try to find peer in React state first, then fall back to service's map
      const peer = peers.find(p => p.id === peerId) ||
        (service.peers.has(peerId) ? { ...service.peers.get(peerId) } : { id: peerId });
      const result = await service.connectToPeer(peerId);
      setConnectedPeer({
        ...peer,
        pairingCode: result.pairingCode
      });
      setPairingCode(result.pairingCode);
      return result;
    } catch (e) {
      setError(e.message || 'Failed to connect to peer');
      throw e;
    }
  }, [getService, peers]);

  // Disconnect from peer
  const disconnectFromPeer = useCallback((peerId) => {
    const service = serviceRef.current;
    if (service) {
      service._closeConnection(peerId);
    }
    setConnectedPeer(null);
    setPairingCode(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupRef.current.forEach(unsub => {
        if (typeof unsub === 'function') unsub();
      });
      cleanupRef.current = [];
    };
  }, []);

  return {
    peers,
    isDiscovering,
    isConnected,
    error,
    connectedPeer,
    pairingCode,
    startDiscovery,
    stopDiscovery,
    connectToPeer,
    disconnectFromPeer,
    setConnectedPeer,
    setPairingCode,
    service: serviceRef.current
  };
}

export default useNearbyPeers;

import { useEffect, useRef } from 'react';
import * as Y from 'yjs';

/**
 * Lightweight Yjs provider that relays document updates over the existing
 * Socket.IO connection instead of requiring a separate WebSocket server.
 *
 * Protocol:
 *   emit  'yjs-update'         { roomCode, update: number[] }   — incremental update
 *   emit  'yjs-request-state'  { roomCode }   callback([number[][]])  — request stored updates
 *   on    'yjs-update'         { update: number[] }             — broadcast from others
 */
export function useSocketIOYjsProvider(socketManager, roomCode, ydoc, enabled) {
  const originRef = useRef(Symbol('socket-origin'));

  useEffect(() => {
    if (!enabled || !socketManager || !roomCode || !ydoc) return;

    const origin = originRef.current;

    // Push local updates to server
    const onUpdate = (update, updateOrigin) => {
      if (updateOrigin === origin) return; // don't echo back our own applied updates
      socketManager.emit('yjs-update', { roomCode, update: Array.from(update) });
    };
    ydoc.on('update', onUpdate);

    // Apply incoming updates from server
    const onRemoteUpdate = ({ update }) => {
      if (!update) return;
      Y.applyUpdate(ydoc, new Uint8Array(update), origin);
    };
    socketManager.on('yjs-update', onRemoteUpdate);

    // Request stored state so late joiners see existing content
    socketManager.emit('yjs-request-state', { roomCode }, (savedUpdates) => {
      if (Array.isArray(savedUpdates) && savedUpdates.length > 0) {
        savedUpdates.forEach((u) => Y.applyUpdate(ydoc, new Uint8Array(u), origin));
      }
    });

    return () => {
      ydoc.off('update', onUpdate);
      socketManager.off('yjs-update', onRemoteUpdate);
    };
  }, [enabled, socketManager, roomCode, ydoc]);
}

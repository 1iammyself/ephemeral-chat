import { useEffect, useState } from 'react';
import socketManager from '../socket.js';
import messageOutbox from '../transport/message-outbox.js';

/**
 * React hook exposing the live connection health and pending-send count.
 *
 * `state` is the coarse link health from the connection monitor:
 *   'online' | 'degraded' | 'reconnecting' | 'offline'
 * `pendingCount` is how many composed messages are still waiting to be
 * delivered (queued or retrying) in the outbox.
 *
 * @returns {{ state: string, pendingCount: number, isHealthy: boolean }}
 */
export default function useConnectionStatus() {
  const [state, setState] = useState(() => socketManager.getConnectionState());
  const [pendingCount, setPendingCount] = useState(() => messageOutbox.pendingCount);

  useEffect(() => {
    const unsubState = socketManager.onConnectionState(setState);
    const unsubOutbox = messageOutbox.subscribe(({ pendingCount: count }) => {
      setPendingCount(count);
    });
    return () => {
      unsubState();
      unsubOutbox();
    };
  }, []);

  return { state, pendingCount, isHealthy: state === 'online' };
}

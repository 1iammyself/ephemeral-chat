/**
 * Message Outbox
 *
 * A small, in-memory, send-side reliability queue. When the network is shaky
 * or briefly gone, outgoing messages land here instead of being dropped. On
 * reconnect the outbox flushes them in order, retrying until the server
 * acknowledges each one. Once a message is acked it is removed immediately.
 *
 * Ephemerality: nothing here is persisted to disk. Entries live only as long
 * as they are in-flight, are dropped the instant the server acks them, and are
 * wiped entirely on room leave / panic-burn via clear(). Queued messages also
 * honor their own TTL — a message that would already have expired by the time
 * we get a chance to send it is dropped rather than delivered late.
 *
 * The outbox knows nothing about encryption or sockets. The caller registers a
 * `sender(entry)` that performs encryption + the actual ack'd emit and resolves
 * on delivery. This keeps the queue generic and testable.
 *
 * @typedef {'queued'|'sending'|'sent'|'failed'|'expired'} OutboxStatus
 * @typedef {Object} OutboxEntry
 * @property {string} clientMsgId  client-generated idempotency key
 * @property {Object} payload      pre-encryption send descriptor
 * @property {OutboxStatus} status
 * @property {number} attempts
 * @property {number} createdAt
 * @property {number} maxAttempts  Infinity for core messages, finite for media
 * @property {number|null} overrideTtl  seconds; null = room default / no override
 */

const BASE_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 8000;

function genClientMsgId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `cmid_${crypto.randomUUID()}`;
  }
  return `cmid_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

class MessageOutbox {
  constructor() {
    /** @type {Map<string, OutboxEntry>} */
    this.entries = new Map();
    this.listeners = new Set();
    /** @type {((entry: OutboxEntry) => Promise<void>) | null} */
    this.sender = null;
    this._flushing = false;
    this._retryTimer = null;
  }

  /**
   * Register the function that actually delivers an entry. It should encrypt
   * (at flush time) and emit with an ack, resolving on server confirmation and
   * rejecting on timeout/error.
   * @param {(entry: OutboxEntry) => Promise<void>} sender
   */
  setSender(sender) {
    this.sender = sender;
  }

  /**
   * Queue a message for reliable delivery.
   * @param {Object} payload pre-encryption send descriptor (content, messageType, …)
   * @param {Object} [opts]
   * @param {number} [opts.maxAttempts=Infinity]
   * @param {number|null} [opts.overrideTtl=null] seconds
   * @returns {string} clientMsgId
   */
  enqueue(payload, { maxAttempts = Infinity, overrideTtl = null } = {}) {
    const clientMsgId = genClientMsgId();
    const entry = {
      clientMsgId,
      payload: { ...payload, clientMsgId },
      status: 'queued',
      attempts: 0,
      createdAt: Date.now(),
      maxAttempts,
      overrideTtl,
    };
    this.entries.set(clientMsgId, entry);
    this._notify();
    // Best-effort immediate flush; if offline it stays queued.
    this.flush();
    return clientMsgId;
  }

  /**
   * Mark an entry as delivered and remove it. Called when the server acks
   * (either via the emit callback or when the broadcast echoes clientMsgId).
   * @param {string} clientMsgId
   */
  markDelivered(clientMsgId) {
    if (this.entries.delete(clientMsgId)) {
      this._notify();
    }
  }

  /** Manually mark an entry failed so the UI can offer "tap to resend". */
  markFailed(clientMsgId) {
    const entry = this.entries.get(clientMsgId);
    if (entry) {
      entry.status = 'failed';
      this._notify();
    }
  }

  /** Re-queue a previously failed entry for another attempt. */
  retry(clientMsgId) {
    const entry = this.entries.get(clientMsgId);
    if (entry && entry.status === 'failed') {
      entry.status = 'queued';
      entry.attempts = 0;
      this._notify();
      this.flush();
    }
  }

  /** @returns {OutboxEntry[]} pending entries (queued/sending/failed) */
  getPending() {
    return Array.from(this.entries.values());
  }

  /** @returns {number} count of entries not yet delivered */
  get pendingCount() {
    return this.entries.size;
  }

  /** Wipe everything. Call on room leave / panic-burn. */
  clear() {
    if (this.entries.size === 0) return;
    this.entries.clear();
    this._notify();
  }

  /**
   * Attempt to deliver all queued entries, in insertion order. Safe to call
   * repeatedly; concurrent calls collapse into one in-flight pass.
   */
  async flush() {
    if (this._flushing || !this.sender) return;
    this._flushing = true;
    try {
      for (const entry of this.entries.values()) {
        if (entry.status === 'failed') continue; // awaiting manual resend

        // Drop messages whose TTL has already elapsed — never deliver stale.
        if (this._isExpired(entry)) {
          entry.status = 'expired';
          this._notify();
          this.entries.delete(entry.clientMsgId);
          this._notify();
          continue;
        }

        entry.status = 'sending';
        entry.attempts += 1;
        this._notify();

        try {
          await this.sender(entry);
          // Delivered: sender resolved. Remove if still present (the broadcast
          // echo may have already removed it).
          this.entries.delete(entry.clientMsgId);
          this._notify();
        } catch {
          // Delivery failed (timeout / offline). Decide retry vs. give up.
          if (entry.attempts >= entry.maxAttempts) {
            entry.status = 'failed';
            this._notify();
          } else {
            entry.status = 'queued';
            this._notify();
            this._scheduleRetry(entry.attempts);
            // Stop this pass; a later flush (reconnect or timer) resumes in order.
            break;
          }
        }
      }
    } finally {
      this._flushing = false;
    }
  }

  /**
   * Subscribe to outbox changes (count + entry status). Fires immediately.
   * @param {(state: { pendingCount: number, entries: OutboxEntry[] }) => void} cb
   * @returns {() => void} unsubscribe
   */
  subscribe(cb) {
    this.listeners.add(cb);
    try { cb(this._snapshot()); } catch { /* ignore */ }
    return () => this.listeners.delete(cb);
  }

  // ── internals ──

  _isExpired(entry) {
    if (entry.overrideTtl == null || entry.overrideTtl <= 0) return false;
    return Date.now() - entry.createdAt > entry.overrideTtl * 1000;
  }

  _scheduleRetry(attempts) {
    if (this._retryTimer) return;
    const delay = Math.min(BASE_RETRY_DELAY_MS * 2 ** (attempts - 1), MAX_RETRY_DELAY_MS);
    this._retryTimer = setTimeout(() => {
      this._retryTimer = null;
      this.flush();
    }, delay);
  }

  _snapshot() {
    return { pendingCount: this.entries.size, entries: this.getPending() };
  }

  _notify() {
    const snap = this._snapshot();
    this.listeners.forEach((cb) => {
      try { cb(snap); } catch { /* ignore */ }
    });
  }
}

const messageOutbox = new MessageOutbox();
export default messageOutbox;
export { genClientMsgId };

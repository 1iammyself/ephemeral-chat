/**
 * audit-logger.js — AES-256-GCM encrypted audit trail
 *
 * Writes security-relevant events to an append-only JSONL log where each
 * line is a self-contained encrypted entry:
 *
 *   { iv: "<base64>", ct: "<base64>", ts: <unix_ms> }
 *
 * The plaintext JSON inside each entry:
 *   { event: string, ts: number, ...fields }
 *
 * Key management:
 *   - Set AUDIT_LOG_KEY (hex-encoded 32-byte key) in environment.
 *   - If absent, a fresh ephemeral key is generated at startup and logged
 *     to stdout so the operator can save it.  Entries written with an
 *     ephemeral key are lost after process restart.
 *
 * Log file:
 *   - Controlled by AUDIT_LOG_PATH env var (default: ./audit.log.enc).
 *   - Set AUDIT_LOG_PATH=:memory: to keep entries in-memory only (test mode).
 *
 * Decryption:
 *   Use the companion `audit-logger-decrypt.js` script with the audit key.
 */

const nodeCrypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { logger } = require('./utils');

// ─── Key Setup ───────────────────────────────────────────────

let _auditKey = null; // 32-byte Buffer

function _initKey() {
  if (process.env.AUDIT_LOG_KEY) {
    const keyBuf = Buffer.from(process.env.AUDIT_LOG_KEY, 'hex');
    if (keyBuf.length !== 32) {
      logger.warn('[AuditLog] AUDIT_LOG_KEY must be a 32-byte hex string (64 hex chars). Ignoring and generating ephemeral key.');
    } else {
      _auditKey = keyBuf;
      logger.info('[AuditLog] Loaded audit log key from AUDIT_LOG_KEY env var.');
      return;
    }
  }

  _auditKey = nodeCrypto.randomBytes(32);
  const hexKey = _auditKey.toString('hex');
  logger.info('[AuditLog] Generated ephemeral audit key. Set AUDIT_LOG_KEY=' + hexKey + ' in .env to persist audit log across restarts.');
}

// ─── Log File Setup ──────────────────────────────────────────

let _logPath = null;     // file path, or null for :memory:
let _memoryLog = [];     // used only when _logPath === null

function _initLogFile() {
  const envPath = process.env.AUDIT_LOG_PATH;
  if (envPath === ':memory:') {
    _logPath = null;
    logger.info('[AuditLog] Audit log running in :memory: mode (not persisted).');
    return;
  }

  _logPath = envPath || path.resolve(process.cwd(), 'audit.log.enc');
  logger.info('[AuditLog] Audit log path: ' + _logPath);
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Initialise the audit logger.
 * Must be called before any logAuditEvent() calls.
 */
function initAuditLogger() {
  _initKey();
  _initLogFile();
}

/**
 * Log a security-relevant event.
 *
 * @param {string} event - Event name, e.g. 'key-exchange-complete', 'room-created'
 * @param {Object} [fields] - Additional event fields (do NOT include raw keys/secrets)
 */
function logAuditEvent(event, fields = {}) {
  if (!_auditKey) return; // not initialised

  const entry = JSON.stringify({ event, ts: Date.now(), ...fields });

  try {
    const iv = nodeCrypto.randomBytes(12);
    const cipher = nodeCrypto.createCipheriv('aes-256-gcm', _auditKey, iv);
    const ct = Buffer.concat([cipher.update(entry, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    // Combine ciphertext + 16-byte GCM tag for authenticated decryption
    const ctWithTag = Buffer.concat([ct, tag]);
    const record = JSON.stringify({
      iv: iv.toString('base64'),
      ct: ctWithTag.toString('base64'),
      ts: Date.now(),
    });

    if (_logPath === null) {
      _memoryLog.push(record);
    } else {
      fs.appendFileSync(_logPath, record + '\n', 'utf8');
    }
  } catch (e) {
    logger.warn('[AuditLog] Failed to write audit entry for event "' + event + '":', e.message);
  }
}

/**
 * Decrypt an audit log entry.
 * Used by audit-logger-decrypt.js and tests.
 *
 * @param {string} record - JSON line from the log file
 * @param {Buffer} [key] - 32-byte key. Defaults to the current session key.
 * @returns {Object} Parsed plaintext entry
 */
function decryptAuditEntry(record, key) {
  const { iv: ivB64, ct: ctB64 } = JSON.parse(record);
  const k = key || _auditKey;
  if (!k) throw new Error('[AuditLog] No key available for decryption');

  const iv = Buffer.from(ivB64, 'base64');
  const ctWithTag = Buffer.from(ctB64, 'base64');
  const tag = ctWithTag.slice(ctWithTag.length - 16);
  const ct = ctWithTag.slice(0, ctWithTag.length - 16);

  const decipher = nodeCrypto.createDecipheriv('aes-256-gcm', k, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  return JSON.parse(plaintext);
}

/**
 * Retrieve in-memory log entries (only available in :memory: mode).
 * Primarily for testing.
 * @returns {string[]} Raw encrypted JSONL records
 */
function getMemoryLog() {
  return [..._memoryLog];
}

/**
 * Clear the in-memory log (testing only).
 */
function clearMemoryLog() {
  _memoryLog = [];
}

module.exports = {
  initAuditLogger,
  logAuditEvent,
  decryptAuditEntry,
  getMemoryLog,
  clearMemoryLog,
};

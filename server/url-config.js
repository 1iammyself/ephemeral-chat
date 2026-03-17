/**
 * Centralized URL configuration for the Ephemeral Chat server.
 *
 * Every module that needs a public URL, client-facing URL, or file server
 * URL imports from here instead of ad-hoc env-var lookups with divergent
 * fallback chains.
 */

const { logger } = require('./utils');

/**
 * Whether the server is running in development mode.
 * @returns {boolean}
 */
function isDev() {
  return process.env.NODE_ENV !== 'production';
}

/**
 * Get the canonical public URL of this server.
 * Used for OHTTP, CORS, and WebAuthn.
 *
 * @param {import('http').IncomingMessage} [req] — optional Express request
 * @returns {string}
 */
function getPublicUrl(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '');
  if (req) return `${req.protocol}://${req.get('host')}`;
  const port = process.env.PORT || 3001;
  return `http://localhost:${port}`;
}

/**
 * Get the base URL used for client-facing links (invite URLs, .eph files).
 * @returns {string}
 */
function getClientBaseUrl() {
  if (process.env.BASE_URL) return process.env.BASE_URL.replace(/\/$/, '');
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '');
  if (process.env.RENDER_EXTERNAL_HOSTNAME) {
    return `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`;
  }

  if (!isDev()) {
    logger.warn('[url-config] No BASE_URL or PUBLIC_URL set in production — invite links will use localhost');
  }
  return 'http://localhost:5173';
}

/**
 * Get the E2ECP / external file relay server URL.
 * @returns {string}
 */
function getFileServerUrl() {
  const url = process.env.VITE_FILE_SERVER_URL || process.env.FILE_SERVER_URL;
  if (url) return url;

  if (!isDev()) {
    logger.warn('[url-config] No FILE_SERVER_URL set in production — using localhost:8080');
  }
  return 'http://localhost:8080';
}

module.exports = { isDev, getPublicUrl, getClientBaseUrl, getFileServerUrl };

/**
 * OHTTP Relay Server — RFC 9458 compliant relay
 *
 * Runs on PORT+1, providing the separate-origin relay required by Oblivious HTTP.
 * The relay forwards encrypted OHTTP requests to the gateway on the main server
 * without being able to read the encrypted content (it only sees ciphertext).
 *
 * Architecture:
 *   Client ──OHTTP──▶ Relay (PORT+1) ──HTTP──▶ Gateway (PORT /ohttp/request)
 *   • Relay sees client IP but NOT request content (encrypted)
 *   • Gateway sees request content but NOT client IP (only relay IP)
 *
 * This satisfies the RFC 9458 requirement that relay and gateway are separate
 * parties/origins, providing metadata unlinkability.
 */

const http = require('http');
const https = require('https');
const { logger } = require('./utils');
const relayAuth = require('./config/relay-auth');

// When running as a standalone Render service, use the PORT Render assigns.
// When co-located (local dev), fall back to OHTTP_RELAY_PORT or PORT+1.
const isStandalone = !module.parent;
const RELAY_PORT = parseInt(
  process.env.OHTTP_RELAY_PORT ||
  (isStandalone ? process.env.PORT : null) ||
  (parseInt(process.env.PORT || '3001') + 1)
);

if (!process.env.OHTTP_GATEWAY_URL) {
  throw new Error('[OHTTP Relay] OHTTP_GATEWAY_URL is required (e.g. https://ephemeral-chat-10bb.onrender.com/ohttp/request)');
}
const GATEWAY_URL = process.env.OHTTP_GATEWAY_URL;

let relayServer = null;

function startOHTTPRelay() {
  if (relayServer) return;

  relayServer = http.createServer((req, res) => {
    // Health check for UptimeRobot / monitoring
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ok');
      return;
    }

    // Only accept POST to /ohttp/request
    if (req.method !== 'POST' || req.url !== '/ohttp/request') {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    // RFC 9458 §4: relay MUST only forward OHTTP requests
    const ct = req.headers['content-type'] || '';
    if (!ct.startsWith('message/ohttp-req') && !ct.startsWith('message/ohttp-chunked-req')) {
      res.writeHead(415, { 'content-type': 'text/plain' });
      res.end('Unsupported Media Type — expected message/ohttp-req');
      return;
    }

    // Strip identifying headers before forwarding
    const forwardHeaders = {
      'content-type': ct,
      'content-length': req.headers['content-length'],
    };

    // Remove any undefined headers
    Object.keys(forwardHeaders).forEach(k => {
      if (!forwardHeaders[k]) delete forwardHeaders[k];
    });

    const chunks = [];
    let totalSize = 0;
    req.on('data', chunk => {
      totalSize += chunk.length;
      if (totalSize > 1024 * 1024) { // 1MB max
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const body = Buffer.concat(chunks);

      const gatewayUrl = new URL(GATEWAY_URL);
      const isHttps = gatewayUrl.protocol === 'https:';
      const transport = isHttps ? https : http;

      // Sign the forwarded body for gateway authentication (C3/M1)
      const { signature, timestamp } = relayAuth.signRequest(body);

      const options = {
        hostname: gatewayUrl.hostname,
        port: gatewayUrl.port || (isHttps ? 443 : 80),
        path: gatewayUrl.pathname,
        method: 'POST',
        headers: {
          ...forwardHeaders,
          'content-length': body.length,
          'x-relay-auth': signature,
          'x-relay-timestamp': String(timestamp),
        },
      };

      const proxyReq = transport.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, {
          'content-type': proxyRes.headers['content-type'] || 'message/ohttp-chunked-res',
          'access-control-allow-origin': process.env.ALLOWED_ORIGIN || 'null',
        });
        proxyRes.pipe(res);
      });

      proxyReq.on('error', (err) => {
        logger.warn('[OHTTP Relay] Forward error:', err.message);
        if (!res.headersSent) {
          res.writeHead(502);
          res.end('Bad Gateway');
        }
      });

      proxyReq.write(body);
      proxyReq.end();
    });

    req.on('error', (err) => {
      logger.warn('[OHTTP Relay] Request error:', err.message);
    });
  });

  relayServer.listen(RELAY_PORT, () => {
    logger.info(`🔀 OHTTP Relay server listening on port ${RELAY_PORT} → ${GATEWAY_URL}`);
    logger.info(`   Set OHTTP_RELAY_URL env var (or use /api/config runtime endpoint) for the client relay URL.`);
  });

  relayServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      logger.warn(`[OHTTP Relay] Port ${RELAY_PORT} in use — relay disabled. Set OHTTP_RELAY_PORT to a free port.`);
    } else {
      logger.warn('[OHTTP Relay] Server error:', err.message);
    }
    relayServer = null;
  });
}

function stopOHTTPRelay() {
  if (relayServer) {
    relayServer.close();
    relayServer = null;
    logger.info('[OHTTP Relay] Stopped');
  }
}

module.exports = { startOHTTPRelay, stopOHTTPRelay, RELAY_PORT };

// Standalone entry point — used when deployed as a separate Render service
// Start command: node server/ohttp-relay-server.js
if (require.main === module) {
  require('dotenv').config();
  startOHTTPRelay();
}

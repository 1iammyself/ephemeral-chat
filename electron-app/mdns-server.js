/**
 * Electron mDNS Peer Discovery + Local SDP Signaling Server
 *
 * Provides true offline/LAN peer discovery and WebRTC signaling without
 * any central server. Uses:
 *  - multicast-dns  →  mDNS/DNS-SD peer advertisement and discovery
 *  - Node.js http   →  tiny local SDP exchange server (port range 47800-47900)
 *
 * Service type: _ephchat._tcp.local.
 * TXT record:   deviceId, nickname, platform, port
 *
 * SDP exchange (no Socket.IO):
 *  POST http://{peerIp}:{peerPort}/sdp/{myDeviceId}   → delivers SDP offer/answer
 *  GET  http://localhost:{myPort}/ping                 → health check
 */

const http      = require('http');
const mdns      = require('multicast-dns');
const os        = require('os');
const crypto    = require('crypto');
const net       = require('net');

// ─── Device identity ────────────────────────────────────────────────────────

function getLocalIp() {
  const ifaces = os.networkInterfaces();
  for (const addrs of Object.values(ifaces)) {
    for (const a of addrs) {
      if (a.family === 'IPv4' && !a.internal) return a.address;
    }
  }
  return '127.0.0.1';
}

function getDeviceId() {
  const hostname = os.hostname();
  const platform = process.platform;
  const username = os.userInfo().username;
  return crypto.createHash('sha256')
    .update(`${hostname}-${platform}-${username}`)
    .digest('hex')
    .substring(0, 16);
}

function getDeviceName() {
  const hostname = os.hostname();
  const platformName = process.platform === 'win32' ? 'Windows'
    : process.platform === 'darwin' ? 'Mac' : 'Linux';
  return `${hostname} (${platformName})`;
}

// ─── State ───────────────────────────────────────────────────────────────────

let mdnsInstance  = null;
let sdpServer     = null;
let sdpPort       = 0;
let myDeviceId    = getDeviceId();
let myNickname    = getDeviceName();
let myIp          = getLocalIp();

const peers       = new Map();   // deviceId → { deviceId, nickname, ip, port, platform, lastSeen }
const eventCbs    = new Set();   // Set<(event) => void>

const SERVICE_TYPE  = '_ephchat._tcp.local';
const SERVICE_NAME  = `ephchat-${myDeviceId}._ephchat._tcp.local`;
const ANNOUNCE_INTERVAL_MS = 5_000;
const PRUNE_INTERVAL_MS    = 20_000;
const PEER_TTL_MS          = 15_000;

let announceTimer = null;
let pruneTimer    = null;
let running       = false;

// ─── Event emitter ────────────────────────────────────────────────────────────

function emit(event) {
  for (const cb of eventCbs) {
    try { cb(event); } catch (_) {}
  }
}

// ─── SDP HTTP Server ─────────────────────────────────────────────────────────

async function findFreePort(start, end) {
  return new Promise((resolve, reject) => {
    let port = start + Math.floor(Math.random() * (end - start));
    const tryPort = (p) => {
      if (p > end) { reject(new Error('No free port found')); return; }
      const s = net.createServer();
      s.once('error', () => tryPort(p + 1));
      s.once('listening', () => { s.close(); resolve(p); });
      s.listen(p, '0.0.0.0');
    };
    tryPort(port);
  });
}

async function startSdpServer() {
  sdpPort = await findFreePort(47800, 47900);

  sdpServer = http.createServer((req, res) => {
    // Allow CORS for renderer
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    if (req.method === 'OPTIONS') {
      res.writeHead(204); res.end(); return;
    }

    // GET /ping → return our identity
    if (req.method === 'GET' && req.url === '/ping') {
      const body = JSON.stringify({ deviceId: myDeviceId, port: sdpPort, ip: myIp });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
      res.end(body);
      return;
    }

    // POST /sdp/{fromDeviceId} → receive SDP from peer
    if (req.method === 'POST' && req.url.startsWith('/sdp/')) {
      const fromDeviceId = decodeURIComponent(req.url.substring(5));
      const chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => {
        const sdp = Buffer.concat(chunks).toString('utf8');
        emit({ type: 'sdp-received', fromPeerId: fromDeviceId, sdp });
        res.writeHead(200, { 'Content-Length': '2' });
        res.end('OK');
      });
      req.on('error', () => { res.writeHead(400); res.end(); });
      return;
    }

    res.writeHead(404); res.end();
  });

  await new Promise((resolve, reject) => {
    sdpServer.listen(sdpPort, '0.0.0.0', () => {
      console.log(`[mDNS] SDP server listening on :${sdpPort}`);
      resolve();
    });
    sdpServer.once('error', reject);
  });
}

// ─── mDNS advertisement and discovery ────────────────────────────────────────

function encodeTxtRecord(kv) {
  // Each entry: length-prefixed "key=value"
  return Object.entries(kv).map(([k, v]) => {
    const s = `${k}=${v}`;
    const buf = Buffer.allocUnsafe(1 + s.length);
    buf[0] = s.length;
    buf.write(s, 1);
    return buf;
  });
}

function parseTxtRecord(answers) {
  const result = {};
  for (const buf of answers) {
    if (!Buffer.isBuffer(buf)) continue;
    let i = 0;
    while (i < buf.length) {
      const len = buf[i++];
      const entry = buf.slice(i, i + len).toString('utf8');
      i += len;
      const eq = entry.indexOf('=');
      if (eq > 0) result[entry.slice(0, eq)] = entry.slice(eq + 1);
    }
  }
  return result;
}

function announceSelf() {
  if (!mdnsInstance || !running) return;
  myIp = getLocalIp();

  mdnsInstance.respond({
    answers: [
      {
        name: SERVICE_TYPE,
        type: 'PTR',
        ttl: 28,
        data: SERVICE_NAME,
      },
      {
        name: SERVICE_NAME,
        type: 'SRV',
        ttl: 28,
        data: { target: `${os.hostname()}.local`, port: sdpPort, priority: 0, weight: 0 },
      },
      {
        name: SERVICE_NAME,
        type: 'TXT',
        ttl: 28,
        data: encodeTxtRecord({
          deviceId: myDeviceId,
          nickname: myNickname.substring(0, 30),
          platform: 'electron',
          port: String(sdpPort),
          ip: myIp,
        }),
      },
      {
        name: `${os.hostname()}.local`,
        type: 'A',
        ttl: 28,
        data: myIp,
      },
    ],
  });
}

function queryPeers() {
  if (!mdnsInstance || !running) return;
  mdnsInstance.query({
    questions: [{ name: SERVICE_TYPE, type: 'PTR' }],
  });
}

function startMdns() {
  mdnsInstance = mdns();

  mdnsInstance.on('response', (response) => {
    // Extract SRV + TXT + A records from the response
    const allRecords = [...(response.answers || []), ...(response.additionals || [])];
    const txtMap = {};   // serviceName → parsed txt
    const srvMap = {};   // serviceName → { port, target }
    const aMap   = {};   // hostname → ip

    for (const r of allRecords) {
      if (r.type === 'TXT')  txtMap[r.name] = parseTxtRecord(r.data);
      if (r.type === 'SRV')  srvMap[r.name] = r.data;
      if (r.type === 'A')    aMap[r.name]   = r.data;
    }

    for (const [svcName, txt] of Object.entries(txtMap)) {
      if (!svcName.includes('_ephchat._tcp')) continue;
      const srv = srvMap[svcName];
      if (!txt.deviceId || txt.deviceId === myDeviceId) continue;

      const ip   = txt.ip || aMap[srv?.target] || '';
      const port = parseInt(txt.port || (srv?.port) || '0', 10);
      if (!ip || !port) continue;

      const existing = peers.get(txt.deviceId);
      const now = Date.now();

      if (!existing) {
        const peer = { deviceId: txt.deviceId, nickname: txt.nickname || txt.deviceId, ip, port, platform: txt.platform || 'unknown', lastSeen: now };
        peers.set(txt.deviceId, peer);
        console.log(`[mDNS] Peer found: ${peer.nickname} @ ${ip}:${port}`);
        emit({ type: 'peer-found', ...peer, transport: 'mdns' });
      } else {
        existing.lastSeen = now;
        existing.ip = ip;
        existing.port = port;
      }
    }
  });

  mdnsInstance.on('query', (query) => {
    // Respond to queries for our service type
    const relevant = (query.questions || []).some(q =>
      q.name === SERVICE_TYPE || q.name === SERVICE_NAME
    );
    if (relevant) announceSelf();
  });

  mdnsInstance.on('error', (err) => {
    console.warn('[mDNS] Error:', err.message);
  });
}

function startPruning() {
  pruneTimer = setInterval(() => {
    const now = Date.now();
    for (const [id, peer] of peers) {
      if (now - peer.lastSeen > PEER_TTL_MS) {
        peers.delete(id);
        console.log(`[mDNS] Peer timed out: ${peer.nickname}`);
        emit({ type: 'peer-lost', deviceId: id });
      }
    }
  }, PRUNE_INTERVAL_MS);
}

// ─── Public API ──────────────────────────────────────────────────────────────

async function start(options = {}) {
  if (running) return;
  if (options.nickname) myNickname = options.nickname;
  myIp = getLocalIp();

  await startSdpServer();
  startMdns();

  // Initial announcement + query with burst discovery for fast peer detection
  announceSelf();
  queryPeers();

  // Burst discover: re-query at 500ms and 1500ms for faster initial peer detection
  const burst1 = setTimeout(() => { announceSelf(); queryPeers(); }, 500);
  const burst2 = setTimeout(() => { announceSelf(); queryPeers(); }, 1500);
  // Store burst timers for cleanup
  this._burstTimers = [burst1, burst2];

  // Periodic re-announcement and peer queries
  announceTimer = setInterval(() => {
    announceSelf();
    queryPeers();
  }, ANNOUNCE_INTERVAL_MS);

  startPruning();
  running = true;
  console.log(`[mDNS] Started — deviceId=${myDeviceId} ip=${myIp} sdpPort=${sdpPort}`);
}

async function stop() {
  if (!running) return;
  running = false;

  clearInterval(announceTimer);
  clearInterval(pruneTimer);
  if (this._burstTimers) {
    this._burstTimers.forEach(t => clearTimeout(t));
    this._burstTimers = null;
  }
  announceTimer = null;
  pruneTimer    = null;

  if (mdnsInstance) {
    // Send goodbye (TTL=0) before destroying
    try {
      mdnsInstance.respond({
        answers: [{ name: SERVICE_TYPE, type: 'PTR', ttl: 0, data: SERVICE_NAME }],
      });
    } catch (_) {}
    mdnsInstance.destroy();
    mdnsInstance = null;
  }

  if (sdpServer) {
    await new Promise(r => sdpServer.close(r));
    sdpServer = null;
    sdpPort   = 0;
  }

  peers.clear();
  console.log('[mDNS] Stopped');
}

/**
 * Send SDP offer/answer to a peer's local HTTP server.
 */
async function sendSdpToPeer(peerIp, peerPort, sdpPayload) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(typeof sdpPayload === 'string' ? sdpPayload : JSON.stringify(sdpPayload), 'utf8');
    const req = http.request({
      hostname: peerIp,
      port:     peerPort,
      path:     `/sdp/${encodeURIComponent(myDeviceId)}`,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': body.length },
    }, (res) => {
      res.resume();
      res.on('end', () => resolve({ success: res.statusCode === 200 }));
    });
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('SDP send timed out')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function onEvent(cb) { eventCbs.add(cb); }
function offEvent(cb) { eventCbs.delete(cb); }
function getPeers()   { return [...peers.values()]; }
function isRunning()  { return running; }
function getMyInfo()  { return { deviceId: myDeviceId, nickname: myNickname, ip: myIp, port: sdpPort }; }

module.exports = {
  start,
  stop,
  sendSdpToPeer,
  onEvent,
  offEvent,
  getPeers,
  isRunning,
  getMyInfo,
  getDeviceId,
  getDeviceName,
};

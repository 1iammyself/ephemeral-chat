/**
 * Link Preview Service
 * Detects URLs in messages, fetches metadata (oEmbed / OpenGraph),
 * caches results in Redis (with in-memory fallback), and notifies
 * clients via Socket.IO when previews are ready.
 *
 * Supports: YouTube, Spotify, TikTok, Twitter/X, and generic OG sites.
 * No PostgreSQL — uses Redis + in-memory Map caching only.
 */

const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const { logger } = require('./utils');

// ─── Constants ──────────────────────────────────────────────
const URL_REGEX = /https?:\/\/[^\s<>"')\]},;]+/gi;

// Cache TTLs in seconds
const CACHE_TTL = {
  youtube: 7 * 24 * 60 * 60,     // 7 days
  spotify: 30 * 24 * 60 * 60,    // 30 days
  twitter: 1 * 24 * 60 * 60,     // 1 day
  tiktok: 3 * 24 * 60 * 60,      // 3 days
  generic: 3 * 24 * 60 * 60,     // 3 days
};

// Rate limiting
const RATE_LIMIT = {
  maxPerUser: 10,        // max preview generations per user per minute
  maxGlobal: 50,         // max metadata fetches per minute globally
  windowMs: 60 * 1000,   // 1 minute window
};

// Fetch timeout
const FETCH_TIMEOUT_MS = 8000;

// Max in-memory cache entries (LRU-style eviction)
const MAX_MEMORY_CACHE = 2000;

// Dangerous URL schemes to reject
const BLOCKED_SCHEMES = ['javascript:', 'data:', 'file:', 'vbscript:', 'ftp:'];

// Domains known to be dangerous or not useful for previews
const BLOCKED_DOMAINS = [
  'localhost', '127.0.0.1', '0.0.0.0', '::1',
  // Add known malware/phishing domains here
];

// ─── oEmbed Endpoints ───────────────────────────────────────
const OEMBED_ENDPOINTS = {
  youtube: 'https://www.youtube.com/oembed',
  spotify: 'https://open.spotify.com/oembed',
  twitter: 'https://publish.twitter.com/oembed',
  tiktok: 'https://www.tiktok.com/oembed',
};

// ─── Platform Detection ─────────────────────────────────────
function detectPlatform(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    if (host.includes('youtube.com') || host.includes('youtu.be'))
      return 'youtube';
    if (host.includes('spotify.com'))
      return 'spotify';
    if (host.includes('tiktok.com'))
      return 'tiktok';
    if (host.includes('twitter.com') || host.includes('x.com'))
      return 'twitter';
    if (host.includes('reddit.com') || host.includes('redd.it'))
      return 'reddit';
    if (host.includes('github.com'))
      return 'github';
    if (host.includes('instagram.com'))
      return 'instagram';

    return 'generic';
  } catch {
    return 'generic';
  }
}

// ─── YouTube Helpers ────────────────────────────────────────
function extractYouTubeVideoId(url) {
  try {
    const parsed = new URL(url);
    // youtu.be/VIDEO_ID
    if (parsed.hostname === 'youtu.be') {
      return parsed.pathname.slice(1).split('/')[0];
    }
    // youtube.com/watch?v=VIDEO_ID
    if (parsed.searchParams.has('v')) {
      return parsed.searchParams.get('v');
    }
    // youtube.com/embed/VIDEO_ID or youtube.com/shorts/VIDEO_ID
    const pathMatch = parsed.pathname.match(/\/(embed|shorts|v)\/([^/?&]+)/);
    if (pathMatch) return pathMatch[2];
    // youtube.com/live/VIDEO_ID
    const liveMatch = parsed.pathname.match(/\/live\/([^/?&]+)/);
    if (liveMatch) return liveMatch[1];
  } catch { /* ignore */ }
  return null;
}

// ─── Spotify Helpers ────────────────────────────────────────
function extractSpotifyData(url) {
  try {
    const parsed = new URL(url);
    // open.spotify.com/track/ID, /album/ID, /playlist/ID, /episode/ID
    const match = parsed.pathname.match(/\/(track|album|playlist|episode|show)\/([^/?&]+)/);
    if (match) return { type: match[1], id: match[2] };
  } catch { /* ignore */ }
  return null;
}

// ─── URL Validation ─────────────────────────────────────────
function isUrlSafe(url) {
  try {
    const parsed = new URL(url);

    // Block dangerous schemes
    for (const scheme of BLOCKED_SCHEMES) {
      if (url.toLowerCase().startsWith(scheme)) return false;
    }

    // Must be http or https
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;

    // Block dangerous domains
    for (const domain of BLOCKED_DOMAINS) {
      if (parsed.hostname === domain) return false;
    }

    // Block private IP ranges
    const ipMatch = parsed.hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipMatch) {
      const [, a, b] = ipMatch.map(Number);
      if (a === 10) return false;                    // 10.x.x.x
      if (a === 172 && b >= 16 && b <= 31) return false; // 172.16-31.x.x
      if (a === 192 && b === 168) return false;      // 192.168.x.x
      if (a === 169 && b === 254) return false;      // 169.254.x.x (link-local)
    }

    // URL length sanity check
    if (url.length > 2048) return false;

    return true;
  } catch {
    return false;
  }
}

// ─── Extract URLs from message content ──────────────────────
function extractUrls(content) {
  if (!content || typeof content !== 'string') return [];
  const matches = content.match(URL_REGEX) || [];
  // Deduplicate and validate, limit to 5 URLs per message
  const seen = new Set();
  return matches
    .map(url => {
      // Strip trailing punctuation that's likely not part of the URL
      return url.replace(/[.,;:!?)}\]]+$/, '');
    })
    .filter(url => {
      if (seen.has(url)) return false;
      seen.add(url);
      return isUrlSafe(url);
    })
    .slice(0, 5);
}

// ─── Cache Key ──────────────────────────────────────────────
function cacheKey(url) {
  return `lp:${crypto.createHash('sha256').update(url).digest('hex').slice(0, 32)}`;
}

// ─── HTTP Fetch Helper ──────────────────────────────────────
function fetchUrl(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    const maxRedirects = options.maxRedirects || 3;

    const req = client.get(url, {
      timeout: FETCH_TIMEOUT_MS,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; EphemeralChatBot/1.0; +https://ephemeral.chat)',
        'Accept': options.accept || 'application/json',
        ...(options.headers || {}),
      },
    }, (res) => {
      // Follow redirects
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        if (maxRedirects <= 0) {
          reject(new Error('Too many redirects'));
          return;
        }
        const redirectUrl = new URL(res.headers.location, url).href;
        fetchUrl(redirectUrl, { ...options, maxRedirects: maxRedirects - 1 })
          .then(resolve)
          .catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      const chunks = [];
      let totalSize = 0;
      const maxSize = options.maxSize || 512 * 1024; // 512KB default

      res.on('data', (chunk) => {
        totalSize += chunk.length;
        if (totalSize > maxSize) {
          req.destroy();
          reject(new Error('Response too large'));
          return;
        }
        chunks.push(chunk);
      });

      res.on('end', () => {
        resolve({
          body: Buffer.concat(chunks).toString('utf-8'),
          headers: res.headers,
          statusCode: res.statusCode,
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
  });
}

// ─── oEmbed Fetcher ─────────────────────────────────────────
async function fetchOEmbed(platform, url) {
  const endpoint = OEMBED_ENDPOINTS[platform];
  if (!endpoint) return null;

  try {
    const oembedUrl = `${endpoint}?url=${encodeURIComponent(url)}&format=json`;
    const res = await fetchUrl(oembedUrl);
    return JSON.parse(res.body);
  } catch (err) {
    logger.warn(`[LinkPreview] oEmbed fetch failed for ${platform}: ${err.message}`);
    return null;
  }
}

// ─── OpenGraph Fetcher ──────────────────────────────────────
async function fetchOpenGraph(url) {
  try {
    const res = await fetchUrl(url, {
      accept: 'text/html',
      maxSize: 256 * 1024, // 256KB limit for HTML
    });

    const html = res.body;
    const og = {};

    // Extract meta tags (simple regex parser — no cheerio dependency needed)
    const metaRegex = /<meta\s+(?:[^>]*?\s+)?(?:property|name)\s*=\s*["']([^"']+)["'][^>]*?\s+content\s*=\s*["']([^"']*?)["'][^>]*?\/?>/gi;
    const metaRegex2 = /<meta\s+(?:[^>]*?\s+)?content\s*=\s*["']([^"']*?)["'][^>]*?\s+(?:property|name)\s*=\s*["']([^"']+)["'][^>]*?\/?>/gi;
    let match;

    while ((match = metaRegex.exec(html)) !== null) {
      og[match[1].toLowerCase()] = match[2];
    }
    while ((match = metaRegex2.exec(html)) !== null) {
      og[match[2].toLowerCase()] = match[1];
    }

    // Fallback to <title> tag
    if (!og['og:title']) {
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch) og['og:title'] = titleMatch[1].trim();
    }

    // Fallback to meta description
    if (!og['og:description'] && og['description']) {
      og['og:description'] = og['description'];
    }

    return og;
  } catch (err) {
    logger.warn(`[LinkPreview] OG fetch failed for ${url}: ${err.message}`);
    return null;
  }
}

// ─── Build Preview Object ───────────────────────────────────
async function buildPreview(url) {
  const platform = detectPlatform(url);
  let preview = {
    url,
    platform,
    title: null,
    description: null,
    thumbnailUrl: null,
    author: null,
    embedUrl: null,
    provider: null,
    metadata: {},
  };

  try {
    if (platform === 'youtube') {
      const videoId = extractYouTubeVideoId(url);
      const oembed = await fetchOEmbed('youtube', url);

      preview.title = oembed?.title || null;
      preview.author = oembed?.author_name || null;
      preview.provider = 'YouTube';
      preview.thumbnailUrl = videoId
        ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
        : (oembed?.thumbnail_url || null);
      preview.embedUrl = videoId
        ? `https://www.youtube.com/embed/${videoId}`
        : null;
      preview.metadata = { videoId, type: oembed?.type };

    } else if (platform === 'spotify') {
      const spotifyData = extractSpotifyData(url);
      const oembed = await fetchOEmbed('spotify', url);

      preview.title = oembed?.title || null;
      preview.author = oembed?.description || null; // Spotify puts artist in description
      preview.provider = 'Spotify';
      preview.thumbnailUrl = oembed?.thumbnail_url || null;
      preview.embedUrl = spotifyData
        ? `https://open.spotify.com/embed/${spotifyData.type}/${spotifyData.id}`
        : null;
      preview.metadata = { ...spotifyData, type: oembed?.type };

    } else if (platform === 'tiktok') {
      const oembed = await fetchOEmbed('tiktok', url);

      preview.title = oembed?.title || null;
      preview.author = oembed?.author_name || null;
      preview.provider = 'TikTok';
      preview.thumbnailUrl = oembed?.thumbnail_url || null;
      // TikTok doesn't have clean iframe embeds; use thumbnail + link
      preview.metadata = { authorUrl: oembed?.author_url };

    } else if (platform === 'twitter') {
      // Twitter oEmbed returns HTML, not JSON with clean fields
      const oembed = await fetchOEmbed('twitter', url);

      preview.title = null; // Twitter oEmbed doesn't give a clean title
      preview.author = oembed?.author_name || null;
      preview.provider = oembed?.provider_name || 'X (Twitter)';
      // Extract tweet text from the HTML response
      if (oembed?.html) {
        const textMatch = oembed.html.match(/<p[^>]*>(.*?)<\/p>/s);
        if (textMatch) {
          preview.description = textMatch[1]
            .replace(/<[^>]+>/g, '')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .trim()
            .slice(0, 280);
        }
      }
      preview.metadata = { authorUrl: oembed?.author_url };

    } else {
      // Generic — fetch OpenGraph tags
      const og = await fetchOpenGraph(url);
      if (!og) return null;

      preview.title = og['og:title'] || og['twitter:title'] || null;
      preview.description = og['og:description'] || og['twitter:description'] || null;
      preview.thumbnailUrl = og['og:image'] || og['twitter:image'] || null;
      preview.author = og['og:site_name'] || og['article:author'] || null;
      preview.provider = og['og:site_name'] || null;

      // Resolve relative thumbnail URLs
      if (preview.thumbnailUrl && !preview.thumbnailUrl.startsWith('http')) {
        try {
          preview.thumbnailUrl = new URL(preview.thumbnailUrl, url).href;
        } catch { /* ignore */ }
      }
    }

    // Must have at least a title or description to be useful
    if (!preview.title && !preview.description && !preview.thumbnailUrl) {
      return null;
    }

    preview.createdAt = Date.now();
    return preview;

  } catch (err) {
    logger.warn(`[LinkPreview] buildPreview failed for ${url}: ${err.message}`);
    return null;
  }
}

// ─── LinkPreviewService Class ───────────────────────────────
class LinkPreviewService {
  constructor(redisClient = null) {
    this.redis = redisClient;
    this.memoryCache = new Map(); // url-hash → { preview, expiresAt }
    this.io = null;

    // Rate limiting state
    this.userRates = new Map();   // socketId → { count, resetAt }
    this.globalRate = { count: 0, resetAt: Date.now() + RATE_LIMIT.windowMs };

    // Processing queue (simple async queue)
    this.queue = [];
    this.processing = false;
    this.concurrency = 3; // max concurrent fetches
    this.activeCount = 0;

    logger.info('🔗 Link Preview Service initialized');
  }

  setIo(io) {
    this.io = io;
  }

  // ── Rate Limiting ─────────────────────────────────────────
  _checkUserRate(socketId) {
    const now = Date.now();
    let entry = this.userRates.get(socketId);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + RATE_LIMIT.windowMs };
      this.userRates.set(socketId, entry);
    }
    if (entry.count >= RATE_LIMIT.maxPerUser) return false;
    entry.count++;
    return true;
  }

  _checkGlobalRate() {
    const now = Date.now();
    if (now > this.globalRate.resetAt) {
      this.globalRate = { count: 0, resetAt: now + RATE_LIMIT.windowMs };
    }
    if (this.globalRate.count >= RATE_LIMIT.maxGlobal) return false;
    this.globalRate.count++;
    return true;
  }

  // ── Cache Operations ──────────────────────────────────────
  async _getFromCache(url) {
    const key = cacheKey(url);

    // Try Redis first
    if (this.redis) {
      try {
        const cached = await this.redis.get(key);
        if (cached) {
          const preview = JSON.parse(cached);
          // Also populate memory cache
          this.memoryCache.set(key, {
            preview,
            expiresAt: Date.now() + (CACHE_TTL[preview.platform] || CACHE_TTL.generic) * 1000
          });
          return preview;
        }
      } catch (err) {
        logger.warn(`[LinkPreview] Redis get failed: ${err.message}`);
      }
    }

    // Try memory cache
    const memEntry = this.memoryCache.get(key);
    if (memEntry && memEntry.expiresAt > Date.now()) {
      return memEntry.preview;
    }

    // Expired? Remove it
    if (memEntry) this.memoryCache.delete(key);
    return null;
  }

  async _setCache(url, preview) {
    const key = cacheKey(url);
    const ttlSeconds = CACHE_TTL[preview.platform] || CACHE_TTL.generic;

    // Store in Redis
    if (this.redis) {
      try {
        await this.redis.setEx(key, ttlSeconds, JSON.stringify(preview));
      } catch (err) {
        logger.warn(`[LinkPreview] Redis set failed: ${err.message}`);
      }
    }

    // Store in memory cache (LRU eviction)
    if (this.memoryCache.size >= MAX_MEMORY_CACHE) {
      // Evict oldest entry
      const firstKey = this.memoryCache.keys().next().value;
      this.memoryCache.delete(firstKey);
    }
    this.memoryCache.set(key, {
      preview,
      expiresAt: Date.now() + ttlSeconds * 1000
    });
  }

  // ── Process Queue ─────────────────────────────────────────
  async _processQueue() {
    while (this.queue.length > 0 && this.activeCount < this.concurrency) {
      const job = this.queue.shift();
      this.activeCount++;

      // Process without awaiting to allow concurrent execution
      this._executeJob(job).finally(() => {
        this.activeCount--;
        this._processQueue(); // Process next
      });
    }
  }

  async _executeJob(job) {
    const { url, messageId, roomCode, socketId } = job;

    try {
      // Double-check cache (another request might have populated it)
      const cached = await this._getFromCache(url);
      if (cached) {
        this._emitPreview(roomCode, messageId, cached);
        return;
      }

      // Check global rate limit
      if (!this._checkGlobalRate()) {
        logger.warn(`[LinkPreview] Global rate limit reached, skipping ${url}`);
        return;
      }

      // Fetch metadata
      const preview = await buildPreview(url);
      if (!preview) return;

      // Cache it
      await this._setCache(url, preview);

      // Emit to room
      this._emitPreview(roomCode, messageId, preview);

    } catch (err) {
      logger.warn(`[LinkPreview] Job failed for ${url}: ${err.message}`);
    }
  }

  _emitPreview(roomCode, messageId, preview) {
    if (!this.io) return;
    this.io.to(roomCode).emit('link-preview-update', {
      messageId,
      previews: [preview],
    });
  }

  // ── Main Entry Point ──────────────────────────────────────
  /**
   * Process a text message: extract URLs, return cached previews,
   * and queue async fetches for uncached ones.
   *
   * @param {Object} params
   * @param {string} params.content - Message text content
   * @param {string} params.messageId - Message ID
   * @param {string} params.roomCode - Room code for broadcasting
   * @param {string} params.socketId - Sender socket ID (for rate limiting)
   * @returns {Promise<Object[]>} Array of immediately-available cached previews
   */
  async processMessage({ content, messageId, roomCode, socketId }) {
    const urls = extractUrls(content);
    if (urls.length === 0) return [];

    // Per-user rate limit
    if (!this._checkUserRate(socketId)) {
      logger.warn(`[LinkPreview] User rate limit reached for ${socketId}`);
      return [];
    }

    const cachedPreviews = [];

    for (const url of urls) {
      // Check cache first
      const cached = await this._getFromCache(url);
      if (cached) {
        cachedPreviews.push(cached);
        continue;
      }

      // Queue for async fetch
      this.queue.push({ url, messageId, roomCode, socketId });
    }

    // Kick off queue processing
    this._processQueue();

    return cachedPreviews;
  }

  // ── Cleanup ───────────────────────────────────────────────
  cleanup() {
    // Prune expired memory cache entries
    const now = Date.now();
    for (const [key, entry] of this.memoryCache) {
      if (entry.expiresAt < now) {
        this.memoryCache.delete(key);
      }
    }
    // Prune stale rate limit entries
    for (const [sid, entry] of this.userRates) {
      if (now > entry.resetAt) {
        this.userRates.delete(sid);
      }
    }
  }
}

// ─── Exports ────────────────────────────────────────────────
module.exports = {
  LinkPreviewService,
  extractUrls,
  detectPlatform,
  isUrlSafe,
  extractYouTubeVideoId,
  extractSpotifyData,
};

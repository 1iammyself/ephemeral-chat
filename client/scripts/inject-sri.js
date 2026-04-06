#!/usr/bin/env node
/**
 * Post-build SRI (Subresource Integrity) injection.
 *
 * Reads the built index.html, computes SHA-384 hashes for all
 * <script src="..."> and <link rel="stylesheet" href="..."> tags
 * that reference local assets, and injects integrity="sha384-..." attributes.
 *
 * Run after `vite build`:
 *   node scripts/inject-sri.js
 *
 * Security: SRI prevents tampered CDN/server assets from executing.
 * Combined with CSP require-sri-for, this blocks unsigned scripts entirely.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIST_DIR = path.join(__dirname, '..', 'dist');
const INDEX_HTML = path.join(DIST_DIR, 'index.html');

if (!fs.existsSync(INDEX_HTML)) {
  console.error(`[SRI] dist/index.html not found — run vite build first`);
  process.exit(1);
}

let html = fs.readFileSync(INDEX_HTML, 'utf8');
let injected = 0;
let failed = 0;

/**
 * Compute SHA-384 hash of a file and return as base64.
 */
function computeHash(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha384').update(content).digest('base64');
}

/**
 * Resolve a src/href to an absolute path in dist/.
 * Returns null if it's an external URL or can't be resolved.
 */
function resolvePath(src) {
  if (!src || src.startsWith('http://') || src.startsWith('https://') || src.startsWith('//')) {
    return null; // External — don't hash
  }
  // Strip leading /
  const relative = src.replace(/^\//, '');
  const absolute = path.join(DIST_DIR, relative);
  return fs.existsSync(absolute) ? absolute : null;
}

// Process <script src="..."> tags
html = html.replace(
  /<script([^>]*)\s+src="([^"]+)"([^>]*)>/g,
  (match, before, src, after) => {
    if (match.includes('integrity=')) return match; // Already has SRI
    const filePath = resolvePath(src);
    if (!filePath) return match;
    try {
      const hash = computeHash(filePath);
      injected++;
      console.log(`[SRI] <script> ${src} → sha384-${hash.slice(0, 8)}...`);
      return `<script${before} src="${src}" integrity="sha384-${hash}" crossorigin="anonymous"${after}>`;
    } catch (err) {
      failed++;
      console.warn(`[SRI] Failed to hash ${src}:`, err.message);
      return match;
    }
  },
);

// Process <link rel="stylesheet" href="..."> tags
html = html.replace(
  /<link([^>]*)\s+href="([^"]+)"([^>]*)\/?>/g,
  (match, before, href, after) => {
    if (match.includes('integrity=')) return match; // Already has SRI
    if (!match.includes('stylesheet')) return match; // Only stylesheet links
    const filePath = resolvePath(href);
    if (!filePath) return match;
    try {
      const hash = computeHash(filePath);
      injected++;
      console.log(`[SRI] <link> ${href} → sha384-${hash.slice(0, 8)}...`);
      return `<link${before} href="${href}" integrity="sha384-${hash}" crossorigin="anonymous"${after}/>`;
    } catch (err) {
      failed++;
      console.warn(`[SRI] Failed to hash ${href}:`, err.message);
      return match;
    }
  },
);

fs.writeFileSync(INDEX_HTML, html);
console.log(`[SRI] Done: ${injected} tags hashed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}

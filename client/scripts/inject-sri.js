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

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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
 * Handles both relative paths (/assets/foo.js) and absolute URLs
 * that point to local assets (https://chat.kyere.me/assets/foo.js).
 * Returns null if it's a truly external URL that can't be resolved locally.
 */
function resolvePath(src) {
  if (!src) return null;

  let relative = src;

  // Strip known absolute base URLs (Vite may embed them in production builds)
  const knownBases = [
    /^https?:\/\/[^/]+\//,  // any origin — strip to get the path
  ];
  for (const re of knownBases) {
    const match = src.match(re);
    if (match) {
      relative = src.slice(match[0].length - 1); // keep leading /
      break;
    }
  }

  if (relative.startsWith('//')) return null; // protocol-relative external

  // Strip leading /
  relative = relative.replace(/^\//, '');
  const absolute = path.join(DIST_DIR, relative);
  return fs.existsSync(absolute) ? absolute : null;
}

// Process <script src="..."> tags (handles any attribute order, including Vite's
// `<script type="module" crossorigin src="...">` pattern)
html = html.replace(
  /<script([^>]*?)\bsrc="([^"]+)"([^>]*)>/g,
  (match, before, src, after) => {
    if (match.includes('integrity=')) return match; // Already has SRI
    const filePath = resolvePath(src);
    if (!filePath) return match;
    try {
      const hash = computeHash(filePath);
      injected++;
      console.log(`[SRI] <script> ${path.basename(src)} → sha384-${hash.slice(0, 8)}...`);
      // Remove any existing crossorigin attr from before/after to avoid duplicates
      const cleanBefore = before.replace(/\s*crossorigin(?:="[^"]*")?/g, '');
      const cleanAfter = after.replace(/\s*crossorigin(?:="[^"]*")?/g, '');
      return `<script${cleanBefore} src="${src}" integrity="sha384-${hash}" crossorigin="anonymous"${cleanAfter}>`;
    } catch (err) {
      failed++;
      console.warn(`[SRI] Failed to hash ${src}:`, err.message);
      return match;
    }
  },
);

// Process <link rel="stylesheet" href="..."> and <link rel="modulepreload" href="..."> tags
html = html.replace(
  /<link([^>]*?)\bhref="([^"]+)"([^>]*?)\/?>/g,
  (match, before, href, after) => {
    if (match.includes('integrity=')) return match; // Already has SRI
    const isStylesheet = match.includes('stylesheet');
    const isModulePreload = match.includes('modulepreload');
    if (!isStylesheet && !isModulePreload) return match;
    const filePath = resolvePath(href);
    if (!filePath) return match;
    try {
      const hash = computeHash(filePath);
      injected++;
      console.log(`[SRI] <link> ${path.basename(href)} → sha384-${hash.slice(0, 8)}...`);
      const cleanBefore = before.replace(/\s*crossorigin(?:="[^"]*")?/g, '');
      const cleanAfter = after.replace(/\s*crossorigin(?:="[^"]*")?/g, '');
      return `<link${cleanBefore} href="${href}" integrity="sha384-${hash}" crossorigin="anonymous"${cleanAfter}/>`;
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

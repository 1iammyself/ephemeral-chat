/**
 * Centralized URL resolution for the Ephemeral Chat client.
 *
 * Single source of truth — every module that needs the backend URL imports
 * from here instead of re-implementing env-check logic.
 *
 * Resolution order:
 *   1. VITE_API_URL env var (explicit override)
 *   2. Production build → '' (same-origin, no CORS)
 *   3. Dev build → 'http://localhost:3001'
 */

let _cached = null;

/**
 * Resolve the backend base URL.
 * @returns {string} Base URL (empty string means same-origin)
 */
export function resolveBaseUrl() {
  if (_cached !== null) return _cached;

  if (import.meta.env.VITE_API_URL) {
    _cached = import.meta.env.VITE_API_URL.replace(/\/$/, '');
  } else if (import.meta.env.PROD) {
    _cached = ''; // same-origin — no CORS preflight needed
  } else {
    _cached = 'http://localhost:3001';
  }

  return _cached;
}

/** Pre-resolved constant for the common case. */
export const API_BASE = resolveBaseUrl();

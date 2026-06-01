/**
 * Shared helpers for the crypto test suite. Not a test file itself
 * (no `.test.` in the name), so the node:test runner ignores it.
 */

/** Uint8Array/ArrayBuffer → lowercase hex string. */
export function toHex(bytes) {
  return [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** hex string → Uint8Array. */
export function fromHex(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Flip one byte inside a base64 (standard alphabet) payload. */
export function tamperBase64(b64) {
  const bin = atob(b64);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  a[0] ^= 0xff;
  let out = '';
  for (let i = 0; i < a.length; i++) out += String.fromCharCode(a[i]);
  return btoa(out);
}

/** Byte-wise equality for Uint8Array/ArrayBuffer. */
export function bytesEqual(a, b) {
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}

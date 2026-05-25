import initSecureMemory, { secure_alloc, secure_write, secure_zero_and_free }
  from './pkg/secure-memory/secure_memory.js';

let _wasmReady = false;
initSecureMemory().then(() => { _wasmReady = true; }).catch(() => {});

/**
 * Securely zero a Uint8Array.
 *
 * Copies the live buffer into WASM linear memory and calls secure_zero_and_free,
 * which uses Rust's zeroize (volatile writes) — the JS JIT cannot optimise them away.
 * Always falls through to fill(0) as a belt-and-suspenders JS-layer zero.
 *
 * Safe to call before WASM initialises; fill(0) still runs in that case.
 *
 * @param {Uint8Array} buf - key material to destroy
 */
export function secureZero(buf) {
  if (!(buf instanceof Uint8Array) || buf.length === 0) return;
  if (_wasmReady) {
    try {
      const ptr = secure_alloc(buf.length);
      secure_write(ptr, buf.length, buf);  // copy live key bytes into WASM memory
      secure_zero_and_free(ptr, buf.length); // volatile zero + free
    } catch (_) {}
  }
  buf.fill(0); // JS-layer zero (always)
}

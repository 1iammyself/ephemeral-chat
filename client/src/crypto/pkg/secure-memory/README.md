# secure-memory WASM module

Provides memory-safe key zeroing using Rust's `zeroize` crate.

## Build

Requires: Rust + wasm-pack

```sh
# Install wasm-pack (once)
cargo install wasm-pack

# Build the module
cd client/src/crypto/secure-memory
wasm-pack build --target web --out-dir ../pkg/secure-memory --release
```

The built output goes to `client/src/crypto/pkg/secure-memory/`.

## Why

JavaScript's `fill(0)` is best-effort — V8's GC can copy buffers before zeroing.
This module stores key material in WASM linear memory, outside V8's heap.
`zeroize` uses volatile writes that the Rust/LLVM compiler cannot optimize away.

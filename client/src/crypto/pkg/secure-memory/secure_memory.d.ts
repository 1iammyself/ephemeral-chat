/* tslint:disable */
/* eslint-disable */

/**
 * Allocate a buffer in WASM linear memory.
 * Returns the pointer (as u32) and length.
 * JS must call `secure_free` when done.
 */
export function secure_alloc(len: number): number;

/**
 * Read bytes from WASM linear memory into a new JS Uint8Array.
 */
export function secure_read(ptr: number, len: number): Uint8Array;

/**
 * Write bytes from a JS Uint8Array into WASM linear memory at ptr.
 * Returns false if src.len() != len (size mismatch).
 */
export function secure_write(ptr: number, len: number, src: Uint8Array): boolean;

/**
 * Securely zero `len` bytes starting at `ptr` (WASM linear memory address),
 * then free the allocation.
 * Uses volatile writes via zeroize — cannot be optimised away by compiler.
 */
export function secure_zero_and_free(ptr: number, len: number): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly secure_alloc: (a: number) => number;
    readonly secure_read: (a: number, b: number) => [number, number];
    readonly secure_write: (a: number, b: number, c: number, d: number) => number;
    readonly secure_zero_and_free: (a: number, b: number) => void;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;

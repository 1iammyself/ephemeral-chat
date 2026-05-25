/* tslint:disable */
/* eslint-disable */
export const memory: WebAssembly.Memory;
export const secure_alloc: (a: number) => number;
export const secure_read: (a: number, b: number) => [number, number];
export const secure_write: (a: number, b: number, c: number, d: number) => number;
export const secure_zero_and_free: (a: number, b: number) => void;
export const __wbindgen_externrefs: WebAssembly.Table;
export const __wbindgen_free: (a: number, b: number, c: number) => void;
export const __wbindgen_malloc: (a: number, b: number) => number;
export const __wbindgen_start: () => void;

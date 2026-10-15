/**
 * Decompresses and compiles CPython's WebAssembly module, once per thread:
 * later calls in the same thread return the same promise. Pass the module to
 * `new Bash({ python: { wasmModule } })` in other threads, through
 * `workerData` or `postMessage`, so they skip the compile.
 */
export function loadPythonModule(): Promise<WebAssembly.Module>;

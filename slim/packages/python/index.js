// CPython's WebAssembly module, decompressed and compiled once per thread.
// Core calls loadPythonModule() before each python3 run and hands the module
// to that run's worker.

import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { brotliDecompress } from "node:zlib";

const decompress = promisify(brotliDecompress);
const compressedWasm = new URL(
  "./vendor/cpython-emscripten/python.wasm.br",
  import.meta.url,
);

let loading;

export function loadPythonModule() {
  if (loading === undefined) {
    const attempt = readFile(compressedWasm)
      .then((compressed) => decompress(compressed))
      .then((wasm) => WebAssembly.compile(wasm));
    // A failed load is retried by the next call.
    attempt.catch(() => {
      if (loading === attempt) loading = undefined;
    });
    loading = attempt;
  }
  return loading;
}

/**
 * The compiled CPython module python3 hands to its workers. Kept apart from
 * python3.ts so that `Bash` can set it while constructing without loading
 * the command.
 */

import { sharedCpythonModule } from "../../addons.js";

let providedModule: WebAssembly.Module | undefined;

/**
 * Makes every later python3 run in this thread instantiate `module` instead
 * of compiling `python.wasm`. Set from the `python.wasmModule` option.
 */
export function provideCpythonModule(module: WebAssembly.Module): void {
  if (!(module instanceof WebAssembly.Module)) {
    throw new TypeError("python.wasmModule must be a WebAssembly.Module");
  }
  providedModule = module;
}

/**
 * The module for the next python3 worker, or `null` to let the worker
 * compile `python.wasm` itself.
 */
export function cpythonModule(): Promise<WebAssembly.Module> | null {
  return providedModule === undefined
    ? sharedCpythonModule()
    : Promise.resolve(providedModule);
}

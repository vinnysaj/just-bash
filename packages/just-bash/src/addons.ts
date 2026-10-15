/**
 * Seam for optional add-on packages.
 *
 * This package ships every command and codec itself, so nothing here is ever
 * missing. The slim repackaging in `slim/` replaces this module at build time
 * with one that loads python3, js-exec, sqlite3, html-to-markdown, the network
 * transport, and the xz/zstd codecs from separately installed packages. Keep
 * the exported signatures in sync with `slim/core/addons.ts`.
 */

/** Bash options whose commands or transport live in an add-on package. */
export type AddonFeature = "python" | "javascript" | "network";

/** Commands that run in a worker shipped by an add-on package. */
export type AddonWorkerCommand = "python3" | "sqlite3";

/** Tar codecs backed by native modules. */
export type NativeCodec = "xz" | "zstd";

/**
 * Throws when the package that provides `feature` is not installed. Called
 * while constructing `Bash`, so a missing add-on fails before any script runs.
 */
export function requireAddon(_feature: AddonFeature): void {}

/**
 * Name of the package a built-in command needs but cannot find, or `null`
 * when the command can run.
 */
export function missingAddonForCommand(_command: string): string | null {
  return null;
}

/**
 * Path of the worker script that an add-on ships for `command`, or `null` to
 * use the worker bundled next to the command.
 */
export function addonWorkerPath(_command: AddonWorkerCommand): string | null {
  return null;
}

/**
 * CPython compiled once and shared by every python3 worker in this process,
 * or `null` to let each worker compile `python.wasm` itself.
 */
export function sharedCpythonModule(): Promise<WebAssembly.Module> | null {
  return null;
}

/** Error message for a tar codec whose native module failed to load. */
export function codecUnavailableMessage(codec: NativeCodec): string {
  return codec === "xz"
    ? "xz compression requires node-liblzma which failed to load. " +
        "Install liblzma-dev (apt) or xz (brew) and reinstall dependencies."
    : "zstd compression requires @mongodb-js/zstd which is not installed. " +
        "Install it with: npm install @mongodb-js/zstd";
}

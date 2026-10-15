/**
 * Add-on resolution for the slim core. Replaces
 * `packages/just-bash/src/addons.ts` at build time; the exported signatures
 * must stay identical to that module's.
 *
 * Add-ons are found by package name from core's own location, which is where
 * npm installs them. Each must carry exactly core's version, because core
 * hands their workers a protocol that only matches within one release.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import type {
  AddonFeature,
  AddonWorkerCommand,
  NativeCodec,
} from "../../packages/just-bash/src/addons.js";
import { DefenseInDepthBox } from "../../packages/just-bash/src/security/defense-in-depth-box.js";

declare const __SLIM_VERSION__: string;
/** Module URL add-ons resolve from. Only the test configs define it. */
declare const __SLIM_ADDON_BASE__: string | undefined;

type Addon = "python" | "js" | "sqlite" | "net" | "html" | "archive";

const FEATURE_ADDONS: ReadonlyMap<AddonFeature, Addon> = new Map([
  ["python", "python"],
  ["javascript", "js"],
  ["network", "net"],
]);

const COMMAND_ADDONS: ReadonlyMap<string, Addon> = new Map([
  ["python3", "python"],
  ["python", "python"],
  ["js-exec", "js"],
  ["node", "js"],
  ["sqlite3", "sqlite"],
  ["html-to-markdown", "html"],
]);

const WORKERS: ReadonlyMap<AddonWorkerCommand, [Addon, string]> = new Map([
  ["python3", ["python", "dist/commands/python3/worker.js"]],
  ["sqlite3", ["sqlite", "worker.js"]],
]);

/** Entry of the python add-on, slim/packages/python/index.js. */
interface PythonAddon {
  loadPythonModule(): Promise<WebAssembly.Module>;
}

const addonDirectories = new Map<Addon, string | null>();

function packageName(addon: Addon): string {
  return `@vinnysaj/just-bash-${addon}`;
}

function installHint(addon: Addon): string {
  return `Install it with: npm install ${packageName(addon)}@${__SLIM_VERSION__}`;
}

/** Directory of the installed add-on package, or `null` when it is absent. */
function addonDirectory(addon: Addon): string | null {
  const cached = addonDirectories.get(addon);
  if (cached !== undefined) return cached;
  // Resolution goes through Module._resolveFilename, which defense-in-depth
  // blocks while a script runs.
  const directory = DefenseInDepthBox.runTrusted(() => locate(addon));
  addonDirectories.set(addon, directory);
  return directory;
}

function locate(addon: Addon): string | null {
  const require = createRequire(__SLIM_ADDON_BASE__ ?? import.meta.url);
  let manifestPath: string;
  try {
    manifestPath = require.resolve(`${packageName(addon)}/package.json`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "MODULE_NOT_FOUND") {
      return null;
    }
    throw error;
  }
  const { version } = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    version: string;
  };
  if (version !== __SLIM_VERSION__) {
    throw new Error(
      `${packageName(addon)}@${version} does not match @vinnysaj/just-bash@${__SLIM_VERSION__}. ${installHint(addon)}`,
    );
  }
  return dirname(manifestPath);
}

export function requireAddon(feature: AddonFeature): void {
  const addon = FEATURE_ADDONS.get(feature);
  if (addon === undefined) {
    throw new Error(`Unknown add-on feature: ${feature}`);
  }
  if (addonDirectory(addon) === null) {
    throw new Error(
      `The ${feature} option requires ${packageName(addon)}, which is not installed. ${installHint(addon)}`,
    );
  }
}

export function missingAddonForCommand(command: string): string | null {
  const addon = COMMAND_ADDONS.get(command);
  if (addon === undefined || addonDirectory(addon) !== null) return null;
  return packageName(addon);
}

/** Directory of an add-on that `command` cannot run without. */
function requiredAddonDirectory(addon: Addon, command: string): string {
  const directory = addonDirectory(addon);
  if (directory === null) {
    throw new Error(
      `${command} requires ${packageName(addon)}, which is not installed. ${installHint(addon)}`,
    );
  }
  return directory;
}

export function addonWorkerPath(command: AddonWorkerCommand): string | null {
  const worker = WORKERS.get(command);
  if (worker === undefined) {
    throw new Error(`No add-on worker for ${command}`);
  }
  const [addon, file] = worker;
  return join(requiredAddonDirectory(addon, command), file);
}

export function sharedCpythonModule(): Promise<WebAssembly.Module> | null {
  const entry = pathToFileURL(
    join(requiredAddonDirectory("python", "python3"), "index.js"),
  ).href;
  // The add-on compiles CPython once per thread. WebAssembly is blocked while
  // a script runs.
  return DefenseInDepthBox.runTrustedAsync(async () => {
    const { loadPythonModule } = (await import(entry)) as PythonAddon;
    return loadPythonModule();
  });
}

export function codecUnavailableMessage(codec: NativeCodec): string {
  if (addonDirectory("archive") === null) {
    return `${codec} compression requires ${packageName("archive")}, which is not installed. ${installHint("archive")}`;
  }
  return codec === "xz"
    ? "xz compression requires node-liblzma which failed to load. " +
        "Install liblzma-dev (apt) or xz (brew) and reinstall dependencies."
    : "zstd compression requires @mongodb-js/zstd which failed to load. " +
        `Reinstall ${packageName("archive")} so its optional dependencies build.`;
}

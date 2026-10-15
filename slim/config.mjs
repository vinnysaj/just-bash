// Package definitions and module aliases shared by the build, the test
// configs, and the release scripts.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SLIM_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_DIR = resolve(SLIM_DIR, "..");
export const UPSTREAM_DIR = join(REPO_DIR, "packages/just-bash");
export const UPSTREAM_SRC = join(UPSTREAM_DIR, "src");

/** Build output: one directory per package, laid out the way npm installs them. */
export const OUT_DIR = join(SLIM_DIR, "dist/node_modules");

/** Written by the build: package name → versions of the packages it bundles. */
export const BUNDLED_VERSIONS = join(SLIM_DIR, "dist/bundled-versions.json");

export const SCOPE = "@vinnysaj";
export const CORE_NAME = `${SCOPE}/just-bash`;
export const REPOSITORY_URL = "git+https://github.com/vinnysaj/just-bash.git";

const slimManifest = JSON.parse(
  readFileSync(join(SLIM_DIR, "package.json"), "utf8"),
);

/** Version shared by every published package. */
export const VERSION = slimManifest.version;

/**
 * Range of a library an add-on ships. slim/package.json lists everything the
 * packages ship as dependencies (the native codecs as optionalDependencies,
 * as upstream lists them) and the build tooling as devDependencies.
 */
function dependencyRange(name) {
  const range =
    slimManifest.dependencies[name] ?? slimManifest.optionalDependencies[name];
  if (!range) throw new Error(`slim/package.json is missing ${name}`);
  return range;
}

/**
 * Add-on packages. `aliases` maps each third-party specifier that upstream
 * imports to the add-on module that replaces it in the slim core.
 */
export const ADDONS = [
  {
    id: "python",
    description:
      "python3 and python commands for @vinnysaj/just-bash (CPython 3.13 compiled to WebAssembly)",
    aliases: {},
  },
  {
    id: "js",
    description:
      "js-exec and node commands for @vinnysaj/just-bash (QuickJS-backed JavaScript and TypeScript runtime)",
    aliases: { run: "" },
  },
  {
    id: "sqlite",
    description:
      "sqlite3 command for @vinnysaj/just-bash (SQLite compiled to WebAssembly)",
    aliases: { "sql.js": "" },
  },
  {
    id: "net",
    description:
      "Network transport for @vinnysaj/just-bash's network option (curl through guarded-fetch)",
    aliases: { "guarded-fetch": "" },
    dependencies: { "guarded-fetch": dependencyRange("guarded-fetch") },
  },
  {
    id: "html",
    description: "html-to-markdown command for @vinnysaj/just-bash (turndown)",
    aliases: { turndown: "" },
  },
  {
    id: "archive",
    description:
      "xz and zstd codecs for @vinnysaj/just-bash's tar command (native modules)",
    aliases: { "node-liblzma": "/xz", "@mongodb-js/zstd": "/zstd" },
    optionalDependencies: {
      "node-liblzma": dependencyRange("node-liblzma"),
      "@mongodb-js/zstd": dependencyRange("@mongodb-js/zstd"),
    },
  },
];

export function addonPackageName(id) {
  return `${CORE_NAME}-${id}`;
}

/** Specifier → add-on module specifier, e.g. `sql.js` → `@vinnysaj/just-bash-sqlite`. */
export const ADDON_ALIASES = Object.fromEntries(
  ADDONS.flatMap((addon) =>
    Object.entries(addon.aliases).map(([specifier, subpath]) => [
      specifier,
      `${addonPackageName(addon.id)}${subpath}`,
    ]),
  ),
);

/** The upstream seam module and the slim implementation that replaces it. */
export const UPSTREAM_ADDONS_MODULE = join(UPSTREAM_SRC, "addons.ts");
export const SLIM_ADDONS_MODULE = join(SLIM_DIR, "core/addons.ts");

/** Records the upstream release merged into this tree; written by scripts/sync-upstream.mjs. */
export const UPSTREAM_FILE = join(SLIM_DIR, "upstream.json");

/** The upstream release this tree is based on. */
export function upstreamBase() {
  const base = JSON.parse(readFileSync(UPSTREAM_FILE, "utf8"));
  const upstreamManifest = JSON.parse(
    readFileSync(join(UPSTREAM_DIR, "package.json"), "utf8"),
  );
  if (upstreamManifest.version !== base.version) {
    throw new Error(
      `packages/just-bash/package.json is ${upstreamManifest.version} but slim/upstream.json records just-bash@${base.version}`,
    );
  }
  return base;
}

/**
 * The npm dist-tag a version publishes under. A release has the version of
 * the upstream release it is built from (latest); its pre-releases are
 * <version>-rc.N (next); a fork-only fix between upstream releases is
 * <upstream patch + 1>-slim.N (latest), which sorts after the upstream
 * version and before upstream's next patch.
 */
export function distTag(version, upstreamVersion) {
  const [major, minor, patch] = upstreamVersion.split(".").map(Number);
  const nextPatch = `${major}.${minor}.${patch + 1}`;
  const dash = version.indexOf("-");
  const release = dash === -1 ? version : version.slice(0, dash);
  const prerelease = dash === -1 ? null : version.slice(dash + 1);
  if (version === upstreamVersion) return "latest";
  if (release === upstreamVersion && /^rc\.\d+$/.test(prerelease))
    return "next";
  if (release === nextPatch && /^slim\.\d+$/.test(prerelease)) return "latest";
  throw new Error(
    `Version ${version} must be ${upstreamVersion} (the upstream release), ${upstreamVersion}-rc.N, or ${nextPatch}-slim.N`,
  );
}

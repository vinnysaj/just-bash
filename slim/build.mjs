// Builds every @vinnysaj/just-bash package into slim/dist/node_modules, laid
// out the way npm installs them, so the tests can resolve add-ons from core
// exactly as an installed app does.

import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { brotliCompressSync, constants as zlibConstants } from "node:zlib";
import * as esbuild from "esbuild";
import { rollup } from "rollup";
import { dts } from "rollup-plugin-dts";
import {
  ADDON_ALIASES,
  ADDONS,
  addonPackageName,
  CORE_NAME,
  OUT_DIR,
  REPO_DIR,
  REPOSITORY_URL,
  SLIM_ADDONS_MODULE,
  SLIM_DIR,
  UPSTREAM_ADDONS_MODULE,
  UPSTREAM_DIR,
  UPSTREAM_SRC,
  upstreamBase,
  VERSION,
} from "./config.mjs";
import { collectLicenses } from "./scripts/licenses.mjs";

const NODE_ENGINES = "^22.13.0 || >=23.2.0";
const SLIM_DIST = dirname(OUT_DIR);
const TYPES_DIR = join(SLIM_DIST, "types");
const UPSTREAM = upstreamBase();

// Bundled CommonJS dependencies call require() for Node builtins.
const REQUIRE_BANNER =
  'import{createRequire}from"node:module";const require=createRequire(import.meta.url);';

const bundleDefaults = {
  // Metafile paths are relative to this directory.
  absWorkingDir: REPO_DIR,
  bundle: true,
  platform: "node",
  format: "esm",
  minify: true,
  keepNames: true,
  legalComments: "none",
  metafile: true,
  logLevel: "warning",
};

function packageDir(id) {
  return join(OUT_DIR, id === "core" ? CORE_NAME : addonPackageName(id));
}

/** Replaces upstream's add-on seam and points heavy imports at add-ons. */
const slimCorePlugin = {
  name: "slim-core",
  setup(build) {
    // Bare specifiers only; the callback picks out the aliased ones.
    build.onResolve({ filter: /^[^./]/ }, (args) =>
      Object.hasOwn(ADDON_ALIASES, args.path)
        ? { path: ADDON_ALIASES[args.path], external: true }
        : undefined,
    );
    build.onResolve({ filter: /(^|\/)addons\.js$/ }, (args) => {
      const target = resolve(args.resolveDir, args.path).replace(
        /\.js$/,
        ".ts",
      );
      return target === UPSTREAM_ADDONS_MODULE
        ? { path: SLIM_ADDONS_MODULE }
        : undefined;
    });
  },
};

/** Loads sql.js from the copy of its Node build next to the worker. */
const localSqlJsPlugin = {
  name: "local-sql-js",
  setup(build) {
    build.onResolve({ filter: /^sql\.js$/ }, () => ({
      path: "./sql-wasm.cjs",
      external: true,
    }));
  },
};

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function manifest(id, description, fields) {
  return {
    name: id === "core" ? CORE_NAME : addonPackageName(id),
    version: VERSION,
    description,
    license: "Apache-2.0",
    repository: {
      type: "git",
      url: REPOSITORY_URL,
      directory: id === "core" ? "slim" : `slim/packages/${id}`,
    },
    homepage: "https://github.com/vinnysaj/just-bash#readme",
    bugs: { url: "https://github.com/vinnysaj/just-bash/issues" },
    type: "module",
    engines: { node: NODE_ENGINES },
    ...fields,
    upstream: UPSTREAM,
  };
}

/** Copies the README, license, and notice into a package directory. */
function writeLegal(id, licenses) {
  const dir = packageDir(id);
  const readme =
    id === "core"
      ? join(REPO_DIR, ".github/README.md")
      : join(SLIM_DIR, "packages", id, "README.md");
  copyFileSync(readme, join(dir, "README.md"));
  copyFileSync(join(UPSTREAM_DIR, "LICENSE"), join(dir, "LICENSE"));
  copyFileSync(join(SLIM_DIR, "NOTICE"), join(dir, "NOTICE"));
  if (licenses) writeFileSync(join(dir, "THIRD_PARTY_LICENSES"), licenses);
}

async function buildCore() {
  const dir = packageDir("core");
  const result = await esbuild.build({
    ...bundleDefaults,
    entryPoints: [join(UPSTREAM_SRC, "index.ts")],
    outdir: join(dir, "dist"),
    splitting: true,
    chunkNames: "chunks/[name]-[hash]",
    banner: { js: REQUIRE_BANNER },
    define: {
      __BROWSER__: "false",
      __SLIM_VERSION__: JSON.stringify(VERSION),
      __SLIM_ADDON_BASE__: "undefined",
    },
    plugins: [slimCorePlugin],
  });
  assertBundled(result.metafile, SLIM_ADDONS_MODULE, UPSTREAM_ADDONS_MODULE);

  execFileSync(
    join(UPSTREAM_DIR, "node_modules/.bin/tsc"),
    [
      "-p",
      join(UPSTREAM_DIR, "tsconfig.json"),
      "--emitDeclarationOnly",
      "--outDir",
      TYPES_DIR,
    ],
    { stdio: "inherit" },
  );
  const types = await rollup({
    input: join(TYPES_DIR, "index.d.ts"),
    plugins: [dts({ respectExternal: true })],
    external: (id) => id.startsWith("node:"),
  });
  await types.write({ file: join(dir, "dist/index.d.ts"), format: "es" });
  await types.close();

  const peerDependencies = Object.fromEntries(
    ADDONS.map((addon) => [addonPackageName(addon.id), VERSION]),
  );
  writeJson(
    join(dir, "package.json"),
    manifest(
      "core",
      "A simulated bash environment with a virtual filesystem: a slim, modular repackaging of just-bash",
      {
        exports: {
          ".": { types: "./dist/index.d.ts", default: "./dist/index.js" },
          "./package.json": "./package.json",
        },
        files: ["dist", "NOTICE", "THIRD_PARTY_LICENSES"],
        peerDependencies,
        peerDependenciesMeta: Object.fromEntries(
          Object.keys(peerDependencies).map((name) => [
            name,
            { optional: true },
          ]),
        ),
      },
    ),
  );
  writeLegal("core", collectLicenses(result.metafile));
}

/** Fails the build when the slim seam did not replace the upstream one. */
function assertBundled(metafile, required, forbidden) {
  const inputs = Object.keys(metafile.inputs).map((input) =>
    resolve(REPO_DIR, input),
  );
  if (!inputs.includes(required)) {
    throw new Error(
      `${relative(REPO_DIR, required)} is missing from the bundle`,
    );
  }
  if (inputs.includes(forbidden)) {
    throw new Error(`${relative(REPO_DIR, forbidden)} leaked into the bundle`);
  }
}

async function buildPython() {
  const dir = packageDir("python");
  await esbuild.build({
    ...bundleDefaults,
    entryPoints: [join(UPSTREAM_SRC, "commands/python3/worker.ts")],
    // The worker finds CPython at ../../../vendor relative to itself, the
    // same depth it has in upstream's source and bundle layouts.
    outfile: join(dir, "dist/commands/python3/worker.js"),
    external: ["../../../vendor/cpython-emscripten/*"],
  });
  const upstreamVendor = join(UPSTREAM_DIR, "vendor/cpython-emscripten");
  const vendor = join(dir, "vendor/cpython-emscripten");
  mkdirSync(vendor, { recursive: true });
  for (const file of ["python.cjs", "python313.zip"]) {
    copyFileSync(join(upstreamVendor, file), join(vendor, file));
  }
  // Shipped brotli-compressed; index.js decompresses it.
  const wasm = readFileSync(join(upstreamVendor, "python.wasm"));
  writeFileSync(
    join(vendor, "python.wasm.br"),
    brotliCompressSync(wasm, {
      params: {
        [zlibConstants.BROTLI_PARAM_QUALITY]: zlibConstants.BROTLI_MAX_QUALITY,
        [zlibConstants.BROTLI_PARAM_LGWIN]:
          zlibConstants.BROTLI_MAX_WINDOW_BITS,
        [zlibConstants.BROTLI_PARAM_SIZE_HINT]: wasm.length,
      },
    }),
  );
  for (const file of ["index.js", "index.d.ts"]) {
    copyFileSync(join(SLIM_DIR, "packages/python", file), join(dir, file));
  }
  writeJson(
    join(dir, "package.json"),
    manifest(
      "python",
      ADDONS.find((addon) => addon.id === "python").description,
      {
        exports: {
          ".": { types: "./index.d.ts", default: "./index.js" },
          "./package.json": "./package.json",
        },
        files: [
          "index.js",
          "index.d.ts",
          "dist",
          "vendor",
          "NOTICE",
          "THIRD_PARTY_LICENSES",
        ],
      },
    ),
  );
  writeLegal(
    "python",
    readFileSync(join(SLIM_DIR, "licenses/cpython.txt"), "utf8"),
  );
}

async function buildSqlite() {
  const dir = packageDir("sqlite");
  const sqlJsDir = join(SLIM_DIR, "node_modules/sql.js");
  const worker = await esbuild.build({
    ...bundleDefaults,
    entryPoints: [join(UPSTREAM_SRC, "commands/sqlite3/worker.ts")],
    outfile: join(dir, "worker.js"),
    plugins: [localSqlJsPlugin],
  });
  copyFileSync(join(sqlJsDir, "dist/sql-wasm.js"), join(dir, "sql-wasm.cjs"));
  copyFileSync(
    join(sqlJsDir, "dist/sql-wasm.wasm"),
    join(dir, "sql-wasm.wasm"),
  );
  copyFileSync(
    join(SLIM_DIR, "packages/sqlite/index.js"),
    join(dir, "index.js"),
  );
  writeJson(
    join(dir, "package.json"),
    manifest(
      "sqlite",
      ADDONS.find((addon) => addon.id === "sqlite").description,
      {
        exports: { ".": "./index.js", "./package.json": "./package.json" },
        files: [
          "index.js",
          "worker.js",
          "sql-wasm.cjs",
          "sql-wasm.wasm",
          "NOTICE",
          "THIRD_PARTY_LICENSES",
        ],
      },
    ),
  );
  writeLegal("sqlite", collectLicenses(worker.metafile, [sqlJsDir]));
}

/** Add-ons whose entry is bundled together with the library it wraps. */
async function buildBundledAddon(id) {
  const dir = packageDir(id);
  const result = await esbuild.build({
    ...bundleDefaults,
    entryPoints: [join(SLIM_DIR, "packages", id, "index.js")],
    outfile: join(dir, "index.js"),
    banner: { js: REQUIRE_BANNER },
  });
  writeJson(
    join(dir, "package.json"),
    manifest(id, ADDONS.find((addon) => addon.id === id).description, {
      exports: { ".": "./index.js", "./package.json": "./package.json" },
      files: ["index.js", "NOTICE", "THIRD_PARTY_LICENSES"],
    }),
  );
  writeLegal(id, collectLicenses(result.metafile));
}

/** Add-ons published as thin re-exports of regular npm dependencies. */
function buildDependencyAddon(id, entries) {
  const dir = packageDir(id);
  const addon = ADDONS.find((candidate) => candidate.id === id);
  mkdirSync(dir, { recursive: true });
  for (const entry of Object.values(entries)) {
    copyFileSync(join(SLIM_DIR, "packages", id, entry), join(dir, entry));
  }
  writeJson(
    join(dir, "package.json"),
    manifest(id, addon.description, {
      exports: {
        ...Object.fromEntries(
          Object.entries(entries).map(([subpath, entry]) => [
            subpath,
            `./${entry}`,
          ]),
        ),
        "./package.json": "./package.json",
      },
      files: [...Object.values(entries), "NOTICE"],
      ...(addon.dependencies && { dependencies: addon.dependencies }),
      ...(addon.optionalDependencies && {
        optionalDependencies: addon.optionalDependencies,
      }),
    }),
  );
  writeLegal(id);
}

function buildFull() {
  const dir = packageDir("full");
  mkdirSync(dir, { recursive: true });
  for (const file of ["index.js", "index.d.ts"]) {
    copyFileSync(join(SLIM_DIR, "packages/full", file), join(dir, file));
  }
  writeJson(
    join(dir, "package.json"),
    manifest(
      "full",
      "Every @vinnysaj/just-bash add-on: a drop-in replacement for just-bash",
      {
        exports: {
          ".": { types: "./index.d.ts", default: "./index.js" },
          "./package.json": "./package.json",
        },
        files: ["index.js", "index.d.ts", "NOTICE"],
        dependencies: Object.fromEntries([
          [CORE_NAME, VERSION],
          ...ADDONS.map((addon) => [addonPackageName(addon.id), VERSION]),
        ]),
      },
    ),
  );
  writeLegal("full");
}

rmSync(SLIM_DIST, { recursive: true, force: true });
await buildCore();
await buildPython();
await buildSqlite();
await buildBundledAddon("js");
await buildBundledAddon("html");
buildDependencyAddon("net", { ".": "index.js" });
buildDependencyAddon("archive", { "./xz": "xz.js", "./zstd": "zstd.js" });
buildFull();
rmSync(TYPES_DIR, { recursive: true, force: true });

for (const name of readdirSync(join(OUT_DIR, "@vinnysaj"))) {
  if (!existsSync(join(OUT_DIR, "@vinnysaj", name, "package.json"))) {
    throw new Error(`${name} has no package.json`);
  }
}
console.log(
  `Built ${readdirSync(join(OUT_DIR, "@vinnysaj")).length} packages at ${VERSION} (upstream just-bash@${UPSTREAM.version})`,
);

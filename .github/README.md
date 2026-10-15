# @vinnysaj/just-bash

A slim, modular repackaging of [just-bash](https://github.com/vercel-labs/just-bash), the simulated bash environment with a virtual filesystem. The shell and its pure-JavaScript commands come in one small core package, and the heavy pieces (Python, JavaScript, SQLite, network transport, HTML conversion, native compression codecs) are optional add-ons. Install only what you use. The API and behavior are the same as upstream just-bash.

This is a personal fork, not affiliated with or endorsed by Vercel. just-bash and this repackaging are licensed under [Apache-2.0](https://github.com/vinnysaj/just-bash/blob/slim/packages/just-bash/LICENSE); [NOTICE](https://github.com/vinnysaj/just-bash/blob/slim/slim/NOTICE) lists what was changed.

## Why

Installed size matters in serverless runtimes. Convex counts external packages' installed size toward its 230 MB per-deployment code limit, and AWS Lambda caps an unzipped deployment at 250 MB. just-bash installs everything every user might need: the full sql.js distribution, TypeScript, CPython, a DOM implementation, and several builds of its own code. Here each piece is an opt-in package, and every package bundles its pure-JavaScript dependencies, so npm installs nothing it does not run.

| Install | Size | vs just-bash@3.6.0 |
| --- | ---: | ---: |
| just-bash@3.6.0 (upstream) | 93.37 MiB | 100% |
| core | 2.01 MiB | 2.2% |
| core + python | 7.92 MiB | 8.5% |
| core + js | 2.99 MiB | 3.2% |
| core + sqlite | 2.73 MiB | 2.9% |
| core + net | 3.86 MiB | 4.1% |
| core + html | 2.28 MiB | 2.4% |
| core + archive | 3.52 MiB | 3.8% |
| core + python + js | 8.89 MiB | 9.5% |
| core + python + js + sqlite | 9.61 MiB | 10.3% |
| full | 13.24 MiB | 14.2% |

Measured with `npm install --os=linux --cpu=arm64 --libc=glibc --ignore-scripts` into an empty directory, summing every file under node_modules and following symlinks, the way Convex counts them. Install scripts add the native zstd and xz builds to the archive add-on and to upstream. [`slim/scripts/size-report.mjs`](https://github.com/vinnysaj/just-bash/blob/slim/slim/scripts/size-report.mjs) produces this table.

## Packages

| Package | Adds | Size |
| --- | --- | ---: |
| `@vinnysaj/just-bash` | The shell, its builtins, and every pure-JavaScript command: text tools (grep, sed, awk, sort, cut, ...), jq, yq, xan, diff, file, gzip, bzip2, tar, curl (with the `fetch` option), and more. No dependencies. | 2.0 MiB |
| `@vinnysaj/just-bash-python` | `python3` and `python` (the `python` option): CPython 3.13 compiled to WebAssembly, with its standard library | 5.9 MiB |
| `@vinnysaj/just-bash-js` | `js-exec` and `node` (the `javascript` option): a QuickJS sandbox for JavaScript and TypeScript | 1.0 MiB |
| `@vinnysaj/just-bash-sqlite` | `sqlite3`: SQLite compiled to WebAssembly | 0.7 MiB |
| `@vinnysaj/just-bash-net` | The transport behind the `network` option ([guarded-fetch](https://www.npmjs.com/package/guarded-fetch)) | 1.9 MiB |
| `@vinnysaj/just-bash-html` | `html-to-markdown` ([turndown](https://www.npmjs.com/package/turndown)) | 0.3 MiB |
| `@vinnysaj/just-bash-archive` | xz (`tar -J`) and zstd (`tar --zstd`) through native modules | 1.5 MiB |
| `@vinnysaj/just-bash-full` | Core and every add-on, re-exporting core: a drop-in replacement for just-bash | |

Every package has the version of the just-bash release it is built from: `@vinnysaj/just-bash@3.6.0` is just-bash@3.6.0. Core declares each add-on as an optional peer dependency at exactly its own version, so npm reports a mismatched add-on at install time, and core checks the version again when it loads one.

```sh
# Core only
npm install @vinnysaj/just-bash

# Core and Python
npm install @vinnysaj/just-bash @vinnysaj/just-bash-python

# Everything, installed under the name just-bash: existing imports
# from "just-bash" keep working unchanged
npm install just-bash@npm:@vinnysaj/just-bash-full
```

```ts
import { Bash } from "@vinnysaj/just-bash";

const bash = new Bash({ python: true });
const result = await bash.exec("python3 -c 'print(6 * 7)'");
console.log(result.stdout); // "42\n"
```

## API

The API is upstream's: every export, option, type, and behavior has the same name and meaning, so [upstream's documentation](https://github.com/vercel-labs/just-bash/blob/main/packages/just-bash/README.md) applies. The runtime exports and the bundled type declarations are checked against the matching upstream release. These are the differences:

- **Missing add-ons.** An option whose add-on is not installed throws while constructing `Bash`, with a message that names the package to install: `python: true` needs `-python`, `javascript` (or `javascript.invokeTool`) needs `-js`, and `network` needs `-net`. A command whose add-on is missing exits with status 127 and prints `<command>: requires <package>` on stderr: `sqlite3` needs `-sqlite`, and `html-to-markdown` needs `-html`. `tar -J` and `tar --zstd` without `-archive` fail with an error naming that package. Commands that upstream registers only for an option, such as `curl` without `network` or `fetch`, are still not registered: they are "command not found", as upstream.
- **ESM only.** There is no CommonJS build. `require("@vinnysaj/just-bash")` still works on every supported Node version through Node's `require(esm)`. TypeScript projects that compile to CommonJS need `"module": "nodenext"` and TypeScript 5.8 or later.
- **Node.js 22.13 or later** (`^22.13.0 || >=23.2.0`; upstream supports 20.19). Node 20 reached end of life in April 2026. These are the first versions with `module.stripTypeScriptTypes`, which js-exec uses to strip TypeScript, so the `typescript` package, which upstream lists as a dependency and only loads on older Node, is gone.
- **Node.js only.** The browser build (`just-bash/browser`) and the `just-bash` and `just-bash-shell` CLIs are not published. Use upstream just-bash for those.
- **guarded-fetch 0.1.5** (upstream pins 0.1.3), which brings undici 7.30.0. undici 7.29.0, which 0.1.3 pins, is affected by advisories fixed in 7.29.1. 0.1.5 also narrows guarded-fetch's own host matching to exact names, which just-bash cannot observe: its allow-list already requires an exact origin.
- **Dependency versions are fixed per release.** Upstream lists its dependencies as semver ranges, so a fresh install of just-bash picks up their newest releases. Here they are bundled at the versions in upstream's lockfile for the release, the versions upstream's CI tested. For example, just-bash@3.6.0 installed today gets sql.js 1.15.0 (SQLite 3.54.0), while @vinnysaj/just-bash@3.6.0 bundles sql.js 1.14.1 (SQLite 3.49.1), so `sqlite3 --version` differs. A weekly audit of the shipped dependencies flags security advisories between releases.
- **Python startup.** CPython ships brotli-compressed. The first python3 run in a thread decompresses and compiles it while the worker starts, which takes about as long as upstream's first run. Every later run in that thread reuses the compiled module and takes about 40% less time than upstream's. The compiled module stays in memory for the life of the thread. Nothing needs configuring; hosts that start a new thread for each task can compile CPython once instead, as [Python](#python) describes. The standard library is unchanged: upstream's archive already leaves out the test suites, tkinter, idlelib, ensurepip, venv, and lib2to3.
- **Additions.** The `python` option also accepts `{ wasmModule }` (type `PythonConfig`), and the python add-on exports `loadPythonModule()`; see [Python](#python). Upstream has neither.

## Python

With `python: true`, each thread that runs `Bash` compiles CPython on its first python3 run and reuses it after that, so a host that keeps its threads needs nothing more. A host that starts a new worker thread for each task pays the compile in every one of them. It can compile once on the main thread with `loadPythonModule()` and pass the module to each worker, which hands it to `Bash` as `python: { wasmModule }`:

```ts
// Main thread, once per process
import { Worker } from "node:worker_threads";
import { loadPythonModule } from "@vinnysaj/just-bash-python";

const wasmModule = await loadPythonModule();
const worker = new Worker(new URL("./task.js", import.meta.url), {
  workerData: { wasmModule },
});
```

```ts
// task.js, in each worker
import { workerData } from "node:worker_threads";
import { Bash } from "@vinnysaj/just-bash";

const bash = new Bash({ python: { wasmModule: workerData.wasmModule } });
```

`loadPythonModule()` decompresses and compiles CPython once per thread and returns the same promise to every later call. A `WebAssembly.Module` passes to other threads of the same process through `workerData` or `postMessage`, including `eval: true` workers, without being copied or compiled again. `python: { wasmModule }` enables python3 like `python: true`, and from then on every python3 run in that thread uses the given module. A value that is not a `WebAssembly.Module` throws a `TypeError` while constructing `Bash`.

## Convex

Convex bundles imported code but installs the packages listed in `externalPackages` with npm. It installs a package that your code imports by name, and it installs an optional peer dependency of such a package only when that peer is also listed in `externalPackages` and in package.json. Core loads add-ons by package name at run time, so list core and each add-on you use in both places, at the same version:

```json
{
  "node": {
    "externalPackages": [
      "@vinnysaj/just-bash",
      "@vinnysaj/just-bash-python",
      "@vinnysaj/just-bash-js"
    ]
  }
}
```

```json
{
  "dependencies": {
    "@vinnysaj/just-bash": "3.6.0",
    "@vinnysaj/just-bash-python": "3.6.0",
    "@vinnysaj/just-bash-js": "3.6.0"
  }
}
```

## Security

just-bash's sandbox model is unchanged; see upstream's [threat model](https://github.com/vinnysaj/just-bash/blob/slim/THREAT_MODEL.md). Network access exists only through the `network` option, which needs the net add-on, or through a `fetch` function you pass in yourself. The net add-on depends on guarded-fetch 0.1.5 (undici 7.30.0) as a regular dependency, so guarded-fetch patch releases reach you without a new release here. Core finds add-ons only by their fixed package names, resolved from its own install location, and refuses any whose version differs from its own.

Report a vulnerability in the shell, a command, or the sandbox to upstream as its security policy describes. Report one in the packaging or the add-on loading here.

## Versions

Each release has the version of the just-bash release it is built from, and every package.json records that release (`"upstream": { "package", "version", "commit" }`). Two other kinds of version can appear: `<version>-rc.N` is a pre-release, published under the `next` tag; and a fix made here between upstream releases is `<next patch>-slim.N`, such as 3.6.1-slim.1, which sorts after 3.6.0 and before upstream's 3.6.1, and which upstream's next release supersedes. The [changelog](https://github.com/vinnysaj/just-bash/blob/slim/slim/CHANGELOG.md) lists each release.

Releases follow upstream on their own. Every day a workflow checks for a new just-bash release that has been on npm for three days. It merges the release (merges, never rebases), then runs the test suites upstream's own CI runs (unit, WASM, and comparison) against core with every add-on and against core alone; a differential test that runs the same scripts through the upstream release from npm and through these packages and compares stdout, stderr, and exit codes; and smoke tests of an app-style setup and of the drop-in install, on Linux x64 and arm64 with Node 22.13 and 24. When everything passes and no package grew unexpectedly, it publishes every package from GitHub Actions through npm trusted publishing, with provenance. A merge conflict or a failure stops the release and opens an issue in this repository.

If a problem also happens with upstream just-bash, report it [upstream](https://github.com/vercel-labs/just-bash/issues). Report problems with packaging, add-ons, sizes, or a difference from upstream [here](https://github.com/vinnysaj/just-bash/issues).

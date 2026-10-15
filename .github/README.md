# @vinnysaj/just-bash

A slim, modular repackaging of [just-bash](https://github.com/vercel-labs/just-bash), the simulated bash environment with a virtual filesystem. The shell and its pure-JavaScript commands come in one small core package, and the heavy pieces (Python, JavaScript, SQLite, network transport, HTML conversion, native compression codecs) are optional add-ons. Install only what you use. The API and behavior are the same as upstream just-bash.

This is a personal fork, not affiliated with or endorsed by Vercel. just-bash and this repackaging are licensed under [Apache-2.0](https://github.com/vinnysaj/just-bash/blob/slim/packages/just-bash/LICENSE); [NOTICE](https://github.com/vinnysaj/just-bash/blob/slim/slim/NOTICE) lists what was changed.

## Why

Installed size matters in serverless runtimes. Convex counts external packages' installed size toward its 230 MB per-deployment code limit, and AWS Lambda caps an unzipped deployment at 250 MB. just-bash installs everything every user might need: the full sql.js distribution, TypeScript, CPython, a DOM implementation, and several builds of its own code. Here each piece is an opt-in package, and every package bundles its pure-JavaScript dependencies, so npm installs nothing it does not run.

| Install | Size | vs just-bash@3.6.0 |
| --- | ---: | ---: |
| just-bash@3.6.0 (upstream) | 93.37 MiB | 100% |
| core | 2.00 MiB | 2.1% |
| core + python | 12.00 MiB | 12.8% |
| core + js | 2.98 MiB | 3.2% |
| core + sqlite | 2.72 MiB | 2.9% |
| core + net | 3.85 MiB | 4.1% |
| core + html | 2.27 MiB | 2.4% |
| core + archive | 3.51 MiB | 3.8% |
| core + python + js | 12.97 MiB | 13.9% |
| core + python + js + sqlite | 13.69 MiB | 14.7% |
| full | 17.32 MiB | 18.5% |

Measured with `npm install --os=linux --cpu=arm64 --libc=glibc --ignore-scripts` into an empty directory, summing every file under node_modules and following symlinks, the way Convex counts them. Install scripts add the native zstd and xz builds to the archive add-on and to upstream. [`slim/scripts/size-report.mjs`](https://github.com/vinnysaj/just-bash/blob/slim/slim/scripts/size-report.mjs) produces this table.

## Packages

| Package | Adds | Size |
| --- | --- | ---: |
| `@vinnysaj/just-bash` | The shell, its builtins, and every pure-JavaScript command: text tools (grep, sed, awk, sort, cut, ...), jq, yq, xan, diff, file, gzip, bzip2, tar, curl (with the `fetch` option), and more. No dependencies. | 2.0 MiB |
| `@vinnysaj/just-bash-python` | `python3` and `python` (the `python` option): CPython 3.13 compiled to WebAssembly, with its standard library | 10.0 MiB |
| `@vinnysaj/just-bash-js` | `js-exec` and `node` (the `javascript` option): a QuickJS sandbox for JavaScript and TypeScript | 1.0 MiB |
| `@vinnysaj/just-bash-sqlite` | `sqlite3`: SQLite compiled to WebAssembly | 0.7 MiB |
| `@vinnysaj/just-bash-net` | The transport behind the `network` option ([guarded-fetch](https://www.npmjs.com/package/guarded-fetch)) | 1.9 MiB |
| `@vinnysaj/just-bash-html` | `html-to-markdown` ([turndown](https://www.npmjs.com/package/turndown)) | 0.3 MiB |
| `@vinnysaj/just-bash-archive` | xz (`tar -J`) and zstd (`tar --zstd`) through native modules | 1.5 MiB |
| `@vinnysaj/just-bash-full` | Core and every add-on, re-exporting core: a drop-in replacement for just-bash | |

Every package carries the same version. Core declares each add-on as an optional peer dependency at exactly its own version, so npm reports a mismatched add-on at install time, and core checks the version again when it loads one.

```sh
# Core only
npm install @vinnysaj/just-bash

# Core and Python
npm install @vinnysaj/just-bash @vinnysaj/just-bash-python

# Everything, as a drop-in replacement for just-bash
npm install @vinnysaj/just-bash-full
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
- **Python startup.** CPython is compiled once per process and the compiled module is shared with each python3 worker, so every python3 run after the first in a process starts about twice as fast. The compiled module stays in memory for the life of the process. The standard library is unchanged: upstream's archive already leaves out the test suites, tkinter, idlelib, ensurepip, venv, and lib2to3.

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
    "@vinnysaj/just-bash": "1.0.0",
    "@vinnysaj/just-bash-python": "1.0.0",
    "@vinnysaj/just-bash-js": "1.0.0"
  }
}
```

## Security

just-bash's sandbox model is unchanged; see upstream's [threat model](https://github.com/vinnysaj/just-bash/blob/slim/THREAT_MODEL.md). Network access exists only through the `network` option, which needs the net add-on, or through a `fetch` function you pass in yourself. The net add-on depends on guarded-fetch 0.1.5 (undici 7.30.0) as a regular dependency, so guarded-fetch patch releases reach you without a new release here. Core finds add-ons only by their fixed package names, resolved from its own install location, and refuses any whose version differs from its own.

Report a vulnerability in the shell, a command, or the sandbox to upstream as its security policy describes. Report one in the packaging or the add-on loading here.

## Versions

Versions here follow their own semver line. Each release records the upstream release it is built from in every package.json (`"upstream": { "package", "version", "commit" }`) and in this table.

| Version | Based on |
| --- | --- |
| 1.0.0 | [just-bash@3.6.0](https://github.com/vercel-labs/just-bash/releases/tag/just-bash%403.6.0) |

Every week a workflow checks upstream for a new release. When there is one, it merges the release tag into a branch (merges, never rebases), builds, measures sizes, and opens a pull request with upstream's changelog. CI then runs upstream's whole test suite against core with every add-on and against core alone, a differential test that runs the same scripts through the published upstream release and through these packages and compares stdout, stderr, and exit codes, and a smoke test of an app-style setup, on Linux x64 and arm64 with Node 22.13 and 24. Merging the pull request and pushing a `v<version>` tag publishes every package from GitHub Actions with npm provenance. The [changelog](https://github.com/vinnysaj/just-bash/blob/slim/slim/CHANGELOG.md) lists each release.

If a problem also happens with upstream just-bash, report it [upstream](https://github.com/vercel-labs/just-bash/issues). Report problems with packaging, add-ons, sizes, or a difference from upstream [here](https://github.com/vinnysaj/just-bash/issues).

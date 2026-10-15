# Changelog

Releases of the @vinnysaj/just-bash packages. Each release has the version of the just-bash release it is built from, and every package in it has that version. For changes to the shell and its commands, see upstream's [changelog](https://github.com/vercel-labs/just-bash/blob/main/packages/just-bash/CHANGELOG.md). Changes made here go under "## Unreleased" until the next release takes them.

## 3.6.0

Based on [just-bash@3.6.0](https://github.com/vercel-labs/just-bash/releases/tag/just-bash%403.6.0); upstream's [changelog](https://github.com/vercel-labs/just-bash/blob/main/packages/just-bash/CHANGELOG.md) lists its changes.

- First release: `@vinnysaj/just-bash` (core) and the `-python`, `-js`, `-sqlite`, `-net`, `-html`, `-archive`, and `-full` packages.
- Core bundles its pure-JavaScript dependencies and has no dependencies of its own. It ships as ESM only, for Node.js `^22.13.0 || >=23.2.0`, without the browser build or the CLIs.
- An option whose add-on is missing throws while constructing `Bash`, and a command whose add-on is missing exits with status 127 and names the package to install.
- The net add-on uses guarded-fetch 0.1.5 (undici 7.30.0) instead of 0.1.3.
- CPython ships brotli-compressed. python3 decompresses and compiles it once per thread and shares it with each worker, so runs after the first take about 40% less time.
- The `python` option also accepts `{ wasmModule }` (type `PythonConfig`), and the python add-on exports `loadPythonModule()`, so hosts that start a new worker thread for each task can compile CPython once per process.

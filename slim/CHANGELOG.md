# Changelog

Releases of the @vinnysaj/just-bash packages. Every package in a release has the same version. For changes to the shell and its commands, see upstream's [changelog](https://github.com/vercel-labs/just-bash/blob/main/packages/just-bash/CHANGELOG.md) for the release each version is based on.

## 1.0.0

Based on [just-bash@3.6.0](https://github.com/vercel-labs/just-bash/releases/tag/just-bash%403.6.0).

- First release: `@vinnysaj/just-bash` (core) and the `-python`, `-js`, `-sqlite`, `-net`, `-html`, `-archive`, and `-full` packages.
- Core bundles its pure-JavaScript dependencies and has no dependencies of its own. It ships as ESM only, for Node.js `^22.13.0 || >=23.2.0`, without the browser build or the CLIs.
- An option whose add-on is missing throws while constructing `Bash`, and a command whose add-on is missing exits with status 127 and names the package to install.
- The net add-on uses guarded-fetch 0.1.5 (undici 7.30.0) instead of 0.1.3.
- python3 compiles CPython once per process and shares it with each worker, so later runs start about twice as fast.

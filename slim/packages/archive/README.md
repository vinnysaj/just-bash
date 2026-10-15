# @vinnysaj/just-bash-archive

Adds xz (`tar -J`) and zstd (`tar --zstd`) compression to the `tar` command of [@vinnysaj/just-bash](https://github.com/vinnysaj/just-bash#readme), through the native modules [node-liblzma](https://www.npmjs.com/package/node-liblzma) and [@mongodb-js/zstd](https://www.npmjs.com/package/@mongodb-js/zstd). gzip and bzip2 are part of core.

```sh
npm install @vinnysaj/just-bash @vinnysaj/just-bash-archive
```

node-liblzma compiles during install, so it needs liblzma headers (`liblzma-dev` on Debian and Ubuntu, `xz` on Homebrew). Both modules are optional dependencies: if one fails to build, the install still succeeds and only that codec is unavailable. Install the same version as `@vinnysaj/just-bash`. See the [main README](https://github.com/vinnysaj/just-bash#readme) for sizes and differences from upstream just-bash.

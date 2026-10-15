# @vinnysaj/just-bash-python

Adds the `python3` and `python` commands to [@vinnysaj/just-bash](https://github.com/vinnysaj/just-bash#readme): CPython 3.13 compiled to WebAssembly, with its standard library.

```sh
npm install @vinnysaj/just-bash @vinnysaj/just-bash-python
```

```ts
import { Bash } from "@vinnysaj/just-bash";

const bash = new Bash({ python: true });
```

Each thread that runs `Bash` compiles CPython on its first python3 run and reuses it after that. Hosts that start a new worker thread for each task can compile it once on the main thread instead and pass the module to each worker:

```ts
import { loadPythonModule } from "@vinnysaj/just-bash-python";

// Main thread, once per process; pass it on through workerData or postMessage
const wasmModule = await loadPythonModule();

// In each worker
const bash = new Bash({ python: { wasmModule } });
```

See [Python](https://github.com/vinnysaj/just-bash#python) for details. Without `wasmModule` nothing needs configuring.

Install the same version as `@vinnysaj/just-bash`. See the [main README](https://github.com/vinnysaj/just-bash#readme) for sizes and differences from upstream just-bash.

// Loads @vinnysaj/just-bash the way an embedding host does: resolves the
// package entry to a file URL, then imports it from an eval'd worker that has
// an empty environment, one worker per turn. The first turn uses
// `python: true`. Before the later turns the host compiles CPython once with
// loadPythonModule() and hands the module to each turn's worker, through
// workerData or postMessage, as `python: { wasmModule }`. Copied next to
// node_modules by app-smoke.mjs so the packages resolve from here. Prints each
// turn's results as JSON.
//
//   node host.mjs <python-library-dir>

import { renameSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

const pythonLibrary = process.argv[2];
const moduleUrl = import.meta.resolve("@vinnysaj/just-bash");

const source = `
const { parentPort, workerData } = require("node:worker_threads");

async function main() {
  const { Bash, defineCommand, InMemoryFs, MountableFs, OverlayFs } = await import(workerData.moduleUrl);
  const wasmModule =
    workerData.wasmModuleSource === "message"
      ? await new Promise((resolve) => parentPort.once("message", resolve))
      : workerData.wasmModule;

  const fs = new MountableFs({
    base: new InMemoryFs({ "/workspace/.keep": "" }, { maxTotalBytes: 1024 * 1024 }),
  });
  fs.mount(
    "/opt/pylib",
    new OverlayFs({ root: workerData.pythonLibrary, mountPoint: "/", readOnly: true }),
  );

  // Runs a Python file with the read-only library directory on sys.path.
  const py = defineCommand("py", async (args, ctx) => {
    const path = args[0].startsWith("/") ? args[0] : ctx.cwd + "/" + args[0];
    const script = await ctx.fs.readFile(path);
    await ctx.fs.writeFile(
      "/tmp/_py_main.py",
      'import sys\\nsys.path[:0] = ["/host/opt/pylib"]\\n' + script,
    );
    return ctx.exec(["python3", "/tmp/_py_main.py", ...args.slice(1)].join(" "), {
      cwd: ctx.cwd,
    });
  });
  const hello = defineCommand("hello", async (args) => ({
    stdout: "hello " + (args[0] ?? "world") + "\\n",
    stderr: "",
    exitCode: 0,
  }));

  const bash = new Bash({
    fs,
    python: wasmModule ? { wasmModule } : true,
    javascript: true,
    executionLimitProfile: "hardened",
    executionLimits: { maxCommandCount: 500 },
    cwd: "/workspace",
    env: { APP_ENV: "smoke" },
    customCommands: [py, hello],
  });

  const scripts = {
    cwdEnv: "pwd; echo $APP_ENV",
    mount: "ls /opt/pylib",
    pythonLibrary: "printf 'import slimtest_helper\\\\nprint(slimtest_helper.greet(\\"smoke\\"))\\\\n' > main.py && py main.py",
    python: "python3 -c 'print(sum(range(10)))'",
    pythonAgain: "python3 -c 'import json; print(json.dumps([1, 2]))'",
    js: "js-exec -c 'console.log([1, 2, 3].map((x) => x * 2).join(\\",\\"))'",
    typescript: "echo 'const n: number = 2; console.log(n ** 10)' > t.ts && js-exec t.ts",
    custom: "hello app",
    sqlite: "sqlite3 :memory: 'select 6 * 7'",
    curl: "curl https://example.com",
    wget: "wget https://example.com",
    commandLimit: "for i in $(seq 1 1000); do :; done",
    byteLimit: "printf '%0*d' 1100000 0 > big.txt",
  };

  const results = {};
  try {
    new Bash({ python: { wasmModule: {} } });
    results.invalidModule = { thrown: null };
  } catch (error) {
    results.invalidModule = { thrown: error.message };
  }
  for (const [name, script] of Object.entries(scripts)) {
    try {
      const { stdout, stderr, exitCode } = await bash.exec(script);
      results[name] = { stdout, stderr, exitCode };
    } catch (error) {
      results[name] = { thrown: String(error && error.message || error) };
    }
  }
  return results;
}

main().then(
  (results) => parentPort.postMessage({ results }),
  (error) => parentPort.postMessage({ error: String(error && error.stack || error) }),
);
`;

/** Runs one turn in a fresh eval'd worker and resolves with its results. */
function runTurn(wasmModuleSource, wasmModule) {
  const worker = new Worker(source, {
    eval: true,
    env: {},
    resourceLimits: { maxOldGenerationSizeMb: 512 },
    workerData: {
      moduleUrl,
      pythonLibrary,
      wasmModuleSource,
      ...(wasmModuleSource === "workerData" && { wasmModule }),
    },
  });
  if (wasmModuleSource === "message") worker.postMessage(wasmModule);
  return new Promise((resolve, reject) => {
    worker.once("message", (message) => {
      worker.terminate().then(() => {
        if (message.error) reject(new Error(`worker failed: ${message.error}`));
        else resolve(message.results);
      }, reject);
    });
    worker.once("error", reject);
  });
}

const turns = {};
turns.default = await runTurn("none");

const pythonEntry = import.meta.resolve("@vinnysaj/just-bash-python");
const { loadPythonModule } = await import(pythonEntry);
const wasmModule = await loadPythonModule();
// With CPython's file out of reach, any worker that compiled it itself
// instead of using the shared module would fail.
const compressedWasm = fileURLToPath(
  new URL("./vendor/cpython-emscripten/python.wasm.br", pythonEntry),
);
renameSync(compressedWasm, `${compressedWasm}.hidden`);
try {
  turns.workerData = await runTurn("workerData", wasmModule);
  turns.workerDataAgain = await runTurn("workerData", wasmModule);
  turns.message = await runTurn("message", wasmModule);
} finally {
  renameSync(`${compressedWasm}.hidden`, compressedWasm);
}
console.log(JSON.stringify({ moduleUrl, turns }));

// Smoke test for an app that embeds @vinnysaj/just-bash with the python, js,
// and sqlite add-ons: installs them from tarballs of slim/dist, runs them from
// eval'd workers with an empty environment (host.mjs), once with
// `python: true` and three times with a CPython module the host compiled, and
// type-checks the public API against the installed declarations.
//
//   node test/smoke/app-smoke.mjs

import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { addonPackageName, CORE_NAME, SLIM_DIR } from "../../config.mjs";
import { installSlim, packSlim, tempDir } from "../differential/install.mjs";

const EXPECTED = {
  invalidModule: { thrown: "python.wasmModule must be a WebAssembly.Module" },
  cwdEnv: { stdout: "/workspace\nsmoke\n", stderr: "", exitCode: 0 },
  mount: { stdout: "slimtest_helper.py\n", stderr: "", exitCode: 0 },
  pythonLibrary: {
    stdout: "hello smoke from the read-only mount\n",
    stderr: "",
    exitCode: 0,
  },
  python: { stdout: "45\n", stderr: "", exitCode: 0 },
  pythonAgain: { stdout: "[1, 2]\n", stderr: "", exitCode: 0 },
  js: { stdout: "2,4,6\n", stderr: "", exitCode: 0 },
  typescript: { stdout: "1024\n", stderr: "", exitCode: 0 },
  custom: { stdout: "hello app\n", stderr: "", exitCode: 0 },
  sqlite: { stdout: "42\n", stderr: "", exitCode: 0 },
  curl: {
    stdout: "",
    stderr: "bash: curl: command not found\n",
    exitCode: 127,
  },
  wget: {
    stdout: "",
    stderr: "bash: wget: command not found\n",
    exitCode: 127,
  },
};

/** Results that depend on limit messages are checked by shape. */
const CHECKS = {
  commandLimit: (result) =>
    result.exitCode !== 0 &&
    /command|limit/i.test(result.stderr ?? result.thrown ?? ""),
  byteLimit: (result) =>
    /ENOSPC/.test(`${result.stderr ?? ""}${result.thrown ?? ""}`),
};

const TYPES_CHECK = `import {
  Bash,
  type BashOptions,
  defineCommand,
  InMemoryFs,
  MountableFs,
  type PythonConfig,
} from "@vinnysaj/just-bash";
import { loadPythonModule } from "@vinnysaj/just-bash-python";

const options: BashOptions = {
  fs: new MountableFs({ base: new InMemoryFs({}, { maxTotalBytes: 1024 }) }),
  python: true,
  javascript: true,
  executionLimitProfile: "hardened",
  executionLimits: { maxCommandCount: 1000 },
  cwd: "/",
  env: { A: "1" },
  customCommands: [
    defineCommand("x", async () => ({ stdout: "", stderr: "", exitCode: 0 })),
  ],
};
export const bash: Bash = new Bash(options);

export async function withSharedModule(): Promise<Bash> {
  const python: PythonConfig = { wasmModule: await loadPythonModule() };
  return new Bash({ ...options, python });
}
`;

const work = tempDir("slim-smoke-");
let failed = false;
try {
  const tarballs = packSlim(join(work, "tarballs"));
  const appDir = join(work, "app");
  mkdirSync(appDir);
  installSlim(appDir, tarballs, [
    CORE_NAME,
    addonPackageName("python"),
    addonPackageName("js"),
    addonPackageName("sqlite"),
  ]);

  const pythonLibrary = join(work, "pylib");
  mkdirSync(pythonLibrary);
  writeFileSync(
    join(pythonLibrary, "slimtest_helper.py"),
    'def greet(name):\n    return f"hello {name} from the read-only mount"\n',
  );

  copyFileSync(join(import.meta.dirname, "host.mjs"), join(appDir, "host.mjs"));
  const started = performance.now();
  const output = execFileSync(
    process.execPath,
    [join(appDir, "host.mjs"), pythonLibrary],
    {
      cwd: appDir,
      encoding: "utf8",
      env: {},
    },
  );
  const { moduleUrl, turns } = JSON.parse(output.trim().split("\n").at(-1));
  console.log(
    `Loaded ${moduleUrl} in ${Object.keys(turns).length} eval'd workers (${((performance.now() - started) / 1000).toFixed(1)}s)`,
  );

  for (const [turn, results] of Object.entries(turns)) {
    for (const [name, expected] of Object.entries(EXPECTED)) {
      const actual = results[name];
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        failed = true;
        console.error(
          `✗ ${turn}: ${name}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`,
        );
      } else {
        console.log(`✓ ${turn}: ${name}`);
      }
    }
    for (const [name, check] of Object.entries(CHECKS)) {
      if (check(results[name]))
        console.log(`✓ ${turn}: ${name}: ${JSON.stringify(results[name])}`);
      else {
        failed = true;
        console.error(`✗ ${turn}: ${name}: ${JSON.stringify(results[name])}`);
      }
    }
  }

  writeFileSync(join(appDir, "check.ts"), TYPES_CHECK);
  writeFileSync(
    join(appDir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        module: "nodenext",
        moduleResolution: "nodenext",
        target: "es2022",
        strict: true,
        noEmit: true,
        skipLibCheck: false,
        typeRoots: [join(SLIM_DIR, "node_modules/@types")],
        types: ["node"],
      },
      files: ["check.ts"],
    }),
  );
  try {
    execFileSync(
      join(SLIM_DIR, "node_modules/.bin/tsc"),
      ["-p", "tsconfig.json"],
      {
        cwd: appDir,
        encoding: "utf8",
      },
    );
    console.log(
      "✓ types: BashOptions and the public API type-check against the installed package",
    );
  } catch (error) {
    failed = true;
    console.error(`✗ types\n${error.stdout}${error.stderr}`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
process.exitCode = failed ? 1 : 0;

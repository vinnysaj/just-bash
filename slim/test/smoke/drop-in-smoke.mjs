// Checks that @vinnysaj/just-bash-full replaces just-bash without code
// changes: installed under the name just-bash, as
// `"just-bash": "npm:@vinnysaj/just-bash-full@<version>"` does, an app's
// `import ... from "just-bash"` gets core and every add-on, and its types.
//
//   node test/smoke/drop-in-smoke.mjs

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { addonPackageName, SLIM_DIR } from "../../config.mjs";
import { packSlim, tempDir } from "../differential/install.mjs";

const SCRIPT = `
const { Bash } = await import("just-bash");
const bash = new Bash({ python: true, javascript: true });
const results = {};
for (const [name, script] of Object.entries({
  python: "python3 -c 'print(6 * 7)'",
  javascript: "js-exec -c 'console.log(2 ** 10)'",
  sqlite: "sqlite3 :memory: 'select 1 + 1'",
  html: "echo '<h1>Hi</h1>' | html-to-markdown",
})) {
  const { stdout, stderr, exitCode } = await bash.exec(script);
  results[name] = { stdout, stderr, exitCode };
}
console.log(JSON.stringify(results));
process.exit(0);
`;

const EXPECTED = {
  python: { stdout: "42\n", stderr: "", exitCode: 0 },
  javascript: { stdout: "1024\n", stderr: "", exitCode: 0 },
  sqlite: { stdout: "2\n", stderr: "", exitCode: 0 },
  html: { stdout: "# Hi\n", stderr: "", exitCode: 0 },
};

const TYPES_CHECK = `import { Bash, type BashOptions } from "just-bash";
const options: BashOptions = { python: true, javascript: true };
export const bash: Bash = new Bash(options);
`;

const work = tempDir("slim-drop-in-");
let failed = false;
try {
  const tarballs = packSlim(join(work, "tarballs"));
  const appDir = join(work, "app");
  const dependencies = Object.create(null);
  for (const [name, tarball] of Object.entries(tarballs)) {
    dependencies[name === addonPackageName("full") ? "just-bash" : name] =
      `file:${tarball}`;
  }
  mkdirSync(appDir);
  writeFileSync(
    join(appDir, "package.json"),
    JSON.stringify({
      name: "drop-in-app",
      private: true,
      type: "module",
      dependencies,
    }),
  );
  execFileSync(
    "npm",
    [
      "install",
      "--no-package-lock",
      "--no-audit",
      "--no-fund",
      "--ignore-scripts",
    ],
    { cwd: appDir, stdio: ["ignore", "ignore", "inherit"] },
  );

  // A file, not -e: workers inherit the parent's Node flags.
  writeFileSync(join(appDir, "app.mjs"), SCRIPT);
  const results = JSON.parse(
    execFileSync(process.execPath, [join(appDir, "app.mjs")], {
      cwd: appDir,
      encoding: "utf8",
    })
      .trim()
      .split("\n")
      .at(-1),
  );
  for (const [name, expected] of Object.entries(EXPECTED)) {
    if (JSON.stringify(results[name]) === JSON.stringify(expected)) {
      console.log(`✓ just-bash: ${name}`);
    } else {
      failed = true;
      console.error(
        `✗ just-bash: ${name}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(results[name])}`,
      );
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
    console.log("✓ just-bash: types");
  } catch (error) {
    failed = true;
    console.error(`✗ just-bash: types\n${error.stdout}${error.stderr}`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
if (failed) process.exit(1);
console.log("Drop-in smoke test passed");

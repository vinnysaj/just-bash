// Checks what core does without its add-ons, installed from a tarball the
// way an app gets it: options that need an add-on throw while constructing
// Bash, commands that need one exit 127 naming it, and an add-on whose
// version differs from core's is refused.
//
//   node test/smoke/core-only-smoke.mjs

import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { addonPackageName, CORE_NAME, VERSION } from "../../config.mjs";
import { installSlim, packSlim, tempDir } from "../differential/install.mjs";

const appDirs = [];

function install(packages) {
  const appDir = installSlim(
    tempDir("slim-core-only-app-"),
    tarballs,
    packages,
  );
  appDirs.push(appDir);
  return appDir;
}

/** Runs `body` (an async function source) in a child process importing core. */
function runInApp(appDir, body) {
  const script = `
    const { Bash } = await import("${CORE_NAME}");
    const results = await (${body})(Bash);
    console.log(JSON.stringify(results));
  `;
  const output = execFileSync(
    process.execPath,
    ["--input-type=module", "-e", script],
    { cwd: appDir, encoding: "utf8" },
  );
  return JSON.parse(output);
}

function constructionErrors(Bash) {
  const results = Object.create(null);
  for (const [name, options] of [
    ["python", { python: true }],
    ["javascript", { javascript: true }],
    ["invokeTool", { javascript: { invokeTool: async () => "" } }],
    ["network", { network: { allowedUrlPrefixes: ["https://example.com/"] } }],
  ]) {
    try {
      new Bash(options);
      results[name] = "constructed";
    } catch (error) {
      results[name] = error.message;
    }
  }
  return results;
}

function hint(addon) {
  return `Install it with: npm install ${addonPackageName(addon)}@${VERSION}`;
}

function missingOption(option, addon) {
  return `The ${option} option requires ${addonPackageName(addon)}, which is not installed. ${hint(addon)}`;
}

const EXPECTED_CONSTRUCTION = {
  python: missingOption("python", "python"),
  javascript: missingOption("javascript", "js"),
  invokeTool: missingOption("javascript", "js"),
  network: missingOption("network", "net"),
};

const EXPECTED_COMMANDS = {
  sqlite3: {
    stdout: "",
    stderr: `sqlite3: requires ${addonPackageName("sqlite")}\n`,
    exitCode: 127,
  },
  html: {
    stdout: "",
    stderr: `html-to-markdown: requires ${addonPackageName("html")}\n`,
    exitCode: 127,
  },
  xz: {
    stdout: "",
    stderr: `tar: error creating archive: xz compression requires ${addonPackageName("archive")}, which is not installed. ${hint("archive")}\n`,
    exitCode: 2,
  },
  zstd: {
    stdout: "",
    stderr: `tar: error creating archive: zstd compression requires ${addonPackageName("archive")}, which is not installed. ${hint("archive")}\n`,
    exitCode: 2,
  },
  bzip2: { stdout: "/d/\n/d/f\n", stderr: "", exitCode: 0 },
  gzip: { stdout: "ok\n", stderr: "", exitCode: 0 },
  curlWithFetch: { stdout: "fetched\n", stderr: "", exitCode: 0 },
};

const work = tempDir("slim-core-only-");
const tarballs = packSlim(join(work, "tarballs"));
const failures = [];

function check(label, actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(
      `${label}:\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`,
    );
  }
}

try {
  const coreOnly = install([CORE_NAME]);
  check(
    "construction without add-ons",
    runInApp(coreOnly, constructionErrors.toString()),
    EXPECTED_CONSTRUCTION,
  );

  const commands = runInApp(
    coreOnly,
    `async (Bash) => {
      const bash = new Bash({
        files: { "/d/f": "x\\n" },
        fetch: async (url) => ({
          status: 200,
          statusText: "OK",
          headers: {},
          body: "fetched\\n",
          url,
        }),
      });
      const scripts = {
        sqlite3: "sqlite3 :memory: 'select 1'",
        html: "echo '<b>x</b>' | html-to-markdown",
        xz: "tar -cJf /t.txz /d",
        zstd: "tar --zstd -cf /t.tzst /d",
        bzip2: "tar -cjf /t.tbz2 /d && tar -tjf /t.tbz2",
        gzip: "echo ok | gzip | zcat",
        curlWithFetch: "curl -s https://x.test/",
      };
      const results = {};
      for (const [name, script] of Object.entries(scripts)) {
        const { stdout, stderr, exitCode } = await bash.exec(script);
        results[name] = { stdout, stderr, exitCode };
      }
      return results;
    }`,
  );
  for (const [name, expected] of Object.entries(EXPECTED_COMMANDS)) {
    check(`core only: ${name}`, commands[name], expected);
  }

  // An add-on from another release is refused rather than half-working.
  const mismatched = install([CORE_NAME, addonPackageName("python")]);
  const manifestPath = join(
    mismatched,
    "node_modules",
    addonPackageName("python"),
    "package.json",
  );
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  writeFileSync(
    manifestPath,
    JSON.stringify({ ...manifest, version: "0.0.1" }),
  );
  check(
    "mismatched add-on version",
    runInApp(mismatched, constructionErrors.toString()).python,
    `${addonPackageName("python")}@0.0.1 does not match ${CORE_NAME}@${VERSION}. ${hint("python")}`,
  );
} finally {
  for (const dir of [work, ...appDirs]) {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Core-only smoke test passed");

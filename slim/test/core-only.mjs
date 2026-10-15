// Runs upstream's unit and comparison suites, the ones upstream's CI runs,
// against the slim core with no add-ons installed. Its WASM suite is left
// out: python3, sqlite3, and js-exec need add-ons throughout. Tests that need
// an add-on are expected to fail; they are listed in
// core-only-addon-tests.json. The run fails when any other test fails, or
// when a listed test passes, so the list stays exact across upstream merges.
// The list is for Linux, where CI runs: on macOS without liblzma, upstream's
// own xz tests fail too.
//
//   node test/core-only.mjs           check
//   node test/core-only.mjs --update  rewrite the list from this run

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { SLIM_DIR, UPSTREAM_DIR } from "../config.mjs";

const LIST = join(SLIM_DIR, "test/core-only-addon-tests.json");
const SUITES = ["core.config.ts", "core-comparison.config.ts"];
const update = process.argv.includes("--update");

/** Runs one vitest config and returns its JSON report's test results. */
function runSuite(config) {
  const reportDir = mkdtempSync(join(tmpdir(), "slim-core-only-"));
  const report = join(reportDir, "report.json");
  const run = spawnSync(
    join(SLIM_DIR, "node_modules/.bin/vitest"),
    [
      "run",
      "--config",
      join(SLIM_DIR, "test", config),
      "--reporter=dot",
      "--reporter=json",
      `--outputFile.json=${report}`,
    ],
    { cwd: UPSTREAM_DIR, stdio: "inherit" },
  );
  try {
    return JSON.parse(readFileSync(report, "utf8")).testResults;
  } catch (error) {
    console.error(
      `vitest wrote no report for ${config} (exit ${run.status}): ${error.message}`,
    );
    process.exit(1);
  } finally {
    rmSync(reportDir, { recursive: true, force: true });
  }
}

const testResults = SUITES.flatMap(runSuite);

const failed = [];
/** Load errors by list entry. They name absolute paths, so the entries leave them out. */
const loadErrors = new Map();
/** Tests this environment skips, such as those that need module.registerHooks. */
const skipped = new Set();
for (const file of testResults) {
  const path = relative(UPSTREAM_DIR, file.name);
  if (file.assertionResults.length === 0 && file.status === "failed") {
    const entry = `${path} (file failed to load)`;
    failed.push(entry);
    loadErrors.set(entry, file.message);
  }
  for (const test of file.assertionResults) {
    const entry = `${path} > ${test.fullName}`;
    if (test.status === "failed") failed.push(entry);
    else if (test.status !== "passed") skipped.add(entry);
  }
}
failed.sort();

if (update) {
  writeFileSync(LIST, `${JSON.stringify([...new Set(failed)], null, 2)}\n`);
  console.log(
    `Wrote ${failed.length} add-on tests to ${relative(SLIM_DIR, LIST)}`,
  );
  process.exit(0);
}

const expected = new Set(JSON.parse(readFileSync(LIST, "utf8")));
const unexpected = failed.filter((test) => !expected.has(test));
const failedSet = new Set(failed);
const stale = [...expected].filter(
  (test) => !failedSet.has(test) && !skipped.has(test),
);

if (unexpected.length > 0) {
  console.error(
    `\n${unexpected.length} tests failed without needing an add-on:`,
  );
  for (const test of unexpected) {
    console.error(`  ${test}`);
    if (loadErrors.has(test)) console.error(`    ${loadErrors.get(test)}`);
  }
}
if (stale.length > 0) {
  console.error(
    `\n${stale.length} listed add-on tests passed or no longer exist; review them and run with --update:`,
  );
  for (const test of stale) console.error(`  ${test}`);
}
if (unexpected.length > 0 || stale.length > 0) process.exit(1);
console.log(
  `\nCore-only: every failure is one of the ${expected.size} listed add-on tests.`,
);

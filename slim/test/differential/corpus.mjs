// Builds the differential corpus: upstream's recorded comparison fixtures,
// the scripts of upstream's bash spec tests, and hand-written cases for the
// commands those two do not reach.

import { readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { UPSTREAM_SRC } from "../../config.mjs";
import { customCases } from "./custom-cases.mjs";

const FIXTURES_DIR = join(UPSTREAM_SRC, "comparison-tests/fixtures");
const SPEC_DIR = join(UPSTREAM_SRC, "spec-tests/bash/cases");
const FIXTURE_CWD = "/work";

function fixtureCases() {
  const cases = [];
  for (const file of readdirSync(FIXTURES_DIR).sort()) {
    const fixtures = JSON.parse(readFileSync(join(FIXTURES_DIR, file), "utf8"));
    for (const [fixtureId, fixture] of Object.entries(fixtures)) {
      const files = Object.create(null);
      for (const [path, content] of Object.entries(fixture.files)) {
        files[posix.join(FIXTURE_CWD, path)] = content;
      }
      cases.push({
        id: `fixture:${file.replace(".comparison.fixtures.json", "")}:${fixtureId}`,
        source: "fixtures",
        preset: "default",
        files,
        cwd: FIXTURE_CWD,
        script: fixture.command,
      });
    }
  }
  return cases;
}

// Mirrors packages/just-bash/src/spec-tests/parser.ts: everything in a case
// that is not an assertion line or a multi-line expectation block is script.
const ASSERTION =
  /^(?:(?:OK|N-I|BUG)(?:-\d+)?\s+\S+\s+)?(?:STDOUT:|STDERR:|stdout:|stderr:|stdout-json:|stderr-json:|status:|SKIP|code:)/i;

function parseSpecFile(content) {
  const cases = [];
  let current = null;
  let lines = [];
  let inlineCode = false;
  let inBlock = false;
  const finish = () => {
    if (!current) return;
    current.script = lines.join("\n").trim();
    if (current.script) cases.push(current);
  };
  for (const [index, line] of content.split("\n").entries()) {
    if (inBlock) {
      if (line === "## END" || line === "## END:") {
        inBlock = false;
        continue;
      }
      if (!(line.startsWith("## ") && ASSERTION.test(line.slice(3)))) continue;
      inBlock = false;
    }
    if (line.startsWith("#### ")) {
      finish();
      current = { name: line.slice(5).trim(), line: index + 1 };
      lines = [];
      inlineCode = false;
      continue;
    }
    if (line.startsWith("## ")) {
      if (!current) continue;
      const assertion = line.slice(3);
      if (
        /^(?:(?:OK|N-I|BUG)(?:-\d+)?\s+\S+\s+)?(?:STDOUT|STDERR):\s*$/i.test(
          assertion,
        )
      ) {
        inBlock = true;
        continue;
      }
      const code = assertion.match(/^code:\s*(.*)$/);
      if (code) {
        lines = [code[1]];
        inlineCode = true;
      }
      continue;
    }
    if (current && !inlineCode) lines.push(line);
  }
  finish();
  return cases;
}

function specCases() {
  const cases = [];
  for (const file of readdirSync(SPEC_DIR)
    .filter((name) => name.endsWith(".test.sh"))
    .sort()) {
    for (const spec of parseSpecFile(
      readFileSync(join(SPEC_DIR, file), "utf8"),
    )) {
      cases.push({
        id: `spec:${file.replace(".test.sh", "")}:${spec.line}`,
        source: "spec",
        preset: "spec",
        rawScript: true,
        script: spec.script,
      });
    }
  }
  return cases;
}

/**
 * The python cases again, with CPython compiled ahead of time and passed in
 * through `python: { wasmModule }`. They run last: the module then serves
 * every later python3 run in the runner's thread.
 */
function pythonModuleCases(cases) {
  return cases
    .filter(
      (testCase) =>
        testCase.id.startsWith("custom:python:") &&
        testCase.preset === "addons",
    )
    .map((testCase) => ({
      ...testCase,
      id: testCase.id.replace("custom:python:", "custom:python-module:"),
      preset: "addons-python-module",
    }));
}

export function buildCorpus() {
  const custom = customCases().map((testCase) => ({
    ...testCase,
    id: `custom:${testCase.id}`,
    source: "custom",
  }));
  const cases = [
    ...fixtureCases(),
    ...specCases(),
    ...custom,
    ...pythonModuleCases(custom),
  ];
  const seen = new Set();
  for (const testCase of cases) {
    if (seen.has(testCase.id))
      throw new Error(`Duplicate case id ${testCase.id}`);
    seen.add(testCase.id);
  }
  return cases;
}

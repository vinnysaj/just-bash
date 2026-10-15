// Runs one corpus through upstream just-bash (from the npm registry) and
// through the slim packages (from tarballs of slim/dist), then requires
// identical stdout, stderr, and exit codes, and the same public API: runtime
// export names and the names exported by the type declarations, apart from
// the additions in ADDED_TYPE_EXPORTS.
//
//   node test/differential/differential.mjs [--filter <id-substring,...>] [--keep]
//
// Upstream runs twice, the second time after the first and the slim run have
// finished, and each case that then differs from upstream runs RECHECK_RUNS
// more times in both builds. Cases whose output varies between runs of the
// same build depend on time, randomness, or scheduling rather than on the
// build (`time` prints a measured duration), so they are listed and left out
// of the comparison; a difference counts only when both builds reproduce
// their output. Every run uses the Node that runs this script, so the
// comparison can be repeated on each supported Node version.
//
// Upstream's dependencies are semver ranges resolved at install time, while
// the slim packages bundle fixed versions. Upstream is installed with npm
// overrides pinning every bundled package to the version slim bundles, so a
// difference here is about packaging, not about which release npm picked that
// day. The dependencies that still differ, the deliberate ones, are printed
// first.

import { execFileSync, spawn } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  ADDONS,
  addonPackageName,
  BUNDLED_VERSIONS,
  CORE_NAME,
  UPSTREAM_DIR,
  upstreamBase,
} from "../../config.mjs";
import { buildCorpus } from "./corpus.mjs";
import { installSlim, installUpstream, packSlim, tempDir } from "./install.mjs";

const args = process.argv.slice(2);
const filterIndex = args.indexOf("--filter");
const filters = filterIndex === -1 ? null : args[filterIndex + 1].split(",");
const keep = args.includes("--keep");
const RUNNER = join(import.meta.dirname, "runner.mjs");
const RECHECK_RUNS = 3;

/** Types slim core exports beyond upstream's, listed in the README. */
const ADDED_TYPE_EXPORTS = ["PythonConfig"];

/** File URL of a package's ESM entry, read from its exports map. */
function esmEntry(installDir, name) {
  const packageDir = join(installDir, "node_modules", name);
  const { exports } = JSON.parse(
    readFileSync(join(packageDir, "package.json"), "utf8"),
  );
  const root = exports["."];
  const entry = root.import?.default ?? root.import ?? root.default;
  return pathToFileURL(join(packageDir, entry)).href;
}

function installedVersion(nodeModules, name) {
  try {
    return JSON.parse(
      readFileSync(join(nodeModules, name, "package.json"), "utf8"),
    ).version;
  } catch {
    return null;
  }
}

/** name → version of every package the slim build bundles, across packages. */
function bundledVersions() {
  const byPackage = JSON.parse(readFileSync(BUNDLED_VERSIONS, "utf8"));
  const versions = Object.create(null);
  for (const [packageName, bundled] of Object.entries(byPackage)) {
    for (const [name, version] of Object.entries(bundled)) {
      if (versions[name] !== undefined && versions[name] !== version) {
        throw new Error(
          `${packageName} bundles ${name}@${version} but another package bundles ${versions[name]}`,
        );
      }
      versions[name] = version;
    }
  }
  return versions;
}

/**
 * Upstream runtime dependencies whose version differs between the upstream
 * install and the slim one. Slim either bundles a dependency (recorded in
 * THIRD_PARTY_LICENSES) or installs it as an add-on's dependency.
 */
function dependencyDrift(upstreamDir, slimDir) {
  const manifest = JSON.parse(
    readFileSync(join(UPSTREAM_DIR, "package.json"), "utf8"),
  );
  const addonDependencies = new Set(
    ADDONS.flatMap((addon) =>
      Object.keys({ ...addon.dependencies, ...addon.optionalDependencies }),
    ),
  );
  const bundled = bundledVersions();
  const drift = [];
  for (const name of Object.keys({
    ...manifest.dependencies,
    ...manifest.optionalDependencies,
  }).sort()) {
    const upstreamVersion = installedVersion(
      join(upstreamDir, "node_modules"),
      name,
    );
    const slimVersion = addonDependencies.has(name)
      ? installedVersion(join(slimDir, "node_modules"), name)
      : (bundled[name] ?? null);
    if (upstreamVersion !== slimVersion)
      drift.push({ name, upstreamVersion, slimVersion });
  }
  return drift;
}

/** Runtime export names of an ESM entry, read in a child process. */
function runtimeExports(moduleUrl) {
  const script = `const m = await import(${JSON.stringify(moduleUrl)}); console.log(JSON.stringify(Object.keys(m).sort()));`;
  return JSON.parse(
    execFileSync(process.execPath, ["--input-type=module", "-e", script], {
      encoding: "utf8",
    }),
  );
}

/** Exported names of a declaration entry, and its type errors. */
function typeExports(declarationFile) {
  const ts = createRequire(import.meta.url)("typescript");
  const program = ts.createProgram([declarationFile], {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    noEmit: true,
    strict: true,
  });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(declarationFile);
  const errors = ts
    .getPreEmitDiagnostics(program)
    .filter((diagnostic) => diagnostic.file === source)
    .map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    );
  const names = checker
    .getExportsOfModule(checker.getSymbolAtLocation(source))
    .map((symbol) => symbol.getName())
    .sort();
  return { names, errors };
}

function declarationEntry(installDir, name) {
  const packageDir = join(installDir, "node_modules", name);
  const { exports } = JSON.parse(
    readFileSync(join(packageDir, "package.json"), "utf8"),
  );
  const root = exports["."];
  return join(packageDir, root.import?.types ?? root.types);
}

/** Differences between upstream's public API and slim core's. */
function apiDifferences(upstreamDir, slimDir) {
  const problems = [];
  const compare = (kind, upstreamNames, slimNames) => {
    const missing = upstreamNames.filter((name) => !slimNames.includes(name));
    const extra = slimNames.filter((name) => !upstreamNames.includes(name));
    if (missing.length > 0)
      problems.push(`${kind} missing: ${missing.join(", ")}`);
    if (extra.length > 0)
      problems.push(`${kind} not in upstream: ${extra.join(", ")}`);
  };
  compare(
    "runtime exports",
    runtimeExports(esmEntry(upstreamDir, "just-bash")),
    runtimeExports(esmEntry(slimDir, CORE_NAME)),
  );
  const upstreamTypes = typeExports(declarationEntry(upstreamDir, "just-bash"));
  const slimTypes = typeExports(declarationEntry(slimDir, CORE_NAME));
  compare(
    "type exports",
    [...upstreamTypes.names, ...ADDED_TYPE_EXPORTS].sort(),
    slimTypes.names,
  );
  for (const error of slimTypes.errors) problems.push(`type error: ${error}`);
  return problems;
}

function runCorpus(label, moduleUrl, casesFile, work) {
  const resultsFile = join(work, `${label}.json`);
  const started = performance.now();
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [RUNNER, moduleUrl, casesFile, resultsFile],
      {
        stdio: ["ignore", "inherit", "inherit"],
      },
    );
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`${label} runner exited with ${code}`));
        return;
      }
      const seconds = ((performance.now() - started) / 1000).toFixed(1);
      console.log(`${label}: ${seconds}s`);
      resolve(JSON.parse(readFileSync(resultsFile, "utf8")));
    });
  });
}

function same(a, b) {
  return (
    a.error === b.error &&
    a.stdout === b.stdout &&
    a.stderr === b.stderr &&
    a.exitCode === b.exitCode
  );
}

function clip(value, limit = 600) {
  if (value === undefined) return "undefined";
  const text = JSON.stringify(value);
  return text.length > limit
    ? `${text.slice(0, limit)}… (${text.length} chars)`
    : text;
}

function describeMismatch(testCase, upstream, slim) {
  const lines = [
    `✗ ${testCase.id} [${testCase.preset}]`,
    `  script: ${clip(testCase.script, 300)}`,
  ];
  for (const field of ["error", "exitCode", "stdout", "stderr"]) {
    if (upstream[field] !== slim[field]) {
      lines.push(
        `  ${field}:`,
        `    upstream: ${clip(upstream[field])}`,
        `    slim:     ${clip(slim[field])}`,
      );
    }
  }
  return lines.join("\n");
}

const work = tempDir("slim-differential-");
try {
  const upstream = upstreamBase();
  const cases = buildCorpus().filter(
    (testCase) =>
      !filters || filters.some((filter) => testCase.id.includes(filter)),
  );
  const casesFile = join(work, "cases.json");
  writeFileSync(casesFile, JSON.stringify(cases));

  const counts = Object.create(null);
  for (const testCase of cases)
    counts[testCase.source] = (counts[testCase.source] ?? 0) + 1;
  console.log(
    `Node ${process.version}; ${cases.length} cases (${Object.entries(counts)
      .map(([source, count]) => `${source} ${count}`)
      .join(", ")}); upstream just-bash@${upstream.version}`,
  );

  const tarballs = packSlim(join(work, "tarballs"));
  const slimDir = installSlim(tempDir("slim-differential-slim-"), tarballs, [
    CORE_NAME,
    ...ADDONS.map((addon) => addonPackageName(addon.id)),
  ]);
  const upstreamDir = installUpstream(
    tempDir("slim-differential-upstream-"),
    upstream.version,
    bundledVersions(),
  );

  const drift = dependencyDrift(upstreamDir, slimDir);
  if (drift.length > 0) {
    console.log("Dependency versions that differ (upstream install / slim):");
    for (const { name, upstreamVersion, slimVersion } of drift) {
      console.log(
        `  ${name}: ${upstreamVersion ?? "not installed"} / ${slimVersion ?? "not shipped"}`,
      );
    }
  }

  const api = apiDifferences(upstreamDir, slimDir);
  if (api.length > 0) {
    console.log("Public API differs from upstream:");
    for (const problem of api) console.log(`  ${problem}`);
  } else {
    console.log("Public API: runtime and type exports match upstream");
  }

  const upstreamEntry = esmEntry(upstreamDir, "just-bash");
  const slimEntry = esmEntry(slimDir, CORE_NAME);
  const [first, slim] = await Promise.all([
    runCorpus("upstream (1st run)", upstreamEntry, casesFile, work),
    runCorpus("slim", slimEntry, casesFile, work),
  ]);
  const second = await runCorpus(
    "upstream (2nd run)",
    upstreamEntry,
    casesFile,
    work,
  );
  const upstreamRuns = [first, second];
  const slimRuns = [slim];

  const differing = cases.filter(
    (testCase) =>
      same(first[testCase.id], second[testCase.id]) &&
      !same(first[testCase.id], slim[testCase.id]),
  );
  if (differing.length > 0) {
    const recheckFile = join(work, "recheck.json");
    writeFileSync(recheckFile, JSON.stringify(differing));
    for (let run = 1; run <= RECHECK_RUNS; run++) {
      const [upstreamRun, slimRun] = await Promise.all([
        runCorpus(
          `upstream (recheck ${run})`,
          upstreamEntry,
          recheckFile,
          work,
        ),
        runCorpus(`slim (recheck ${run})`, slimEntry, recheckFile, work),
      ]);
      upstreamRuns.push(upstreamRun);
      slimRuns.push(slimRun);
    }
  }

  /** Whether every run that has the case gave the same result. */
  const reproducible = (runs, id) =>
    runs.filter((run) => id in run).every((run) => same(run[id], runs[0][id]));
  const unstable = cases.filter(
    (testCase) =>
      !reproducible(upstreamRuns, testCase.id) ||
      !reproducible(slimRuns, testCase.id),
  );
  const mismatches = differing.filter(
    (testCase) => !unstable.includes(testCase),
  );

  if (unstable.length > 0) {
    console.log(
      `\n${unstable.length} cases vary between runs of the same build and are not compared:`,
    );
    for (const testCase of unstable) console.log(`  ${testCase.id}`);
  }
  for (const testCase of mismatches) {
    console.log(
      `\n${describeMismatch(testCase, first[testCase.id], slim[testCase.id])}`,
    );
  }
  console.log(
    `\n${cases.length - unstable.length - mismatches.length} identical, ${mismatches.length} different, ${unstable.length} vary between runs`,
  );
  if (keep) console.log(`Kept ${work}, ${upstreamDir}, ${slimDir}`);
  else {
    rmSync(upstreamDir, { recursive: true, force: true });
    rmSync(slimDir, { recursive: true, force: true });
  }
  process.exitCode = mismatches.length > 0 || api.length > 0 ? 1 : 0;
} finally {
  if (!keep) rmSync(work, { recursive: true, force: true });
}

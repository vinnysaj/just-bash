// Merges an upstream just-bash release into the current branch and prepares
// the release that matches it: every package takes the upstream version,
// slim/upstream.json records the release, and slim/CHANGELOG.md's
// "## Unreleased" section becomes its entry.
//
//   node scripts/sync-upstream.mjs just-bash@<version>   merge a release
//   node scripts/sync-upstream.mjs --continue            finish after resolving conflicts
//
// Merges, never rebases: the branch is public. Two kinds of conflict resolve
// themselves: pnpm-lock.yaml is regenerated, and upstream's GitHub workflows,
// which this branch does not carry, stay deleted (they run only on upstream's
// main, and GitHub refuses workflow changes pushed with the Actions token).
// Any other conflict leaves the merge in progress, lists the files (also as
// `conflicts` in $GITHUB_OUTPUT), and exits 1; resolve them, `git add`, and
// run with --continue.

import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  REPO_DIR,
  SLIM_DIR,
  UPSTREAM_DIR,
  UPSTREAM_FILE,
  upstreamBase,
} from "../config.mjs";

export const UPSTREAM_URL = "https://github.com/vercel-labs/just-bash.git";
const RELEASE_TAG = /^just-bash@(\d+\.\d+\.\d+)$/;
const SLIM_WORKFLOW = /^\.github\/workflows\/slim-[^/]+$/;

/**
 * Runtime dependencies of the add-ons that re-export them, with the range
 * upstream declares: the archive add-on's native codecs follow upstream's
 * range, and the net add-on's guarded-fetch follows it only once upstream's
 * minimum reaches the one here.
 */
const FOLLOWED_DEPENDENCIES = [
  { name: "node-liblzma", field: "optionalDependencies", follow: "always" },
  { name: "@mongodb-js/zstd", field: "optionalDependencies", follow: "always" },
  { name: "guarded-fetch", field: "dependencies", follow: "newer" },
];

function git(...gitArgs) {
  return execFileSync("git", gitArgs, {
    cwd: REPO_DIR,
    encoding: "utf8",
  }).trim();
}

function run(command, commandArgs, cwd = REPO_DIR) {
  execFileSync(command, commandArgs, { cwd, stdio: "inherit" });
}

function output(name, value) {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  }
}

export function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let index = 0; index < 3; index++) {
    if (pa[index] !== pb[index]) return pa[index] - pb[index];
  }
  return 0;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function unmergedPaths() {
  return git("diff", "--name-only", "--diff-filter=U")
    .split("\n")
    .filter(Boolean);
}

/** Resolves the conflicts that have a fixed answer; returns the rest. */
function resolveKnownConflicts() {
  for (const path of unmergedPaths()) {
    if (path === "pnpm-lock.yaml") {
      // Regenerated once the merge is complete.
      git("checkout", "--theirs", "pnpm-lock.yaml");
      git("add", "pnpm-lock.yaml");
    } else if (path.startsWith(".github/workflows/")) {
      git("rm", "--quiet", "--force", "--ignore-unmatch", path);
    }
  }
  // Workflows upstream added merge cleanly; they are dropped too.
  for (const path of git("ls-files", ".github/workflows").split("\n")) {
    if (path && !SLIM_WORKFLOW.test(path)) {
      git("rm", "--quiet", "--force", path);
    }
  }
  return unmergedPaths();
}

function refreshLockfile() {
  run("pnpm", ["install", "--lockfile-only"]);
  git("add", "pnpm-lock.yaml");
}

/** Lower bound of a range such as `^0.1.5` or `0.1.3`. */
function minimumVersion(range) {
  const match = range.match(/(\d+\.\d+\.\d+)/);
  if (!match) throw new Error(`Cannot read a version from the range ${range}`);
  return match[1];
}

function followUpstreamDependencies() {
  const upstreamManifest = readJson(join(UPSTREAM_DIR, "package.json"));
  const slimManifest = readJson(join(SLIM_DIR, "package.json"));
  for (const { name, field, follow } of FOLLOWED_DEPENDENCIES) {
    const upstreamRange =
      upstreamManifest.dependencies?.[name] ??
      upstreamManifest.optionalDependencies?.[name];
    const slimRange = slimManifest[field]?.[name];
    if (upstreamRange === undefined) {
      throw new Error(
        `Upstream no longer depends on ${name}, which the ${field} of slim/package.json ship; update the add-on by hand`,
      );
    }
    if (upstreamRange === slimRange) continue;
    if (
      follow === "newer" &&
      compareVersions(
        minimumVersion(upstreamRange),
        minimumVersion(slimRange),
      ) < 0
    ) {
      continue;
    }
    const saveFlag =
      field === "optionalDependencies" ? "--save-optional" : "--save-prod";
    run("pnpm", [
      "--filter",
      "just-bash-slim",
      "add",
      "--lockfile-only",
      saveFlag,
      `${name}@${upstreamRange}`,
    ]);
    console.log(`${name}: ${slimRange} -> ${upstreamRange}, as upstream`);
  }
}

/** Turns "## Unreleased" into the release entry, or adds an entry. */
function writeChangelogEntry(version) {
  const path = join(SLIM_DIR, "CHANGELOG.md");
  const changelog = readFileSync(path, "utf8");
  const basedOn = `Based on [just-bash@${version}](https://github.com/vercel-labs/just-bash/releases/tag/just-bash%40${version}); upstream's [changelog](https://github.com/vercel-labs/just-bash/blob/main/packages/just-bash/CHANGELOG.md) lists its changes.`;
  if (changelog.includes(`\n## ${version}\n`)) return;
  if (changelog.includes("\n## Unreleased\n")) {
    writeFileSync(
      path,
      changelog.replace("\n## Unreleased\n", `\n## ${version}\n\n${basedOn}\n`),
    );
    return;
  }
  const firstEntry = changelog.indexOf("\n## ");
  const entry = `\n## ${version}\n\n${basedOn}\n`;
  writeFileSync(
    path,
    firstEntry === -1
      ? `${changelog.trimEnd()}\n${entry}`
      : `${changelog.slice(0, firstEntry)}\n${entry}${changelog.slice(firstEntry)}`,
  );
}

/** Points the README's install examples at the new version. */
function updateReadmeVersions(version) {
  const path = join(REPO_DIR, ".github/README.md");
  const readme = readFileSync(path, "utf8");
  writeFileSync(
    path,
    readme.replace(
      /("@vinnysaj\/just-bash(?:-[a-z]+)?": ")\d+\.\d+\.\d+[^"]*(")/g,
      `$1${version}$2`,
    ),
  );
}

function finish() {
  if (unmergedPaths().length > 0) {
    console.error(
      `Resolve and \`git add\` these files first:\n${unmergedPaths()
        .map((path) => `  ${path}`)
        .join("\n")}`,
    );
    process.exit(1);
  }
  let mergeHead;
  try {
    mergeHead = git("rev-parse", "--verify", "--quiet", "MERGE_HEAD");
  } catch {
    console.error(
      "No merge in progress: run node slim/scripts/sync-upstream.mjs just-bash@<version>",
    );
    process.exit(1);
  }
  const version = readJson(join(UPSTREAM_DIR, "package.json")).version;
  refreshLockfile();
  git(
    "commit",
    "--quiet",
    "--no-edit",
    "-m",
    `chore: merge just-bash@${version}`,
  );

  followUpstreamDependencies();
  writeJson(UPSTREAM_FILE, {
    package: "just-bash",
    version,
    commit: mergeHead,
  });
  const manifestPath = join(SLIM_DIR, "package.json");
  writeJson(manifestPath, { ...readJson(manifestPath), version });
  writeChangelogEntry(version);
  updateReadmeVersions(version);
  git(
    "add",
    UPSTREAM_FILE,
    manifestPath,
    join(SLIM_DIR, "CHANGELOG.md"),
    join(REPO_DIR, ".github/README.md"),
    "pnpm-lock.yaml",
  );
  git("commit", "--quiet", "-m", `chore(slim): release ${version}`);
  // Throws if the merged tree and the recorded base disagree.
  upstreamBase();
  console.log(`Merged just-bash@${version}; the packages are now ${version}`);
  output("version", version);
}

function merge(tag) {
  const match = RELEASE_TAG.exec(tag ?? "");
  if (!match) {
    console.error(
      "Usage: node scripts/sync-upstream.mjs just-bash@<major.minor.patch> | --continue",
    );
    process.exit(1);
  }
  const version = match[1];
  const current = upstreamBase().version;
  if (compareVersions(version, current) <= 0) {
    console.error(`${tag} is not newer than just-bash@${current}`);
    process.exit(1);
  }
  // Release tags never move, so one already fetched is reused.
  try {
    git("rev-parse", "--verify", "--quiet", `refs/tags/${tag}`);
  } catch {
    git(
      "fetch",
      "--quiet",
      "--no-tags",
      UPSTREAM_URL,
      `+refs/tags/${tag}:refs/tags/${tag}`,
    );
  }
  try {
    git("merge", "--no-ff", "--no-commit", tag);
  } catch (error) {
    // A merge that stopped on conflicts is resolved below or reported; one
    // that never started (a dirty tree, a missing tag) is a failure.
    if (unmergedPaths().length === 0) throw error;
  }
  const conflicts = resolveKnownConflicts();
  if (conflicts.length > 0) {
    console.error(
      `Merging ${tag} needs a person for:\n${conflicts.map((path) => `  ${path}`).join("\n")}\nResolve them, \`git add\` them, and run: node slim/scripts/sync-upstream.mjs --continue`,
    );
    output("conflicts", conflicts.join(" "));
    process.exit(1);
  }
  finish();
}

if (process.argv[1] === import.meta.filename) {
  const [argument] = process.argv.slice(2);
  if (argument === "--continue") finish();
  else merge(argument);
}

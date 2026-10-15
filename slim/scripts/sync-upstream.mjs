// Merges the newest just-bash release tag from upstream into a sync branch.
//
//   node scripts/sync-upstream.mjs [--notes <file>]
//
// Prints `up to date` and exits 0 when there is nothing to merge. Otherwise
// creates sync/just-bash@<version>, merges the tag (never rebases, since the
// fork is public), regenerates the lockfile when that is the only conflict,
// and writes the upstream changelog entries since the current base to
// --notes. Any other conflict aborts the merge and exits 1 with the files.
// In GitHub Actions the version and branch are written to $GITHUB_OUTPUT.

import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_DIR, UPSTREAM_DIR, upstreamBase } from "../config.mjs";

const UPSTREAM_URL = "https://github.com/vercel-labs/just-bash.git";
const RELEASE_TAG = /^just-bash@(\d+)\.(\d+)\.(\d+)$/;

const args = process.argv.slice(2);
const notesIndex = args.indexOf("--notes");
const notesFile = notesIndex === -1 ? null : args[notesIndex + 1];

function git(...gitArgs) {
  return execFileSync("git", gitArgs, {
    cwd: REPO_DIR,
    encoding: "utf8",
  }).trim();
}

function output(name, value) {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  }
}

function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

/** Changelog sections for versions in (from, to], newest first. */
function changelogSince(from, to) {
  const changelog = readFileSync(join(UPSTREAM_DIR, "CHANGELOG.md"), "utf8");
  const sections = changelog.split(/^(?=## \d+\.\d+\.\d+\s*$)/m).slice(1);
  return sections
    .filter((section) => {
      const version = section.match(/^## (\d+\.\d+\.\d+)/)[1];
      return (
        compareVersions(version, from) > 0 && compareVersions(version, to) <= 0
      );
    })
    .join("")
    .trim();
}

git(
  "fetch",
  "--no-tags",
  UPSTREAM_URL,
  "+refs/tags/just-bash@*:refs/tags/just-bash@*",
);
const releases = git("tag", "--list", "just-bash@*")
  .split("\n")
  .filter((tag) => RELEASE_TAG.test(tag))
  .map((tag) => tag.slice("just-bash@".length))
  .sort(compareVersions);
const latest = releases.at(-1);
const current = upstreamBase().version;

if (compareVersions(latest, current) <= 0) {
  console.log(`up to date with just-bash@${current}`);
  output("updated", "false");
  process.exit(0);
}

const tag = `just-bash@${latest}`;
const branch = `sync/${tag}`;
git("switch", "-c", branch);
try {
  git("merge", "--no-ff", "--no-edit", "-m", `chore: merge ${tag}`, tag);
} catch {
  const conflicts = git("diff", "--name-only", "--diff-filter=U")
    .split("\n")
    .filter(Boolean);
  if (conflicts.length !== 1 || conflicts[0] !== "pnpm-lock.yaml") {
    git("merge", "--abort");
    console.error(
      `Merging ${tag} conflicts in:\n${conflicts.map((file) => `  ${file}`).join("\n")}`,
    );
    output("conflicts", conflicts.join(" "));
    process.exit(1);
  }
  // The lockfile is generated: take upstream's and add the slim workspace back.
  git("checkout", "--theirs", "pnpm-lock.yaml");
  execFileSync("pnpm", ["install", "--lockfile-only"], {
    cwd: REPO_DIR,
    stdio: "inherit",
  });
  git("add", "pnpm-lock.yaml");
  git("commit", "--no-edit");
}

// A clean merge can still leave the lockfile behind the merged manifests.
execFileSync("pnpm", ["install", "--lockfile-only"], {
  cwd: REPO_DIR,
  stdio: "inherit",
});
if (git("status", "--porcelain", "pnpm-lock.yaml") !== "") {
  git("commit", "-m", "chore: refresh lockfile", "pnpm-lock.yaml");
}

if (notesFile) writeFileSync(notesFile, `${changelogSince(current, latest)}\n`);
console.log(`merged ${tag} into ${branch} (was just-bash@${current})`);
output("updated", "true");
output("version", latest);
output("branch", branch);

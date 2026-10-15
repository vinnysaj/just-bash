// Prepares a fork-only fix release between upstream releases.
//
//   node scripts/set-version.mjs fix
//
// Sets slim/package.json to the next <upstream patch + 1>-slim.N, which sorts
// after the current upstream version and before upstream's next patch, and
// turns slim/CHANGELOG.md's "## Unreleased" section, which must describe the
// fix, into its entry. Pushing the commit to slim publishes it. Releases that
// follow upstream need none of this: slim-release.yml sets their version.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  CORE_NAME,
  distTag,
  SLIM_DIR,
  upstreamBase,
  VERSION,
} from "../config.mjs";

if (process.argv[2] !== "fix") {
  console.error("Usage: node scripts/set-version.mjs fix");
  process.exit(1);
}

const upstream = upstreamBase().version;
const [major, minor, patch] = upstream.split(".").map(Number);
const prefix = `${major}.${minor}.${patch + 1}-slim.`;

function publishedVersions() {
  try {
    return JSON.parse(
      execFileSync("npm", ["view", CORE_NAME, "versions", "--json"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    );
  } catch (error) {
    if (String(error.stderr).includes("E404")) return [];
    throw new Error(`npm view ${CORE_NAME} failed:\n${error.stderr}`);
  }
}

const taken = [...publishedVersions(), VERSION]
  .filter((version) => version.startsWith(prefix))
  .map((version) => Number(version.slice(prefix.length)));
const version = `${prefix}${taken.length === 0 ? 1 : Math.max(...taken) + 1}`;
distTag(version, upstream);

const changelogPath = join(SLIM_DIR, "CHANGELOG.md");
const changelog = readFileSync(changelogPath, "utf8");
if (!changelog.includes("\n## Unreleased\n")) {
  console.error(
    'Describe the fix under a "## Unreleased" heading in slim/CHANGELOG.md first',
  );
  process.exit(1);
}
writeFileSync(
  changelogPath,
  changelog.replace("\n## Unreleased\n", `\n## ${version}\n`),
);

const manifestPath = join(SLIM_DIR, "package.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
writeFileSync(
  manifestPath,
  `${JSON.stringify({ ...manifest, version }, null, 2)}\n`,
);
console.log(
  `Set ${version} (a fix on just-bash@${upstream}); commit and push to slim to publish it`,
);

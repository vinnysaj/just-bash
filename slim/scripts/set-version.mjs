// Sets the version of every @vinnysaj/just-bash package for a release.
//
//   node scripts/set-version.mjs <version>
//
// Requires a `## <version>` entry in slim/CHANGELOG.md, then writes the
// version to slim/package.json (the one place every package reads it from)
// and adds the release to the README's version table.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_DIR, SLIM_DIR, upstreamBase } from "../config.mjs";

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
  console.error("Usage: node scripts/set-version.mjs <major.minor.patch>");
  process.exit(1);
}

const changelog = readFileSync(join(SLIM_DIR, "CHANGELOG.md"), "utf8");
if (!changelog.split("\n").includes(`## ${version}`)) {
  console.error(`Add a "## ${version}" entry to slim/CHANGELOG.md first`);
  process.exit(1);
}

const manifestPath = join(SLIM_DIR, "package.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.version = version;
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const readmePath = join(REPO_DIR, ".github/README.md");
const readme = readFileSync(readmePath, "utf8");
// Newest release first, right under the table header.
const header = "| Version | Based on |\n| --- | --- |\n";
if (!readme.includes(header)) {
  throw new Error(".github/README.md has no version table");
}
const upstream = upstreamBase();
const row = `| ${version} | [just-bash@${upstream.version}](https://github.com/vercel-labs/just-bash/releases/tag/just-bash%40${upstream.version}) |\n`;
if (!readme.includes(row)) {
  writeFileSync(readmePath, readme.replace(header, `${header}${row}`));
}
console.log(`Set ${version}, based on just-bash@${upstream.version}`);

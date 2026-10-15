// Compares each built package's unpacked size with its latest version on
// npm, and fails when one grew by more than GROWTH_LIMIT and more than
// MIN_GROWTH_BYTES, so that a release that suddenly bundles something heavy
// waits for a person instead of shipping. Packages npm does not have yet are
// listed without a comparison.
//
//   node scripts/size-check.mjs [--allow-growth]
//
// --allow-growth reports the same table without failing.

import { execFileSync } from "node:child_process";
import { appendFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { OUT_DIR, SCOPE } from "../config.mjs";

const GROWTH_LIMIT = 0.1;
const MIN_GROWTH_BYTES = 256 * 1024;

const allowGrowth = process.argv.includes("--allow-growth");

function npmJson(args) {
  try {
    const output = execFileSync("npm", [...args, "--json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return JSON.parse(output);
  } catch (error) {
    if (String(error.stderr).includes("E404")) return null;
    throw new Error(`npm ${args.join(" ")} failed:\n${error.stderr}`);
  }
}

function kib(bytes) {
  return `${(bytes / 1024).toFixed(0)} KiB`;
}

const rows = [];
const grown = [];
for (const directory of readdirSync(join(OUT_DIR, SCOPE))) {
  const packageDir = join(OUT_DIR, SCOPE, directory);
  const name = `${SCOPE}/${directory}`;
  const [packed] = JSON.parse(
    execFileSync("npm", ["pack", "--dry-run", "--json"], {
      cwd: packageDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
  const latest = npmJson(["view", name, "dist-tags.latest"]);
  const previous =
    latest === null
      ? null
      : npmJson(["view", `${name}@${latest}`, "dist.unpackedSize"]);
  if (previous === null) {
    rows.push(`| ${name} | ${kib(packed.unpackedSize)} | not on npm | |`);
    continue;
  }
  const growth = packed.unpackedSize - previous;
  const tooBig = growth > previous * GROWTH_LIMIT && growth > MIN_GROWTH_BYTES;
  if (tooBig) grown.push(name);
  rows.push(
    `| ${name} | ${kib(packed.unpackedSize)} | ${kib(previous)} (${latest}) | ${growth >= 0 ? "+" : ""}${((growth / previous) * 100).toFixed(1)}%${tooBig ? " **over the limit**" : ""} |`,
  );
}

const table = [
  "| Package | Unpacked | Latest on npm | Change |",
  "| --- | ---: | ---: | ---: |",
  ...rows,
].join("\n");
console.log(table);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${table}\n`);
}

if (grown.length > 0) {
  const message = `${grown.join(", ")} grew by more than ${GROWTH_LIMIT * 100}% and ${kib(MIN_GROWTH_BYTES)} since the latest release.`;
  if (allowGrowth) {
    console.log(`${message} Allowed by --allow-growth.`);
  } else {
    console.error(
      `${message} Check what the build now bundles; if the growth is expected, run slim-release.yml by hand with allow_size_growth.`,
    );
    process.exit(1);
  }
}

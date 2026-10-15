// Publishes every built package. Run by slim-release.yml after Slim CI passes.
//
//   node scripts/publish.mjs [--dry-run]
//
// The version is slim/package.json's, and its dist-tag comes from distTag():
// a release and a fork-only fix publish as `latest`, a pre-release as `next`.
// Add-ons go first and core and full last, so an install that picks up the
// new core always finds the matching add-ons. A version that is already on
// the registry is skipped, so a failed run can be rerun. In GitHub Actions
// every package gets npm provenance.

import { execFileSync } from "node:child_process";
import { join } from "node:path";
import {
  ADDONS,
  addonPackageName,
  CORE_NAME,
  distTag,
  OUT_DIR,
  upstreamBase,
  VERSION,
} from "../config.mjs";

const dryRun = process.argv.includes("--dry-run");
const tag = distTag(VERSION, upstreamBase().version);

const names = [
  ...ADDONS.map((addon) => addonPackageName(addon.id)),
  CORE_NAME,
  addonPackageName("full"),
];

function published(name) {
  try {
    execFileSync("npm", ["view", `${name}@${VERSION}`, "version"], {
      stdio: "pipe",
    });
    return true;
  } catch (error) {
    if (String(error.stderr).includes("E404")) return false;
    throw new Error(`npm view ${name}@${VERSION} failed:\n${error.stderr}`);
  }
}

for (const name of names) {
  if (published(name)) {
    console.log(`${name}@${VERSION} is already published`);
    continue;
  }
  execFileSync(
    "npm",
    [
      "publish",
      "--access",
      "public",
      "--tag",
      tag,
      ...(process.env.GITHUB_ACTIONS === "true" ? ["--provenance"] : []),
      ...(dryRun ? ["--dry-run"] : []),
    ],
    { cwd: join(OUT_DIR, name), stdio: "inherit" },
  );
}
console.log(
  `${dryRun ? "Checked" : "Published"} ${names.length} packages at ${VERSION} (${tag})`,
);

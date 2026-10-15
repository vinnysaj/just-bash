// Publishes every built package with provenance. Run by slim-release.yml.
//
//   node scripts/publish.mjs v<version>
//
// Add-ons go first and core and full last, so an install that picks up the
// new core always finds the matching add-ons. A version that is already on
// the registry is skipped, so a failed run can be rerun.

import { execFileSync } from "node:child_process";
import { join } from "node:path";
import {
  ADDONS,
  addonPackageName,
  CORE_NAME,
  OUT_DIR,
  VERSION,
} from "../config.mjs";

const tag = process.argv[2];
if (tag !== `v${VERSION}`) {
  console.error(
    `Tag ${tag} does not match slim/package.json version ${VERSION}`,
  );
  process.exit(1);
}

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
    throw error;
  }
}

for (const name of names) {
  if (published(name)) {
    console.log(`${name}@${VERSION} is already published`);
    continue;
  }
  execFileSync("npm", ["publish", "--provenance", "--access", "public"], {
    cwd: join(OUT_DIR, name),
    stdio: "inherit",
  });
}

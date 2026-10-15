// Installs upstream just-bash from the registry and the slim packages from
// tarballs of slim/dist, each into its own directory, the way an app gets them.

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OUT_DIR, SCOPE } from "../../config.mjs";

function npm(cwd, ...args) {
  return execFileSync("npm", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
}

/** A fresh directory under the system temp dir. */
export function tempDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

function install(dir, dependencies, overrides) {
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({
      name: "slim-test-install",
      private: true,
      dependencies,
      ...(overrides && { overrides }),
    }),
  );
  npm(dir, "install", "--no-package-lock", "--no-audit", "--no-fund");
  return dir;
}

/** Packs every built @vinnysaj package; returns name → tarball path. */
export function packSlim(destination) {
  mkdirSync(destination, { recursive: true });
  const tarballs = Object.create(null);
  for (const entry of readdirSync(join(OUT_DIR, SCOPE))) {
    const name = `${SCOPE}/${entry}`;
    const [{ filename }] = JSON.parse(
      npm(
        join(OUT_DIR, name),
        "pack",
        "--json",
        "--pack-destination",
        destination,
      ),
    );
    tarballs[name] = join(destination, filename);
  }
  return tarballs;
}

/**
 * Installs the named slim packages from tarballs. Every package that is
 * installed must come from a tarball so nothing under the scope is looked up
 * in the registry.
 */
export function installSlim(dir, tarballs, names) {
  const dependencies = Object.create(null);
  for (const name of names) {
    if (!tarballs[name]) throw new Error(`No tarball for ${name}`);
    dependencies[name] = `file:${tarballs[name]}`;
  }
  return install(dir, dependencies);
}

/** Installs upstream with `overrides` pinning the given dependency versions. */
export function installUpstream(dir, version, overrides) {
  return install(dir, { "just-bash": version }, overrides);
}

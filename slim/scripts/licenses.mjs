// Finds the npm packages an esbuild bundle took code from, and renders
// THIRD_PARTY_LICENSES for them.

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { REPO_DIR } from "../config.mjs";

const LICENSE_FILE = /^(licen[cs]e|copying|notice)(\.|-|$)/i;
const NODE_MODULES = `${sep}node_modules${sep}`;

/** Root directory of the npm package that contains `file`, or null for first-party code. */
function packageRoot(file) {
  const index = file.lastIndexOf(NODE_MODULES);
  if (index === -1) return null;
  const rest = file.slice(index + NODE_MODULES.length).split(sep);
  const depth = rest[0].startsWith("@") ? 2 : 1;
  return (
    file.slice(0, index + NODE_MODULES.length) + rest.slice(0, depth).join(sep)
  );
}

/**
 * Name, version, license, and license texts of each bundled package, by name.
 *
 * @param {import("esbuild").Metafile} metafile built with absWorkingDir set to REPO_DIR
 * @param {string[]} extraPackageDirs packages copied into the output rather than bundled
 */
export function bundledPackages(metafile, extraPackageDirs = []) {
  const roots = new Set(extraPackageDirs);
  for (const input of Object.keys(metafile.inputs)) {
    const root = packageRoot(resolve(REPO_DIR, input));
    if (root) roots.add(root);
  }

  const entries = [...roots].map((root) => {
    const manifest = JSON.parse(
      readFileSync(join(root, "package.json"), "utf8"),
    );
    const texts = readdirSync(root)
      .filter((file) => LICENSE_FILE.test(file))
      .sort()
      .map((file) => readFileSync(join(root, file), "utf8").trim());
    if (texts.length === 0) {
      // Some packages publish only a license identifier; record who it is from.
      const author =
        typeof manifest.author === "string"
          ? manifest.author
          : manifest.author?.name;
      const repository =
        typeof manifest.repository === "string"
          ? manifest.repository
          : manifest.repository?.url;
      texts.push(
        [
          `Licensed under ${manifest.license}; the package ships no license text.`,
          author && `Author: ${author}`,
          repository && `Repository: ${repository}`,
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }
    return {
      name: manifest.name,
      version: manifest.version,
      license: manifest.license,
      texts,
    };
  });
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

/** THIRD_PARTY_LICENSES text for the entries from bundledPackages(). */
export function licenseText(entries) {
  const sections = entries.map(
    (entry) =>
      `${entry.name}@${entry.version} (${entry.license})\n\n${entry.texts.join("\n\n")}`,
  );
  return `This package includes code from the following third-party packages.\n\n${sections.join(`\n\n${"-".repeat(72)}\n\n`)}\n`;
}

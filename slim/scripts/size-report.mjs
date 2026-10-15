// Measures installed sizes the way Convex counts external packages: a plain
// `npm install` for Linux arm64 into an empty directory, then the size of
// every file under node_modules, following symlinks.
//
//   node scripts/size-report.mjs [--registry] [--ignore-scripts] [--json <file>]
//
// By default the packages come from tarballs of slim/dist; --registry installs
// the published versions instead. Install scripts run unless --ignore-scripts
// is given, so native prebuilds count only on a Linux arm64 host.

import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ADDONS,
  addonPackageName,
  CORE_NAME,
  OUT_DIR,
  upstreamBase,
  VERSION,
} from "../config.mjs";

const args = process.argv.slice(2);
const fromRegistry = args.includes("--registry");
const ignoreScripts = args.includes("--ignore-scripts");
const jsonIndex = args.indexOf("--json");
const jsonOut = jsonIndex === -1 ? null : args[jsonIndex + 1];

const FULL_NAME = addonPackageName("full");
const ALL_NAMES = [
  CORE_NAME,
  ...ADDONS.map((addon) => addonPackageName(addon.id)),
  FULL_NAME,
];
const upstream = upstreamBase();

const COMBINATIONS = [
  { label: "core", packages: [CORE_NAME] },
  ...ADDONS.map((addon) => ({
    label: `core + ${addon.id}`,
    packages: [CORE_NAME, addonPackageName(addon.id)],
  })),
  {
    label: "core + python + js",
    packages: [CORE_NAME, addonPackageName("python"), addonPackageName("js")],
  },
  {
    label: "core + python + js + sqlite",
    packages: [
      CORE_NAME,
      addonPackageName("python"),
      addonPackageName("js"),
      addonPackageName("sqlite"),
    ],
  },
  { label: "full", packages: [FULL_NAME] },
];

const work = mkdtempSync(join(tmpdir(), "slim-size-"));

function npm(cwd, ...npmArgs) {
  return execFileSync("npm", npmArgs, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, npm_config_cache: join(work, "npm-cache") },
    stdio: ["ignore", "pipe", "inherit"],
  });
}

/** Sum of file sizes under `dir`, following symlinks like Convex does. */
function treeSize(dir) {
  let total = 0;
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    total += stat.isDirectory() ? treeSize(path) : stat.size;
  }
  return total;
}

/** Package specifiers to install: tarball paths, or name@version from the registry. */
function specifiers() {
  if (fromRegistry) {
    return Object.fromEntries(ALL_NAMES.map((name) => [name, VERSION]));
  }
  const tarballs = join(work, "tarballs");
  mkdirSync(tarballs);
  return Object.fromEntries(
    ALL_NAMES.map((name) => {
      const [{ filename }] = JSON.parse(
        npm(
          join(OUT_DIR, name),
          "pack",
          "--json",
          "--pack-destination",
          tarballs,
        ),
      );
      return [name, `file:${join(tarballs, filename)}`];
    }),
  );
}

function installedSize(dependencies) {
  const dir = mkdtempSync(join(work, "install-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ dependencies }));
  npm(
    dir,
    "install",
    "--os=linux",
    "--cpu=arm64",
    "--libc=glibc",
    "--no-audit",
    "--no-fund",
    "--no-package-lock",
    ...(ignoreScripts ? ["--ignore-scripts"] : []),
  );
  const size = treeSize(join(dir, "node_modules"));
  rmSync(dir, { recursive: true, force: true });
  return size;
}

function mib(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}

try {
  const specs = specifiers();
  const upstreamSize = installedSize({ "just-bash": upstream.version });
  const rows = COMBINATIONS.map((combination) => {
    // The full package depends on the others by version; tarballs must be
    // listed alongside it so npm does not look them up in the registry.
    const names =
      fromRegistry || combination.label !== "full"
        ? combination.packages
        : ALL_NAMES;
    const size = installedSize(
      Object.fromEntries(names.map((name) => [name, specs[name]])),
    );
    return { label: combination.label, bytes: size };
  });

  const lines = [
    `| Install | Size | vs just-bash@${upstream.version} |`,
    "| --- | ---: | ---: |",
    `| just-bash@${upstream.version} (upstream) | ${mib(upstreamSize)} | 100% |`,
    ...rows.map(
      (row) =>
        `| ${row.label} | ${mib(row.bytes)} | ${((row.bytes / upstreamSize) * 100).toFixed(1)}% |`,
    ),
  ];
  const command = `npm install --os=linux --cpu=arm64 --libc=glibc${ignoreScripts ? " --ignore-scripts" : ""}`;
  const note = `Measured with \`${command}\`${ignoreScripts ? " (native prebuilds not counted)" : ""}, summing every file under node_modules and following symlinks.`;
  console.log(`${lines.join("\n")}\n\n${note}`);
  if (jsonOut) {
    writeFileSync(
      jsonOut,
      `${JSON.stringify({ version: VERSION, upstream: { ...upstream, bytes: upstreamSize }, ignoreScripts, rows }, null, 2)}\n`,
    );
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

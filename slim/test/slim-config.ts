// Runs upstream's test suite against the slim core: upstream's add-on seam is
// replaced by slim/core/addons.ts, heavy imports resolve to the add-on
// packages, and add-ons are found from core's built location in
// slim/dist/node_modules, as they are in an installed app.

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Plugin, ViteUserConfig } from "vitest/config";
import {
  ADDON_ALIASES,
  CORE_NAME,
  OUT_DIR,
  SLIM_ADDONS_MODULE,
  UPSTREAM_ADDONS_MODULE,
  UPSTREAM_DIR,
  UPSTREAM_SRC,
  VERSION,
} from "../config.mjs";

export type SlimMode = "full" | "core";

const CORE_ENTRY = join(OUT_DIR, CORE_NAME, "dist/index.js");

/** Absolute path of an add-on module specifier inside the build output. */
function builtModule(specifier: string): string {
  const [scope, name, ...subpath] = specifier.split("/");
  const packageDir = join(OUT_DIR, scope, name);
  const file = subpath.length > 0 ? `${subpath.join("/")}.js` : "index.js";
  return join(packageDir, file);
}

/** Points upstream's heavy imports at the add-ons, as the core bundle does. */
function redirectAddonImports(mode: SlimMode): Plugin {
  return {
    name: "slim-addon-imports",
    enforce: "pre",
    resolveId(source, importer) {
      // Only upstream's imports: the add-ons import the real libraries.
      if (
        !Object.hasOwn(ADDON_ALIASES, source) ||
        !importer?.startsWith(UPSTREAM_SRC)
      ) {
        return null;
      }
      const addonModule = ADDON_ALIASES[source];
      return mode === "full"
        ? builtModule(addonModule)
        : { id: addonModule, external: true };
    },
  };
}

const replaceAddonSeam: Plugin = {
  name: "slim-addon-seam",
  enforce: "pre",
  resolveId(source, importer) {
    if (!importer || !/(^|\/)addons\.js$/.test(source)) return null;
    const target = resolve(dirname(importer), source).replace(/\.js$/, ".ts");
    return target === UPSTREAM_ADDONS_MODULE ? SLIM_ADDONS_MODULE : null;
  },
};

export function slimConfig(mode: SlimMode): ViteUserConfig {
  if (!existsSync(CORE_ENTRY)) {
    throw new Error(
      "Run `pnpm --filter just-bash-slim build` before the slim tests",
    );
  }
  // Core-only resolves add-ons from its source location, where none are installed.
  const addonBase = mode === "full" ? CORE_ENTRY : SLIM_ADDONS_MODULE;
  return {
    root: UPSTREAM_DIR,
    plugins: [replaceAddonSeam, redirectAddonImports(mode)],
    define: {
      __SLIM_VERSION__: JSON.stringify(VERSION),
      __SLIM_ADDON_BASE__: JSON.stringify(pathToFileURL(addonBase).href),
    },
    test: {
      server: {
        deps: {
          // guarded-fetch must go through vite so the DNS tests' vi.mock of
          // node:dns/promises reaches it; it now loads through the net add-on.
          inline: ["guarded-fetch", /@vinnysaj\/just-bash-net/],
        },
      },
    },
  };
}

// Runs a corpus of cases through one just-bash build and writes the results.
//
//   node runner.mjs <module-url> <cases.json> <results.json>
//
// Each case runs in a fresh Bash. Run every build in its own process:
// defense-in-depth patches globals, so two builds must never share one.

import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const [moduleUrl, casesFile, resultsFile] = process.argv.slice(2);
const { Bash, defineCommand, latin1FromBytes } = await import(moduleUrl);

/**
 * CPython compiled by the python add-on, or `null` for upstream, which has
 * no add-on and no `python.wasmModule` option.
 */
async function pythonModule() {
  let entry;
  try {
    entry = createRequire(moduleUrl).resolve("@vinnysaj/just-bash-python");
  } catch (error) {
    if (error.code === "MODULE_NOT_FOUND") return null;
    throw error;
  }
  const { loadPythonModule } = await import(pathToFileURL(entry).href);
  return loadPythonModule();
}

const CASE_TIMEOUT_MS = 30_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Deterministic stand-in for the `fetch` option; the response depends on the path. */
async function fakeFetch(url, options = {}) {
  const target = new URL(url);
  const method = (options.method ?? "GET").toUpperCase();
  const headers =
    options.headers instanceof Headers
      ? [...options.headers.entries()]
      : Object.entries(options.headers ?? {});
  const sortedHeaders = headers
    .map(([key, value]) => [key.toLowerCase(), value])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const body =
    options.body === undefined
      ? null
      : typeof options.body === "string"
        ? options.body
        : decoder.decode(options.body);
  const respond = (status, statusText, text, extraHeaders = {}) => ({
    status,
    statusText,
    headers: { "content-type": "text/plain", ...extraHeaders },
    body: typeof text === "string" ? encoder.encode(text) : text,
    url,
  });
  switch (target.pathname) {
    case "/notfound":
      return respond(404, "Not Found", "missing\n");
    case "/error":
      return respond(500, "Internal Server Error", "boom\n");
    case "/json":
      return respond(200, "OK", '{"a":1,"b":[1,2],"c":{"d":"e"}}\n', {
        "content-type": "application/json",
      });
    case "/echo":
      return respond(
        200,
        "OK",
        `${JSON.stringify({
          method,
          path: `${target.pathname}${target.search}`,
          headers: sortedHeaders,
          body,
          followRedirects: options.followRedirects ?? null,
        })}\n`,
      );
    case "/binary":
      return respond(
        200,
        "OK",
        Uint8Array.from({ length: 256 }, (_, index) => index),
        { "content-type": "application/octet-stream" },
      );
    case "/redirect":
      if (options.followRedirects) {
        return {
          ...respond(200, "OK", "redirected\n"),
          url: new URL("/final", target).href,
          redirectChain: [
            {
              status: 302,
              statusText: "Found",
              headers: { location: "/final" },
            },
          ],
        };
      }
      return respond(302, "Found", "", { location: "/final" });
    default:
      return respond(200, "OK", `hello from ${target.pathname}\n`);
  }
}

// The spec suite's helper commands (packages/just-bash/src/spec-tests/test-commands.ts).
function pythonRepr(arg) {
  let escaped = "";
  for (let index = 0; index < arg.length; index++) {
    const char = arg[index];
    const code = arg.charCodeAt(index);
    if (char === "\\") escaped += "\\\\";
    else if (char === "\n") escaped += "\\n";
    else if (char === "\r") escaped += "\\r";
    else if (char === "\t") escaped += "\\t";
    else if (code < 0x20 || code === 0x7f || (code >= 0x80 && code <= 0xff)) {
      escaped += `\\x${code.toString(16).padStart(2, "0")}`;
    } else if (code > 0xff) {
      for (const byte of encoder.encode(char)) {
        escaped += `\\x${byte.toString(16).padStart(2, "0")}`;
      }
    } else escaped += char;
  }
  if (arg.includes("'") && !arg.includes('"')) return `"${escaped}"`;
  return `'${escaped.replace(/'/g, "\\'")}'`;
}

const specCommands = [
  defineCommand("argv.py", async (args) => ({
    stdout: `[${args.map(pythonRepr).join(", ")}]\n`,
    stderr: "",
    exitCode: 0,
  })),
  defineCommand("printenv.py", async (args, ctx) => {
    const env = ctx.exportedEnv || ctx.env;
    const output = args
      .map((name) => (env instanceof Map ? env.get(name) : env[name]) ?? "None")
      .join("\n");
    return { stdout: output ? `${output}\n` : "", stderr: "", exitCode: 0 };
  }),
  defineCommand("stdout_stderr.py", async (args) => ({
    stdout: args.length > 0 ? `${args[0]}\n` : "STDOUT\n",
    stderr: "STDERR\n",
    exitCode: 0,
  })),
  defineCommand("read_from_fd.py", async (args, ctx) => {
    const lines = [];
    for (const arg of args) {
      const fd = Number.parseInt(arg, 10);
      if (Number.isNaN(fd)) continue;
      const content =
        fd === 0
          ? latin1FromBytes(ctx.stdin) || ""
          : (ctx.fileDescriptors?.get(fd) ?? "");
      lines.push(`${fd}: ${content.replace(/\n$/, "")}`);
    }
    return {
      stdout: lines.length > 0 ? `${lines.join("\n")}\n` : "",
      stderr: "",
      exitCode: 0,
    };
  }),
];

const PRESETS = {
  default: () => ({}),
  addons: () => ({ python: true, javascript: true }),
  "addons-python-module": async () => {
    const wasmModule = await pythonModule();
    return { python: wasmModule ? { wasmModule } : true, javascript: true };
  },
  fetch: () => ({ fetch: fakeFetch }),
  "fetch-addons": () => ({ fetch: fakeFetch, python: true, javascript: true }),
  "network-denied": () => ({
    network: { allowedUrlPrefixes: ["https://allowed.invalid/api/"] },
  }),
  spec: () => ({
    files: { "/tmp/_keep": "", "/dev/zero": "", "/bin/_keep": "" },
    cwd: "/tmp",
    env: { HOME: "/tmp", TMP: "/tmp", TMPDIR: "/tmp", SH: "bash" },
    customCommands: specCommands,
  }),
};

async function optionsFor(testCase) {
  const preset = PRESETS[testCase.preset];
  if (!preset) throw new Error(`Unknown preset ${testCase.preset}`);
  const options = await preset();
  if (testCase.files) options.files = { ...options.files, ...testCase.files };
  if (testCase.cwd) options.cwd = testCase.cwd;
  if (testCase.env) options.env = { ...options.env, ...testCase.env };
  return options;
}

function describeError(error) {
  return error instanceof Error
    ? `${error.name}: ${error.message}`
    : String(error);
}

async function runCase(testCase) {
  let bash;
  try {
    bash = new Bash(await optionsFor(testCase));
    if (testCase.preset === "spec") await bash.fs.chmod("/tmp", 0o1777);
  } catch (error) {
    return { error: `constructor: ${describeError(error)}` };
  }
  try {
    const result = await bash.exec(testCase.script, {
      rawScript: testCase.rawScript ?? false,
      signal: AbortSignal.timeout(CASE_TIMEOUT_MS),
    });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  } catch (error) {
    return { error: `exec: ${describeError(error)}` };
  }
}

let current = "(none)";
process.on("uncaughtException", (error) => {
  console.error(`runner crashed during ${current}:`, error);
  process.exit(2);
});

const cases = JSON.parse(readFileSync(casesFile, "utf8"));
const results = Object.create(null);
for (const testCase of cases) {
  current = testCase.id;
  results[testCase.id] = await runCase(testCase);
}
writeFileSync(resultsFile, JSON.stringify(results));
// Workers and timers from python3/js-exec must not keep the runner alive.
process.exit(0);

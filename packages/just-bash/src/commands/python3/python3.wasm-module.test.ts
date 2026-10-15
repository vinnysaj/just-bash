import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { Bash } from "../../Bash.js";

describe("python3 with a precompiled CPython module", () => {
  it("rejects a wasmModule that is not a WebAssembly.Module", () => {
    expect(
      () =>
        new Bash({
          python: {
            wasmModule: new Uint8Array() as unknown as WebAssembly.Module,
          },
        }),
    ).toThrow(new TypeError("python.wasmModule must be a WebAssembly.Module"));
  });

  it(
    "runs python3 from the module passed as python.wasmModule",
    { timeout: 60000 },
    async () => {
      const wasmModule = await WebAssembly.compile(
        await readFile(
          new URL(
            "../../../vendor/cpython-emscripten/python.wasm",
            import.meta.url,
          ),
        ),
      );
      const bash = new Bash({ python: { wasmModule } });
      const first = await bash.exec("python3 -c 'print(6 * 7)'");
      const second = await bash.exec(
        "python3 -c 'import json; print(json.dumps([1, 2]))'",
      );
      expect(first).toMatchObject({ stdout: "42\n", stderr: "", exitCode: 0 });
      expect(second).toMatchObject({
        stdout: "[1, 2]\n",
        stderr: "",
        exitCode: 0,
      });
    },
  );
});

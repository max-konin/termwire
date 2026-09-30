import { describe, expect, test } from "bun:test";
import { createNvim } from "./create-nvim.js";
import type { Exec, ExecResult } from "./process.js";

const result = (exitCode: number, stdout = "", stderr = ""): ExecResult => ({
  exitCode,
  stdout,
  stderr,
});

describe("createNvim", () => {
  test("exposes isRunning and openFile bound to the supplied executor", async () => {
    const exec: Exec = async () => result(0, "1\n");
    const nvim = createNvim({ exec });

    expect(nvim).toHaveProperty("isRunning");
    expect(nvim).toHaveProperty("openFile");
    expect(await nvim.isRunning("/tmp/editor.sock")).toBe(true);
  });
});

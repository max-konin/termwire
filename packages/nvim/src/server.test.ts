import { describe, expect, test } from "bun:test";
import { createNvim, type Exec, type ExecResult } from "./index";
import { isRunning } from "./server";

const result = (exitCode: number, stdout = "", stderr = ""): ExecResult => ({
  exitCode,
  stdout,
  stderr,
});

describe("isRunning", () => {
  test("can be called directly with an executor", async () => {
    const exec: Exec = async () => result(0, "1\n");

    expect(await isRunning(exec, "/tmp/editor.sock")).toBe(true);
  });

  test("uses the remote expression probe for a responsive server", async () => {
    const calls: string[][] = [];
    const exec: Exec = async (argv) => {
      calls.push([...argv]);
      return result(0, "1\n");
    };
    const nvim = createNvim({ exec });

    expect(await nvim.isRunning("/tmp/editor.sock")).toBe(true);
    expect(calls).toEqual([
      ["nvim", "--headless", "--server", "/tmp/editor.sock", "--remote-expr", "1"],
    ]);
  });

  test("returns false for unavailable or malformed probes", async () => {
    for (const execution of [result(1), result(0, "not one\n")]) {
      const exec: Exec = async () => execution;
      const nvim = createNvim({ exec });

      expect(await nvim.isRunning("/tmp/editor.sock")).toBe(false);
    }
  });

  test("validates the socket before execution", async () => {
    const exec: Exec = async () => result(0, "1\n");
    const nvim = createNvim({ exec });

    await expect(nvim.isRunning(" ")).rejects.toMatchObject({ field: "socket" });
  });

  test("reports executor launch failures as typed execution errors", async () => {
    const cause = new Error("socket unavailable");
    const exec: Exec = async () => Promise.reject(cause);
    const nvim = createNvim({ exec });

    await expect(nvim.isRunning("/tmp/editor.sock")).rejects.toMatchObject({
      exitCode: null,
      cause,
    });
  });
});

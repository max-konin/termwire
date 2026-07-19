import { describe, expect, test } from "bun:test";
import { openFile } from "./file";
import { createNvim, type Exec, type ExecResult } from "./index";

const result = (exitCode: number, stdout = "", stderr = ""): ExecResult => ({
  exitCode,
  stdout,
  stderr,
});

describe("openFile", () => {
  test("opens a file through Neovim remote RPC", async () => {
    const calls: string[][] = [];
    const exec: Exec = async (argv) => {
      calls.push([...argv]);
      return result(0);
    };

    expect(await openFile(exec, "/tmp/editor.sock", "/tmp/a file $x.ts")).toBeUndefined();
    expect(calls).toEqual([
      ["nvim", "--headless", "--server", "/tmp/editor.sock", "--remote", "/tmp/a file $x.ts"],
    ]);
  });

  test("is exposed by the factory", async () => {
    const exec: Exec = async () => result(0);
    const nvim = createNvim({ exec });

    expect(nvim).toHaveProperty("openFile");
    expect(await nvim.openFile("/tmp/editor.sock", "/tmp/file.ts")).toBeUndefined();
  });

  test("validates the file path before execution", async () => {
    const calls: string[][] = [];
    const exec: Exec = async (argv) => {
      calls.push([...argv]);
      return result(0);
    };

    await expect(openFile(exec, "/tmp/editor.sock", " ")).rejects.toMatchObject({ field: "file" });
    expect(calls).toEqual([]);
  });

  test("reports a failed file open as a command error", async () => {
    const exec: Exec = async () => result(2, "", "unable to open file");

    await expect(openFile(exec, "/tmp/editor.sock", "/tmp/file.ts")).rejects.toMatchObject({
      command: ["nvim", "--headless", "--server", "/tmp/editor.sock", "--remote", "/tmp/file.ts"],
      exitCode: 2,
      stderr: "unable to open file",
    });
  });

  test("jumps to the requested line after opening the file", async () => {
    const calls: string[][] = [];
    const exec: Exec = async (argv) => {
      calls.push([...argv]);
      return result(0);
    };

    expect(await openFile(exec, "/tmp/editor.sock", "/tmp/file.ts", 42)).toBeUndefined();
    expect(calls).toEqual([
      ["nvim", "--headless", "--server", "/tmp/editor.sock", "--remote", "/tmp/file.ts"],
      ["nvim", "--headless", "--server", "/tmp/editor.sock", "--remote-send", "<C-\\><C-N>42G"],
    ]);
  });

  test("validates line numbers before execution", async () => {
    for (const line of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const calls: string[][] = [];
      const exec: Exec = async (argv) => {
        calls.push([...argv]);
        return result(0);
      };

      await expect(openFile(exec, "/tmp/editor.sock", "/tmp/file.ts", line)).rejects.toMatchObject({
        field: "line",
      });
      expect(calls).toEqual([]);
    }
  });

  test("reports a failed line jump without embedding the file path in its command", async () => {
    const file = "/tmp/a file $x.ts";
    const calls: string[][] = [];
    const executions = [result(0), result(2, "", "jump failed")];
    const exec: Exec = async (argv) => {
      calls.push([...argv]);
      return executions.shift() as ExecResult;
    };

    await expect(openFile(exec, "/tmp/editor.sock", file, 42)).rejects.toMatchObject({
      command: [
        "nvim",
        "--headless",
        "--server",
        "/tmp/editor.sock",
        "--remote-send",
        "<C-\\><C-N>42G",
      ],
      exitCode: 2,
      stderr: "jump failed",
    });
    expect(calls[1]).not.toContain(file);
  });
});

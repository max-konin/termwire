import { describe, expect, test } from "bun:test";
import { CommandError, type Exec, type ExecResult, execute, spawnExec } from "./process.js";

const result = (exitCode: number, stdout = "", stderr = ""): ExecResult => ({
  exitCode,
  stdout,
  stderr,
});

describe("execute", () => {
  test("returns the executor result", async () => {
    const expected = result(0, "ok");
    const exec: Exec = async () => expected;

    expect(await execute(exec, ["nvim", "--version"])).toBe(expected);
  });

  test("wraps launch failures with a null exit code and preserved cause", async () => {
    const cause = new Error("missing nvim");
    const exec: Exec = async () => Promise.reject(cause);

    await expect(execute(exec, ["nvim"])).rejects.toMatchObject({
      command: ["nvim"],
      exitCode: null,
      cause,
    });
  });
});

describe("CommandError", () => {
  test("creates an error from a completed command", () => {
    const error = CommandError.from(["nvim"], result(2, "", "failed"));

    expect(error).toMatchObject({
      command: ["nvim"],
      exitCode: 2,
      stderr: "failed",
    });
  });
});

describe("spawnExec", () => {
  test("captures stdout, stderr, and exit code", async () => {
    expect(
      await spawnExec([process.execPath, "-e", "console.log('ok'); console.error('warn')"]),
    ).toEqual(result(0, "ok\n", "warn\n"));
  });

  test("reports a nonzero exit code", async () => {
    expect(await spawnExec([process.execPath, "-e", "process.exit(3)"])).toEqual(result(3));
  });

  test("rejects an empty command and a missing binary", async () => {
    await expect(spawnExec([])).rejects.toThrow("command must not be empty");
    await expect(spawnExec(["termwire-missing-binary-probe"])).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});

import { describe, expect, test } from "bun:test";
import { bunExec, CommandError, type Exec, type ExecResult, execute } from "./process";

const result = (exitCode: number, stdout = "", stderr = ""): ExecResult => ({
  exitCode,
  stdout,
  stderr,
});

describe("execute", () => {
  test("returns the executor result", async () => {
    const expected = result(0, "ok");
    const exec: Exec = async () => expected;

    await expect(execute(exec, ["nvim", "--version"])).resolves.toBe(expected);
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

describe("bunExec", () => {
  test("captures stdout, stderr, and exit code", async () => {
    await expect(
      bunExec(["bun", "-e", "console.log('ok'); console.error('warn')"]),
    ).resolves.toEqual(result(0, "ok\n", "warn\n"));
  });
});

import { describe, expect, test } from "bun:test";
import { CommandError, type Exec, type ExecResult, execute, spawnExec } from "./process.js";

const result = (exitCode: number, stdout = "", stderr = ""): ExecResult => ({
  exitCode,
  stdout,
  stderr,
});

describe("execute", () => {
  test("returns the executor result", async () => {
    const expected = result(0, "ok\n");
    const exec: Exec = async () => expected;

    expect(await execute(exec, ["tmux", "-V"])).toBe(expected);
  });

  test("wraps a rejected executor with a null exit code and preserved cause", async () => {
    const cause = new Error("could not start");
    const exec: Exec = async () => Promise.reject(cause);

    await expect(execute(exec, ["tmux", "-V"])).rejects.toMatchObject({
      argv: ["tmux", "-V"],
      exitCode: null,
      cause,
    });
  });
});

describe("CommandError.from", () => {
  test("creates an error from a command result", () => {
    const error = CommandError.from(["tmux", "has-session"], result(2, "", "bad target"));

    expect(error).toMatchObject({
      argv: ["tmux", "has-session"],
      exitCode: 2,
      stderr: "bad target",
    });
  });

  test("includes the failed command, exit status, and stderr in its message", () => {
    const error = CommandError.from(["tmux", "new-session"], result(2, "", "duplicate session"));

    expect(error.message).toBe("Command failed (exit 2): tmux new-session: duplicate session");
  });
});

describe("spawnExec", () => {
  test("captures stdout, stderr, and exit code", async () => {
    expect(await spawnExec([process.execPath, "-e", "console.log('ok')"])).toEqual(
      result(0, "ok\n"),
    );
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

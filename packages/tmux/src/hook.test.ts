import { describe, expect, mock, test } from "bun:test";
import { parseHooks, setHook, showHooks, unsetHook } from "./hook.js";
import { CommandError, type Exec, type ExecResult } from "./process.js";
import { ValidationError } from "./validation.js";

const result = (exitCode: number, stdout = "", stderr = ""): ExecResult => ({
  exitCode,
  stdout,
  stderr,
});

describe("parseHooks", () => {
  test("reads indexed and plain hook entries", () => {
    const stdout = [
      'session-closed[0] run-shell -b "first"',
      'session-closed[1] run-shell -b "second"',
      "client-attached set-option status on",
      "",
      "   ",
    ].join("\n");

    expect(parseHooks(stdout)).toEqual([
      { name: "session-closed", index: 0, command: 'run-shell -b "first"' },
      { name: "session-closed", index: 1, command: 'run-shell -b "second"' },
      { name: "client-attached", command: "set-option status on" },
    ]);
  });

  test("keeps a command that itself contains spaces and brackets", () => {
    const stdout = "session-closed[2] run-shell -b \"cmd _reap '#{hook_session_name}'\"";

    expect(parseHooks(stdout)).toEqual([
      {
        name: "session-closed",
        index: 2,
        command: "run-shell -b \"cmd _reap '#{hook_session_name}'\"",
      },
    ]);
  });

  test("skips lines without a hook name", () => {
    expect(parseHooks("[3] orphan\nsession closed\n")).toEqual([
      { name: "session", command: "closed" },
    ]);
  });
});

describe("showHooks", () => {
  test("reads global hooks", async () => {
    const exec = mock(async (..._args: Parameters<Exec>) =>
      result(0, 'session-closed[0] run-shell -b "first"\n'),
    );

    expect(await showHooks(exec, { global: true })).toEqual([
      { name: "session-closed", index: 0, command: 'run-shell -b "first"' },
    ]);
    expect(exec.mock.calls).toEqual([[["tmux", "show-hooks", "-g"], undefined]]);
  });

  test("reads session hooks without the global flag", async () => {
    const exec = mock(async (..._args: Parameters<Exec>) => result(0, ""));

    expect(await showHooks(exec)).toEqual([]);
    expect(exec.mock.calls).toEqual([[["tmux", "show-hooks"], undefined]]);
  });

  test("reports command failure", async () => {
    const exec: Exec = async () => result(1, "", "tmux error");

    await expect(showHooks(exec, { global: true })).rejects.toBeInstanceOf(CommandError);
  });
});

describe("setHook", () => {
  test.each([
    [{ global: true, append: true }, "-ga"],
    [{ global: true }, "-g"],
    [{ append: true }, "-a"],
  ] as const)("passes %o as flags", async (options, flag) => {
    const exec = mock(async (..._args: Parameters<Exec>) => result(0));

    await setHook(exec, { name: "session-closed", command: "run-shell -b 'x'", ...options });

    expect(exec.mock.calls).toEqual([
      [["tmux", "set-hook", flag, "session-closed", "run-shell -b 'x'"], undefined],
    ]);
  });

  test("replaces one indexed entry without flags beyond -g", async () => {
    const exec = mock(async (..._args: Parameters<Exec>) => result(0));

    await setHook(exec, {
      name: "session-closed[2]",
      command: "run-shell -b 'x'",
      global: true,
    });

    expect(exec.mock.calls).toEqual([
      [["tmux", "set-hook", "-g", "session-closed[2]", "run-shell -b 'x'"], undefined],
    ]);
  });

  test.each([
    ["name", { name: " ", command: "run-shell -b 'x'" }],
    ["command", { name: "session-closed", command: " " }],
  ])("rejects an empty %s before execution", async (_label, options) => {
    const exec = mock(async (..._args: Parameters<Exec>) => result(0));

    await expect(setHook(exec, options)).rejects.toBeInstanceOf(ValidationError);
    expect(exec).not.toHaveBeenCalled();
  });

  test("reports command failure", async () => {
    const exec: Exec = async () => result(1, "", "tmux error");

    await expect(
      setHook(exec, { name: "session-closed", command: "run-shell -b 'x'", global: true }),
    ).rejects.toBeInstanceOf(CommandError);
  });
});

describe("unsetHook", () => {
  test.each([
    [true, "-gu"],
    [false, "-u"],
  ])("unsets with global %p", async (global, flag) => {
    const exec = mock(async (..._args: Parameters<Exec>) => result(0));

    await unsetHook(exec, { name: "session-closed[1]", global });

    expect(exec.mock.calls).toEqual([[["tmux", "set-hook", flag, "session-closed[1]"], undefined]]);
  });

  test("reports command failure", async () => {
    const exec: Exec = async () => result(1, "", "tmux error");

    await expect(
      unsetHook(exec, { name: "session-closed[1]", global: true }),
    ).rejects.toBeInstanceOf(CommandError);
  });
});

import { describe, expect, test } from "bun:test";
import { CommandError, type Exec, type ExecResult } from "./process";
import { hasSession, newSession } from "./session";
import { ValidationError } from "./validation";

const result = (exitCode: number, stdout = "", stderr = ""): ExecResult => ({
  exitCode,
  stdout,
  stderr,
});

describe("hasSession", () => {
  test("uses an exact target and reports an existing session", async () => {
    const calls: string[][] = [];
    const exec: Exec = async (argv) => {
      calls.push([...argv]);
      return result(0);
    };

    expect(await hasSession(exec, "project")).toBe(true);
    expect(calls).toEqual([["tmux", "has-session", "-t", "=project"]]);
  });

  test.each([
    [1, false],
    [2, "error"],
  ])("handles exit code %i", async (exitCode, expected) => {
    const exec: Exec = async () => result(exitCode, "", "tmux error");

    if (typeof expected === "boolean") {
      await expect(hasSession(exec, "project")).resolves.toBe(expected);
    } else {
      await expect(hasSession(exec, "project")).rejects.toBeInstanceOf(CommandError);
    }
  });

  test("reports command failure details", async () => {
    const exec: Exec = async () => result(2, "", "tmux error");

    await expect(hasSession(exec, "project")).rejects.toMatchObject({
      argv: ["tmux", "has-session", "-t", "=project"],
      exitCode: 2,
      stderr: "tmux error",
    });
  });

  test("rejects an empty session before execution", async () => {
    const exec: Exec = async () => result(0);

    await expect(hasSession(exec, " ")).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("newSession", () => {
  test("creates a detached session with machine-readable ids", async () => {
    const calls: string[][] = [];
    const exec: Exec = async (argv) => {
      calls.push([...argv]);
      return result(0, "@1\t%1\n");
    };

    await expect(
      newSession(exec, {
        session: "project",
        cwd: "/tmp/project dir",
        command: ["true"],
        environment: { PROJECT_ROLE: "workspace", OMITTED: undefined },
      }),
    ).resolves.toEqual({ windowId: "@1", paneId: "%1" });
    expect(calls).toEqual([
      [
        "tmux",
        "new-session",
        "-d",
        "-s",
        "project",
        "-P",
        "-F",
        "#{window_id}\t#{pane_id}",
        "-c",
        "/tmp/project dir",
        "-e",
        "PROJECT_ROLE=workspace",
        "true",
      ],
    ]);
  });

  test("creates a minimal detached session", async () => {
    const calls: string[][] = [];
    const exec: Exec = async (argv) => {
      calls.push([...argv]);
      return result(0, "@1\t%1\n");
    };

    await expect(newSession(exec, { session: "project" })).resolves.toEqual({
      windowId: "@1",
      paneId: "%1",
    });
    expect(calls).toEqual([
      ["tmux", "new-session", "-d", "-s", "project", "-P", "-F", "#{window_id}\t#{pane_id}"],
    ]);
  });

  test.each([
    [{ session: "" }, "session"],
    [{ session: "project", command: [] }, "command"],
    [{ session: "project", command: [""] }, "command"],
  ] as const)("rejects invalid input before execution", async (options, field) => {
    const calls: string[][] = [];
    const exec: Exec = async (argv) => {
      calls.push([...argv]);
      return result(0);
    };

    await expect(newSession(exec, options)).rejects.toMatchObject({ field });
    expect(calls).toEqual([]);
  });

  test("reports a nonzero tmux exit", async () => {
    const exec: Exec = async () => result(2, "", "session failed");

    await expect(newSession(exec, { session: "project" })).rejects.toMatchObject({
      argv: ["tmux", "new-session", "-d", "-s", "project", "-P", "-F", "#{window_id}\t#{pane_id}"],
      exitCode: 2,
      stderr: "session failed",
    });
  });

  test("rejects malformed tmux id output", async () => {
    const exec: Exec = async () => result(0, "@1\n");

    await expect(newSession(exec, { session: "project" })).rejects.toBeInstanceOf(ValidationError);
  });
});

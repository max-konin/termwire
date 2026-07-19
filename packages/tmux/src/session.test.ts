import { describe, expect, mock, test } from "bun:test";
import { CommandError, type Exec, type ExecResult } from "./process";
import { hasSession, killSession, newSession, setEnvironment } from "./session";
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
      expect(await hasSession(exec, "project")).toBe(expected);
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
    const exec = mock(async (..._args: Parameters<Exec>) => result(0, "@1\t%1\n"));

    expect(
      await newSession(exec, {
        session: "project",
        name: "editor",
        cwd: "/tmp/project dir",
        command: ["true"],
        environment: { PROJECT_ROLE: "workspace", OMITTED: undefined },
      }),
    ).toEqual({ windowId: "@1", paneId: "%1" });
    expect(exec.mock.calls).toEqual([
      [
        [
          "tmux",
          "new-session",
          "-d",
          "-s",
          "project",
          "-n",
          "editor",
          "-P",
          "-F",
          "#{window_id}\t#{pane_id}",
          "-c",
          "/tmp/project dir",
          "-e",
          "PROJECT_ROLE=workspace",
          "true",
        ],
      ],
    ]);
  });

  test("creates a minimal detached session", async () => {
    const calls: string[][] = [];
    const exec: Exec = async (argv) => {
      calls.push([...argv]);
      return result(0, "@1\t%1\n");
    };

    expect(await newSession(exec, { session: "project" })).toEqual({
      windowId: "@1",
      paneId: "%1",
    });
    expect(calls).toEqual([
      ["tmux", "new-session", "-d", "-s", "project", "-P", "-F", "#{window_id}\t#{pane_id}"],
    ]);
  });

  test.each([
    [{ session: "" }, "session"],
    [{ session: "project", name: "" }, "name"],
    [{ session: "project", command: [] }, "command"],
    [{ session: "project", command: [""] }, "command"],
  ] as const)("rejects invalid input before execution", async (options, field) => {
    const exec = mock(async (..._args: Parameters<Exec>) => result(0));

    await expect(newSession(exec, options)).rejects.toMatchObject({ field });
    expect(exec).not.toHaveBeenCalled();
  });

  test("reports a nonzero tmux exit", async () => {
    const exec = mock(async (..._args: Parameters<Exec>) => result(2, "", "session failed"));

    await expect(newSession(exec, { session: "project" })).rejects.toMatchObject({
      argv: ["tmux", "new-session", "-d", "-s", "project", "-P", "-F", "#{window_id}\t#{pane_id}"],
      exitCode: 2,
      stderr: "session failed",
    });
    expect(exec.mock.calls).toEqual([
      [["tmux", "new-session", "-d", "-s", "project", "-P", "-F", "#{window_id}\t#{pane_id}"]],
    ]);
  });

  test("cleans up the session when successful creation returns malformed ids", async () => {
    const exec = mock(async (...[argv]: Parameters<Exec>) => {
      if (argv[1] === "new-session") return result(0, "@1\n");
      return result(0);
    });

    await expect(newSession(exec, { session: "project" })).rejects.toBeInstanceOf(ValidationError);
    expect(exec.mock.calls).toEqual([
      [["tmux", "new-session", "-d", "-s", "project", "-P", "-F", "#{window_id}\t#{pane_id}"]],
      [["tmux", "kill-session", "-t", "=project"]],
    ]);
  });

  test("preserves malformed id errors when cleanup fails", async () => {
    const exec = mock(async (...[argv]: Parameters<Exec>) => {
      if (argv[1] === "new-session") return result(0, "@1\n");
      return result(2, "", "cleanup failed");
    });

    await expect(newSession(exec, { session: "project" })).rejects.toBeInstanceOf(ValidationError);
    expect(exec.mock.calls).toEqual([
      [["tmux", "new-session", "-d", "-s", "project", "-P", "-F", "#{window_id}\t#{pane_id}"]],
      [["tmux", "kill-session", "-t", "=project"]],
    ]);
  });
});

describe("session lifecycle", () => {
  test("sets an environment value on an exact session target", async () => {
    const exec = mock(async (..._args: Parameters<Exec>) => result(0));

    expect(
      await setEnvironment(exec, "demo", "OPENBRIDGE_SOCKET", "/tmp/demo.sock"),
    ).toBeUndefined();
    expect(exec).toHaveBeenCalledWith(
      ["tmux", "set-environment", "-t", "=demo", "OPENBRIDGE_SOCKET", "/tmp/demo.sock"],
      undefined,
    );
  });

  test("kills an exact session target", async () => {
    const exec = mock(async (..._args: Parameters<Exec>) => result(0));

    expect(await killSession(exec, "demo")).toBeUndefined();
    expect(exec).toHaveBeenCalledWith(["tmux", "kill-session", "-t", "=demo"], undefined);
  });

  test.each([
    ["setEnvironment", (exec: Exec) => setEnvironment(exec, "", "KEY", "value"), "session"],
    ["setEnvironment", (exec: Exec) => setEnvironment(exec, "demo", "", "value"), "key"],
    ["setEnvironment", (exec: Exec) => setEnvironment(exec, "demo", "KEY", ""), "value"],
    ["killSession", (exec: Exec) => killSession(exec, ""), "session"],
  ])("%s rejects an empty %s before execution", async (_method, action, field) => {
    const exec = mock(async (..._args: Parameters<Exec>) => result(0));

    await expect(action(exec)).rejects.toMatchObject({ field });
    expect(exec).not.toHaveBeenCalled();
  });

  test.each([
    ["setEnvironment", (exec: Exec) => setEnvironment(exec, "demo", "KEY", "value")],
    ["killSession", (exec: Exec) => killSession(exec, "demo")],
  ])("%s turns a nonzero result into CommandError", async (_method, action) => {
    const exec = mock(async (..._args: Parameters<Exec>) => result(2, "", "tmux failed"));

    await expect(action(exec)).rejects.toBeInstanceOf(CommandError);
  });
});

import { describe, expect, mock, test } from "bun:test";
import { CommandError, type Exec, type ExecResult } from "./process.js";
import {
  hasSession,
  killSession,
  listSessions,
  newSession,
  parseEnvironment,
  parseSessionList,
  setEnvironment,
  setSessionTitle,
  showEnvironment,
} from "./session.js";
import { ValidationError } from "./validation.js";

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

    expect(await setEnvironment(exec, "demo", "TERMWIRE_SOCKET", "/tmp/demo.sock")).toBeUndefined();
    expect(exec).toHaveBeenCalledWith(
      ["tmux", "set-environment", "-t", "=demo", "TERMWIRE_SOCKET", "/tmp/demo.sock"],
      undefined,
    );
  });

  test("sets the session title with exact commands in sequence", async () => {
    const calls: string[][] = [];
    const exec: Exec = async (argv) => {
      calls.push([...argv]);
      return result(0);
    };

    await setSessionTitle(exec, "demo");

    expect(calls).toEqual([
      ["tmux", "set-option", "-t", "demo", "set-titles", "on"],
      ["tmux", "set-option", "-t", "demo", "set-titles-string", "#{session_name}"],
    ]);
  });

  test("does not execute the second title command when the first fails", async () => {
    const calls: string[][] = [];
    const exec: Exec = async (argv) => {
      calls.push([...argv]);
      return result(2, "", "tmux failed");
    };

    await expect(setSessionTitle(exec, "demo")).rejects.toMatchObject({
      argv: ["tmux", "set-option", "-t", "demo", "set-titles", "on"],
      exitCode: 2,
      stderr: "tmux failed",
    });
    expect(calls).toEqual([["tmux", "set-option", "-t", "demo", "set-titles", "on"]]);
  });

  test("rejects an empty session before setting the title", async () => {
    const exec = mock(async (..._args: Parameters<Exec>) => result(0));

    await expect(setSessionTitle(exec, " ")).rejects.toMatchObject({ field: "session" });
    expect(exec).not.toHaveBeenCalled();
  });

  test("turns a second title command failure into CommandError", async () => {
    const exec = mock(async (..._args: Parameters<Exec>) => {
      if (exec.mock.calls.length === 1) return result(0);
      return result(2, "", "title failed");
    });

    await expect(setSessionTitle(exec, "demo")).rejects.toMatchObject({
      argv: ["tmux", "set-option", "-t", "demo", "set-titles-string", "#{session_name}"],
      exitCode: 2,
      stderr: "title failed",
    });
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

describe("listSessions", () => {
  test("asks for a tab-separated listing and reads every field", async () => {
    const exec = mock(async (..._args: Parameters<Exec>) =>
      result(0, "termwire-dev\t1\t/repo\ntermwire-demo\t0\t/repo-demo\n"),
    );

    expect(await listSessions(exec)).toEqual([
      { name: "termwire-dev", attached: true, path: "/repo" },
      { name: "termwire-demo", attached: false, path: "/repo-demo" },
    ]);
    expect(exec.mock.calls).toEqual([
      [["tmux", "list-sessions", "-F", "#{session_name}\t#{session_attached}\t#{session_path}"]],
    ]);
  });

  // Both messages are tmux's own, from different versions; only the exit code is stable.
  test.each([
    ["error connecting to /private/tmp/tmux-501/default (No such file or directory)"],
    ["no server running on /tmp/tmux-501/default"],
  ])("reads an empty list when the server is absent: %p", async (stderr) => {
    const exec: Exec = async () => result(1, "", stderr);

    expect(await listSessions(exec)).toEqual([]);
  });

  test("turns any other nonzero result into CommandError", async () => {
    const exec: Exec = async () => result(2, "", "tmux failed");

    await expect(listSessions(exec)).rejects.toBeInstanceOf(CommandError);
  });
});

describe("parseSessionList", () => {
  test.each([
    ["demo\t2\t/repo", [{ name: "demo", attached: true, path: "/repo" }]],
    ["demo\t0\t/with\ttab", [{ name: "demo", attached: false, path: "/with\ttab" }]],
    ["", []],
    ["   \n", []],
    ["demo", []],
    ["demo\t0", []],
    ["\t0\t/repo", []],
  ])("reads %p", (stdout, expected) => {
    expect(parseSessionList(stdout)).toEqual(expected);
  });
});

describe("showEnvironment", () => {
  test("reads the session environment from an exact target", async () => {
    const exec = mock(async (..._args: Parameters<Exec>) =>
      result(0, "TERMWIRE_SESSION=repo-dev\nTERMWIRE_SOCKET=/tmp/termwire/repo-dev.sock\n"),
    );

    expect(await showEnvironment(exec, "repo-dev")).toEqual({
      TERMWIRE_SESSION: "repo-dev",
      TERMWIRE_SOCKET: "/tmp/termwire/repo-dev.sock",
    });
    expect(exec.mock.calls).toEqual([[["tmux", "show-environment", "-t", "=repo-dev"]]]);
  });

  test("reads an empty environment for a session that closed meanwhile", async () => {
    const exec: Exec = async () => result(1, "", "no such session: =repo-dev");

    expect(await showEnvironment(exec, "repo-dev")).toEqual({});
  });

  test("turns any other nonzero result into CommandError", async () => {
    const exec: Exec = async () => result(2, "", "tmux failed");

    await expect(showEnvironment(exec, "repo-dev")).rejects.toBeInstanceOf(CommandError);
  });

  test("rejects an empty session before execution", async () => {
    const exec = mock(async (..._args: Parameters<Exec>) => result(0));

    await expect(showEnvironment(exec, " ")).rejects.toMatchObject({ field: "session" });
    expect(exec).not.toHaveBeenCalled();
  });
});

describe("parseEnvironment", () => {
  test.each([
    ["NAME=value", { NAME: "value" }],
    ["NAME=with=equals", { NAME: "with=equals" }],
    ["-REMOVED\nNAME=value", { NAME: "value" }],
    ["NAME=\n", { NAME: "" }],
    ["malformed\n\n=orphan", {}],
  ])("reads %p", (stdout, expected) => {
    expect(parseEnvironment(stdout)).toEqual(expected);
  });
});

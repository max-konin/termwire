import { describe, expect, test } from "bun:test";
import type { Exec, ExecResult } from "./process";
import { ValidationError } from "./validation";
import { newWindow, selectWindow } from "./window";

const result = (exitCode: number, stdout = "", stderr = ""): ExecResult => ({
  exitCode,
  stdout,
  stderr,
});

describe("newWindow", () => {
  test("creates a detached window against an exact session target", async () => {
    const calls: string[][] = [];
    const exec: Exec = async (argv) => {
      calls.push([...argv]);
      return result(0, "@2\t%3\n");
    };

    await expect(
      newWindow(exec, {
        target: "project",
        cwd: "/tmp/project dir",
        command: ["true"],
        environment: { WINDOW_ROLE: "workspace", OMITTED: undefined },
      }),
    ).resolves.toEqual({ windowId: "@2", paneId: "%3" });
    expect(calls).toEqual([
      [
        "tmux",
        "new-window",
        "-d",
        "-t",
        "=project",
        "-P",
        "-F",
        "#{window_id}\t#{pane_id}",
        "-c",
        "/tmp/project dir",
        "-e",
        "WINDOW_ROLE=workspace",
        "true",
      ],
    ]);
  });

  test("creates a minimal detached window", async () => {
    const calls: string[][] = [];
    const exec: Exec = async (argv) => {
      calls.push([...argv]);
      return result(0, "@2\t%3\n");
    };

    await expect(newWindow(exec, { target: "project" })).resolves.toEqual({
      windowId: "@2",
      paneId: "%3",
    });
    expect(calls).toEqual([
      ["tmux", "new-window", "-d", "-t", "=project", "-P", "-F", "#{window_id}\t#{pane_id}"],
    ]);
  });

  test.each([
    [{ target: "" }, "target"],
    [{ target: "project", command: [] }, "command"],
    [{ target: "project", command: [""] }, "command"],
  ] as const)("rejects invalid input before execution", async (options, field) => {
    const calls: string[][] = [];
    const exec: Exec = async (argv) => {
      calls.push([...argv]);
      return result(0);
    };

    await expect(newWindow(exec, options)).rejects.toMatchObject({ field });
    expect(calls).toEqual([]);
  });

  test("reports a nonzero tmux exit", async () => {
    const exec: Exec = async () => result(2, "", "window failed");

    await expect(newWindow(exec, { target: "project" })).rejects.toMatchObject({
      argv: ["tmux", "new-window", "-d", "-t", "=project", "-P", "-F", "#{window_id}\t#{pane_id}"],
      exitCode: 2,
      stderr: "window failed",
    });
  });

  test("rejects blank tmux id output", async () => {
    const exec: Exec = async () => result(0, " \n");

    await expect(newWindow(exec, { target: "project" })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("selectWindow", () => {
  test("selects an exact window target", async () => {
    const calls: string[][] = [];
    const exec: Exec = async (argv) => {
      calls.push([...argv]);
      return result(0);
    };

    await expect(selectWindow(exec, "@2")).resolves.toBeUndefined();
    expect(calls).toEqual([["tmux", "select-window", "-t", "@2"]]);
  });

  test("rejects an empty target before execution", async () => {
    const calls: string[][] = [];
    const exec: Exec = async (argv) => {
      calls.push([...argv]);
      return result(0);
    };

    await expect(selectWindow(exec, "")).rejects.toBeInstanceOf(ValidationError);
    expect(calls).toEqual([]);
  });

  test("reports a nonzero tmux exit", async () => {
    const exec: Exec = async () => result(2, "", "selection failed");

    await expect(selectWindow(exec, "@2")).rejects.toMatchObject({
      argv: ["tmux", "select-window", "-t", "@2"],
      exitCode: 2,
      stderr: "selection failed",
    });
  });
});

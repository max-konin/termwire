import { describe, expect, mock, test } from "bun:test";
import { respawnPane, selectPane, sendKeys, splitPane } from "./pane";
import { CommandError, type Exec, type ExecResult } from "./process";
import { ValidationError } from "./validation";

const result = (exitCode: number, stdout = "", stderr = ""): ExecResult => ({
  exitCode,
  stdout,
  stderr,
});

describe("splitPane", () => {
  test("creates a horizontal detached pane with an exact target", async () => {
    const calls: string[][] = [];
    const exec: Exec = async (argv) => {
      calls.push([...argv]);
      return result(0, "%2\n");
    };

    expect(
      await splitPane(exec, {
        target: "%1",
        direction: "horizontal",
        sizePercent: 40,
        cwd: "/tmp/project",
        command: ["true"],
        environment: { PANE_ROLE: "secondary" },
      }),
    ).toBe("%2");
    expect(calls).toEqual([
      [
        "tmux",
        "split-window",
        "-d",
        "-t",
        "%1",
        "-h",
        "-p",
        "40",
        "-P",
        "-F",
        "#{pane_id}",
        "-c",
        "/tmp/project",
        "-e",
        "PANE_ROLE=secondary",
        "true",
      ],
    ]);
  });

  test("creates a minimal vertical detached pane", async () => {
    const calls: string[][] = [];
    const exec: Exec = async (argv) => {
      calls.push([...argv]);
      return result(0, "%2\n");
    };

    expect(
      await splitPane(exec, {
        target: "%1",
        direction: "vertical",
        sizePercent: 50,
        command: ["true"],
      }),
    ).toBe("%2");
    expect(calls).toEqual([
      [
        "tmux",
        "split-window",
        "-d",
        "-t",
        "%1",
        "-v",
        "-p",
        "50",
        "-P",
        "-F",
        "#{pane_id}",
        "true",
      ],
    ]);
  });

  test("omits the size option when no size percent is provided", async () => {
    const calls: string[][] = [];
    const exec: Exec = async (argv) => {
      calls.push([...argv]);
      return result(0, "%2\n");
    };

    expect(
      await splitPane(exec, {
        target: "%1",
        direction: "vertical",
        command: ["true"],
      }),
    ).toBe("%2");
    expect(calls).toEqual([
      ["tmux", "split-window", "-d", "-t", "%1", "-v", "-P", "-F", "#{pane_id}", "true"],
    ]);
  });

  test.each([0, 101, 1.5, Number.NaN])(
    "rejects an invalid size percent before execution: %p",
    async (sizePercent) => {
      const calls: string[][] = [];
      const exec: Exec = async (argv) => {
        calls.push([...argv]);
        return result(0);
      };

      await expect(
        splitPane(exec, {
          target: "%1",
          direction: "horizontal",
          sizePercent,
        }),
      ).rejects.toMatchObject({ field: "sizePercent" });
      expect(calls).toEqual([]);
    },
  );
});

describe("sendKeys", () => {
  test("sends literal text", async () => {
    const calls: string[][] = [];
    const exec: Exec = async (argv) => {
      calls.push([...argv]);
      return result(0);
    };

    expect(await sendKeys(exec, "%1", ["hello world"], { literal: true })).toBeUndefined();
    expect(calls).toEqual([["tmux", "send-keys", "-t", "%1", "-l", "--", "hello world"]]);
  });

  test("sends key tokens without literal flags", async () => {
    const calls: string[][] = [];
    const exec: Exec = async (argv) => {
      calls.push([...argv]);
      return result(0);
    };

    expect(await sendKeys(exec, "%1", ["C-c", "Enter"])).toBeUndefined();
    expect(calls).toEqual([["tmux", "send-keys", "-t", "%1", "C-c", "Enter"]]);
  });

  test.each([
    ["", ["Enter"]],
    ["%1", []],
  ] as const)("rejects empty input before execution", async (target, keys) => {
    const calls: string[][] = [];
    const exec: Exec = async (argv) => {
      calls.push([...argv]);
      return result(0);
    };

    await expect(sendKeys(exec, target, keys)).rejects.toBeInstanceOf(ValidationError);
    expect(calls).toEqual([]);
  });

  test("reports a nonzero tmux exit", async () => {
    const exec: Exec = async () => result(2, "", "keys failed");

    await expect(sendKeys(exec, "%1", ["Enter"])).rejects.toMatchObject({
      argv: ["tmux", "send-keys", "-t", "%1", "Enter"],
      exitCode: 2,
      stderr: "keys failed",
    });
  });
});

describe("selectPane", () => {
  test("selects an exact pane target", async () => {
    const calls: string[][] = [];
    const exec: Exec = async (argv) => {
      calls.push([...argv]);
      return result(0);
    };

    expect(await selectPane(exec, "%1")).toBeUndefined();
    expect(calls).toEqual([["tmux", "select-pane", "-t", "%1"]]);
  });

  test("reports a nonzero tmux exit", async () => {
    const exec: Exec = async () => result(2, "", "selection failed");

    await expect(selectPane(exec, "%1")).rejects.toMatchObject({
      argv: ["tmux", "select-pane", "-t", "%1"],
      exitCode: 2,
      stderr: "selection failed",
    });
  });
});

describe("respawnPane", () => {
  test("replaces a pane process with its environment and command", async () => {
    const exec = mock(async (..._args: Parameters<Exec>) => result(0));

    expect(
      await respawnPane(exec, {
        target: "%3",
        cwd: "/repo",
        environment: { TERMWIRE_EDITOR_PANE: "%3" },
        command: ["nvim", "--listen", "/tmp/demo.sock"],
      }),
    ).toBeUndefined();
    expect(exec.mock.calls).toEqual([
      [
        [
          "tmux",
          "respawn-pane",
          "-k",
          "-t",
          "%3",
          "-c",
          "/repo",
          "-e",
          "TERMWIRE_EDITOR_PANE=%3",
          "nvim",
          "--listen",
          "/tmp/demo.sock",
        ],
      ],
    ]);
  });

  test("respawns a pane with tmux's default shell when command is absent", async () => {
    const exec = mock(async (..._args: Parameters<Exec>) => result(0));

    expect(
      await respawnPane(exec, {
        target: "%3",
        cwd: "/repo",
        environment: { PANE_ROLE: "shell" },
      }),
    ).toBeUndefined();
    expect(exec.mock.calls).toEqual([
      [["tmux", "respawn-pane", "-k", "-t", "%3", "-c", "/repo", "-e", "PANE_ROLE=shell"]],
    ]);
  });

  test.each([
    [{ target: "", command: ["nvim"] }, "target"],
    [{ target: "%3", cwd: "", command: ["nvim"] }, "cwd"],
    [{ target: "%3", command: [] }, "command"],
    [{ target: "%3", command: [""] }, "command"],
  ] as const)("rejects invalid input before execution", async (options, field) => {
    const exec = mock(async (..._args: Parameters<Exec>) => result(0));

    await expect(respawnPane(exec, options)).rejects.toMatchObject({ field });
    expect(exec).not.toHaveBeenCalled();
  });

  test("turns a nonzero result into CommandError", async () => {
    const exec = mock(async (..._args: Parameters<Exec>) => result(2, "", "respawn failed"));

    await expect(respawnPane(exec, { target: "%3", command: ["nvim"] })).rejects.toBeInstanceOf(
      CommandError,
    );
  });
});

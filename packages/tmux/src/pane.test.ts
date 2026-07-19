import { describe, expect, test } from "bun:test";
import { selectPane, sendKeys, splitPane } from "./pane";
import type { Exec, ExecResult } from "./process";
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

    await expect(
      splitPane(exec, {
        target: "%1",
        direction: "horizontal",
        sizePercent: 40,
        cwd: "/tmp/project",
        command: ["true"],
        environment: { PANE_ROLE: "secondary" },
      }),
    ).resolves.toBe("%2");
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

    await expect(
      splitPane(exec, {
        target: "%1",
        direction: "vertical",
        sizePercent: 50,
        command: ["true"],
      }),
    ).resolves.toBe("%2");
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

    await expect(
      splitPane(exec, {
        target: "%1",
        direction: "vertical",
        command: ["true"],
      }),
    ).resolves.toBe("%2");
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

    await expect(sendKeys(exec, "%1", ["hello world"], { literal: true })).resolves.toBeUndefined();
    expect(calls).toEqual([["tmux", "send-keys", "-t", "%1", "-l", "--", "hello world"]]);
  });

  test("sends key tokens without literal flags", async () => {
    const calls: string[][] = [];
    const exec: Exec = async (argv) => {
      calls.push([...argv]);
      return result(0);
    };

    await expect(sendKeys(exec, "%1", ["C-c", "Enter"])).resolves.toBeUndefined();
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

    await expect(selectPane(exec, "%1")).resolves.toBeUndefined();
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

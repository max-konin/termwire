import { describe, expect, test } from "bun:test";
import { attach } from "./client";
import { createTmux, type Exec, type ExecOptions, type ExecResult } from "./index";

const result = (exitCode: number, stdout = "", stderr = ""): ExecResult => ({
  exitCode,
  stdout,
  stderr,
});

describe("attach", () => {
  test("attaches externally with inherited stdio", async () => {
    const calls: Array<{ argv: string[]; options?: ExecOptions }> = [];
    const exec: Exec = async (argv, options) => {
      calls.push({ argv: [...argv], options });
      return result(0);
    };

    const tmux = createTmux({ exec, env: {} });

    await expect(tmux.attach("project")).resolves.toBeUndefined();
    expect(calls).toEqual([
      { argv: ["tmux", "attach-session", "-t", "=project"], options: { stdio: "inherit" } },
    ]);
  });

  test("exports external attach behavior directly", async () => {
    const calls: Array<{ argv: string[]; options?: ExecOptions }> = [];
    const exec: Exec = async (argv, options) => {
      calls.push({ argv: [...argv], options });
      return result(0);
    };

    await expect(attach(exec, {}, "project")).resolves.toBeUndefined();
    expect(calls).toEqual([
      { argv: ["tmux", "attach-session", "-t", "=project"], options: { stdio: "inherit" } },
    ]);
  });

  test("reports an external attach failure", async () => {
    const exec: Exec = async () => result(2, "", "attach failed");

    await expect(attach(exec, {}, "project")).rejects.toMatchObject({
      argv: ["tmux", "attach-session", "-t", "=project"],
      exitCode: 2,
      stderr: "attach failed",
    });
  });

  test("switches clients when already inside tmux", async () => {
    const calls: Array<{ argv: string[]; options?: ExecOptions }> = [];
    const exec: Exec = async (argv, options) => {
      calls.push({ argv: [...argv], options });
      return result(0);
    };

    const tmux = createTmux({ exec, env: { TMUX: "/tmp/tmux-501/default,1,0" } });

    await expect(tmux.attach("project")).resolves.toBeUndefined();
    expect(calls).toEqual([
      { argv: ["tmux", "switch-client", "-t", "=project"], options: undefined },
    ]);
  });

  test("uses external attach for an empty TMUX value", async () => {
    const calls: Array<{ argv: string[]; options?: ExecOptions }> = [];
    const exec: Exec = async (argv, options) => {
      calls.push({ argv: [...argv], options });
      return result(0);
    };

    await expect(attach(exec, { TMUX: "" }, "project")).resolves.toBeUndefined();
    expect(calls).toEqual([
      { argv: ["tmux", "attach-session", "-t", "=project"], options: { stdio: "inherit" } },
    ]);
  });
});

import { describe, expect, test } from "bun:test";
import { createTmux, type Exec, type ExecResult } from "./index";

const result = (exitCode: number): ExecResult => ({ exitCode, stdout: "", stderr: "" });

describe("createTmux", () => {
  test("binds the executor and exposes task methods", async () => {
    const calls: string[][] = [];
    const exec: Exec = async (argv) => {
      calls.push([...argv]);
      return result(0);
    };

    const tmux = createTmux({ exec });

    expect(tmux.hasSession).toBeFunction();
    expect(tmux.newSession).toBeFunction();
    expect(tmux.newWindow).toBeFunction();
    expect(tmux.splitPane).toBeFunction();
    expect(tmux.sendKeys).toBeFunction();
    expect(tmux.selectWindow).toBeFunction();
    expect(tmux.selectPane).toBeFunction();
    expect(tmux.attach).toBeFunction();
    await expect(tmux.hasSession("project")).resolves.toBe(true);
    expect(calls).toEqual([["tmux", "has-session", "-t", "=project"]]);
  });
});

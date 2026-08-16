import { describe, expect, mock, test } from "bun:test";
import {
  createTmux,
  type Exec,
  type ExecResult,
  killSession,
  respawnPane,
  setEnvironment,
} from "./index";

const result = (exitCode: number): ExecResult => ({ exitCode, stdout: "", stderr: "" });

describe("createTmux", () => {
  test("exports lifecycle primitives", () => {
    expect(setEnvironment).toBeFunction();
    expect(killSession).toBeFunction();
    expect(respawnPane).toBeFunction();
  });

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
    expect(tmux.setEnvironment).toBeFunction();
    expect(tmux.killSession).toBeFunction();
    expect(tmux.respawnPane).toBeFunction();
    expect(tmux.splitPane).toBeFunction();
    expect(tmux.sendKeys).toBeFunction();
    expect(tmux.selectWindow).toBeFunction();
    expect(tmux.selectLayout).toBeFunction();
    expect(tmux.selectPane).toBeFunction();
    expect(tmux.attach).toBeFunction();
    expect(await tmux.hasSession("project")).toBe(true);
    await tmux.selectLayout("@2", "tiled");
    expect(calls).toEqual([
      ["tmux", "has-session", "-t", "=project"],
      ["tmux", "select-layout", "-t", "@2", "tiled"],
    ]);
  });

  test("binds lifecycle primitives to its executor", async () => {
    const exec = mock(async (..._args: Parameters<Exec>) => result(0));
    const tmux = createTmux({ exec });

    await tmux.setEnvironment("demo", "KEY", "value");
    await tmux.killSession("demo");
    await tmux.respawnPane({ target: "%3", command: ["nvim"] });

    expect(exec.mock.calls).toEqual([
      [["tmux", "set-environment", "-t", "=demo", "KEY", "value"]],
      [["tmux", "kill-session", "-t", "=demo"]],
      [["tmux", "respawn-pane", "-k", "-t", "%3", "nvim"]],
    ]);
  });
});

import { describe, expect, mock, test } from "bun:test";
import { createTmux } from "./create-tmux.js";
// Internals, reached directly: the package's public entry is `createTmux`.
import { respawnPane } from "./pane.js";
import type { Exec, ExecResult } from "./process.js";
import { killSession, setEnvironment } from "./session.js";

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
    expect(tmux.listSessions).toBeFunction();
    expect(tmux.showEnvironment).toBeFunction();
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

  test("binds the listing and environment readers to its executor", async () => {
    const exec = mock(async (..._args: Parameters<Exec>) => ({
      exitCode: 0,
      stdout: "demo\t1\t/repo\n",
      stderr: "",
    }));
    const tmux = createTmux({ exec });

    expect(await tmux.listSessions()).toEqual([{ name: "demo", attached: true, path: "/repo" }]);
    await tmux.showEnvironment("demo");

    expect(exec.mock.calls).toEqual([
      [["tmux", "list-sessions", "-F", "#{session_name}\t#{session_attached}\t#{session_path}"]],
      [["tmux", "show-environment", "-t", "=demo"]],
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

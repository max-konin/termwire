import { expect, mock, test } from "bun:test";
import { type NvimClient, open, parseTarget, type TmuxClient } from "./open.js";

function createClients(running = true) {
  const nvim: NvimClient = {
    isRunning: mock<(socket: string) => Promise<boolean>>().mockResolvedValue(running),
    openFile:
      mock<(socket: string, path: string, line?: number) => Promise<void>>().mockResolvedValue(),
  };
  const tmux: TmuxClient = {
    selectWindow: mock<(target: string) => Promise<void>>().mockResolvedValue(),
    selectPane: mock<(pane: string) => Promise<void>>().mockResolvedValue(),
  };
  return { nvim, tmux };
}

const workspaceEnv = {
  TERMWIRE_SOCKET: "/tmp/termwire/repo-dev.sock",
  TERMWIRE_EDITOR_PANE: "%3",
};

test("parses a trailing line suffix and explicit line options", () => {
  const cases: { target: string; line?: string; expected: { path: string; line?: number } }[] = [
    { target: "src/app.ts", expected: { path: "src/app.ts" } },
    { target: "src/app.ts:42", expected: { path: "src/app.ts", line: 42 } },
    { target: "  src/app.ts:42  ", expected: { path: "src/app.ts", line: 42 } },
    { target: "/abs/src/app.ts:1", expected: { path: "/abs/src/app.ts", line: 1 } },
    { target: "weird:name.ts", expected: { path: "weird:name.ts" } },
    { target: "a:1:2", expected: { path: "a:1", line: 2 } },
    { target: "weird:42", line: "7", expected: { path: "weird:42", line: 7 } },
    { target: "src/app.ts", line: "42", expected: { path: "src/app.ts", line: 42 } },
  ];

  for (const { target, line, expected } of cases) {
    expect(parseTarget(target, line)).toEqual(expected);
  }
});

test("rejects an empty path and a line that is not a positive integer", () => {
  expect(() => parseTarget("   ")).toThrow("path must not be empty");

  for (const line of ["", "0", "-1", "1.5", "abc"]) {
    expect(() => parseTarget("src/app.ts", line)).toThrow("line must be a positive integer");
  }

  expect(() => parseTarget("src/app.ts:0")).toThrow("line must be a positive integer");
});

test("opens a resolved absolute path and focuses the editor pane", async () => {
  const { nvim, tmux } = createClients();

  const result = await open(
    { target: "src/app.ts:42" },
    { cwd: () => "/repo", env: workspaceEnv, nvim, tmux },
  );

  expect(result).toEqual({ path: "/repo/src/app.ts", line: 42 });
  expect(nvim.openFile).toHaveBeenCalledWith("/tmp/termwire/repo-dev.sock", "/repo/src/app.ts", 42);
  expect(tmux.selectWindow).toHaveBeenCalledWith("%3");
  expect(tmux.selectPane).toHaveBeenCalledWith("%3");
});

test("opens without a line and without tmux focus when no editor pane is known", async () => {
  const { nvim, tmux } = createClients();

  const result = await open(
    { target: "README.md" },
    {
      cwd: () => "/repo",
      env: { TERMWIRE_SOCKET: "/tmp/termwire/repo-dev.sock" },
      nvim,
      tmux,
    },
  );

  expect(result).toEqual({ path: "/repo/README.md" });
  expect(nvim.openFile).toHaveBeenCalledWith(
    "/tmp/termwire/repo-dev.sock",
    "/repo/README.md",
    undefined,
  );
  expect(tmux.selectWindow).not.toHaveBeenCalled();
  expect(tmux.selectPane).not.toHaveBeenCalled();
});

test("reports a missing workspace socket before touching the adapters", async () => {
  const { nvim, tmux } = createClients();

  for (const env of [{}, { TERMWIRE_SOCKET: "   " }, { TERMWIRE_EDITOR_PANE: "%3" }]) {
    await expect(
      open({ target: "src/app.ts" }, { cwd: () => "/repo", env, nvim, tmux }),
    ).rejects.toThrow("not inside a termwire workspace");
  }

  expect(nvim.isRunning).not.toHaveBeenCalled();
  expect(nvim.openFile).not.toHaveBeenCalled();
});

test("validates the target before reading the workspace environment", async () => {
  const { nvim, tmux } = createClients();

  await expect(
    open({ target: "src/app.ts", line: "0" }, { cwd: () => "/repo", env: {}, nvim, tmux }),
  ).rejects.toThrow("line must be a positive integer");
});

test("reports an unresponsive Neovim without opening or focusing", async () => {
  const { nvim, tmux } = createClients(false);

  await expect(
    open({ target: "src/app.ts" }, { cwd: () => "/repo", env: workspaceEnv, nvim, tmux }),
  ).rejects.toThrow("nvim is not responding on socket /tmp/termwire/repo-dev.sock");

  expect(nvim.openFile).not.toHaveBeenCalled();
  expect(tmux.selectPane).not.toHaveBeenCalled();
});

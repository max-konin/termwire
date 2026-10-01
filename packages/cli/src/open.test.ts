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

test.each([
  ["src/app.ts", undefined, { path: "src/app.ts" }],
  ["src/app.ts:42", undefined, { path: "src/app.ts", line: 42 }],
  ["  src/app.ts:42  ", undefined, { path: "src/app.ts", line: 42 }],
  ["/abs/src/app.ts:1", undefined, { path: "/abs/src/app.ts", line: 1 }],
  ["weird:name.ts", undefined, { path: "weird:name.ts" }],
  ["a:1:2", undefined, { path: "a:1", line: 2 }],
  ["weird:42", "7", { path: "weird:42", line: 7 }],
  ["src/app.ts", "42", { path: "src/app.ts", line: 42 }],
] as [string, string | undefined, { path: string; line?: number }][])(
  "parses %p with line %p",
  (target, line, expected) => {
    expect(parseTarget(target, line)).toEqual(expected);
  },
);

test("rejects an empty path", () => {
  expect(() => parseTarget("   ")).toThrow("path must not be empty");
});

test.each(["", "0", "-1", "1.5", "abc"])("rejects %p as a line option", (line) => {
  expect(() => parseTarget("src/app.ts", line)).toThrow("line must be a positive integer");
});

test("rejects a zero line suffix", () => {
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

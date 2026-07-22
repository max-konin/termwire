import { expect, test } from "bun:test";
import { createOpenFileHandler, type NvimClient, type TmuxClient } from "./open";

const idleNvim: NvimClient = {
  async isRunning() {
    return true;
  },
  async openFile() {},
};

const idleTmux: TmuxClient = {
  async selectWindow() {},
  async selectPane() {},
};

test.each([
  [{ TERMWIRE_EDITOR_PANE: "%1" }],
  [{ TERMWIRE_SOCKET: " ", TERMWIRE_EDITOR_PANE: "%1" }],
  [{}],
])("rejects a missing Termwire socket", async (env) => {
  const openFile = createOpenFileHandler({
    getEnv: () => env,
    getCwd: () => "/workspace/project",
    nvim: idleNvim,
    tmux: idleTmux,
  });

  await expect(openFile({ path: "src/app.ts" })).rejects.toThrow("not inside a termwire workspace");
});

test("resolves cwd and routes through socket, open, window, then pane", async () => {
  const calls: string[] = [];
  const openFile = createOpenFileHandler({
    getEnv: () => ({
      TERMWIRE_SOCKET: "/tmp/termwire/main.sock",
      TERMWIRE_EDITOR_PANE: "%1",
    }),
    getCwd: () => "/workspace/project",
    nvim: {
      async isRunning(socket) {
        calls.push(`running:${socket}`);
        return true;
      },
      async openFile(socket, path, line) {
        calls.push(`open:${socket}:${path}:${line ?? ""}`);
      },
    },
    tmux: {
      async selectWindow(target) {
        calls.push(`window:${target}`);
      },
      async selectPane(target) {
        calls.push(`pane:${target}`);
      },
    },
  });

  await expect(openFile({ path: "src/app.ts", line: 42 })).resolves.toEqual({
    path: "/workspace/project/src/app.ts",
    line: 42,
  });

  expect(calls).toEqual([
    "running:/tmp/termwire/main.sock",
    "open:/tmp/termwire/main.sock:/workspace/project/src/app.ts:42",
    "window:%1",
    "pane:%1",
  ]);
});

test("opens without focusing when no editor pane is available", async () => {
  const calls: string[] = [];
  const openFile = createOpenFileHandler({
    getEnv: () => ({ TERMWIRE_SOCKET: "/tmp/termwire/main.sock" }),
    getCwd: () => "/workspace/project",
    nvim: {
      async isRunning() {
        return true;
      },
      async openFile(_socket, path) {
        calls.push(`open:${path}`);
      },
    },
    tmux: {
      async selectWindow() {
        calls.push("window");
      },
      async selectPane() {
        calls.push("pane");
      },
    },
  });

  await expect(openFile({ path: "README.md" })).resolves.toEqual({
    path: "/workspace/project/README.md",
    line: undefined,
  });

  expect(calls).toEqual(["open:/workspace/project/README.md"]);
});

test("reads fresh socket and pane values for every call", async () => {
  const calls: string[] = [];
  let env = { TERMWIRE_SOCKET: "/tmp/one.sock", TERMWIRE_EDITOR_PANE: "%1" };
  const openFile = createOpenFileHandler({
    getEnv: () => env,
    getCwd: () => "/workspace",
    nvim: {
      async isRunning(socket) {
        calls.push(`running:${socket}`);
        return true;
      },
      async openFile(socket) {
        calls.push(`open:${socket}`);
      },
    },
    tmux: {
      async selectWindow(target) {
        calls.push(`window:${target}`);
      },
      async selectPane(target) {
        calls.push(`pane:${target}`);
      },
    },
  });

  await openFile({ path: "one.ts" });

  env = { TERMWIRE_SOCKET: "/tmp/two.sock", TERMWIRE_EDITOR_PANE: "%9" };

  await openFile({ path: "two.ts" });

  expect(calls).toEqual([
    "running:/tmp/one.sock",
    "open:/tmp/one.sock",
    "window:%1",
    "pane:%1",
    "running:/tmp/two.sock",
    "open:/tmp/two.sock",
    "window:%9",
    "pane:%9",
  ]);
});

test("preserves an absolute path", async () => {
  const openFile = createOpenFileHandler({
    getEnv: () => ({ TERMWIRE_SOCKET: "/tmp/nvim.sock", TERMWIRE_EDITOR_PANE: "%2" }),
    getCwd: () => "/workspace",
    nvim: idleNvim,
    tmux: idleTmux,
  });

  await expect(openFile({ path: "/tmp/new file.ts" })).resolves.toEqual({
    path: "/tmp/new file.ts",
    line: undefined,
  });
});

test("does not open or focus when Neovim is unavailable", async () => {
  const calls: string[] = [];
  const openFile = createOpenFileHandler({
    getEnv: () => ({ TERMWIRE_SOCKET: "/tmp/nvim.sock", TERMWIRE_EDITOR_PANE: "%2" }),
    getCwd: () => "/workspace",
    nvim: {
      async isRunning() {
        return false;
      },
      async openFile() {
        calls.push("open");
      },
    },
    tmux: {
      async selectWindow() {
        calls.push("window");
      },
      async selectPane() {
        calls.push("pane");
      },
    },
  });

  await expect(openFile({ path: "README.md" })).rejects.toThrow(
    "nvim is not responding on socket /tmp/nvim.sock",
  );

  expect(calls).toEqual([]);
});

test.each([
  ["open", "remote failed"],
  ["window", "window missing"],
  ["pane", "pane missing"],
] as const)("preserves the %s adapter error", async (failure, message) => {
  const error = new Error(message);
  const openFile = createOpenFileHandler({
    getEnv: () => ({ TERMWIRE_SOCKET: "/tmp/nvim.sock", TERMWIRE_EDITOR_PANE: "%2" }),
    getCwd: () => "/workspace",
    nvim: {
      async isRunning() {
        return true;
      },
      async openFile() {
        if (failure === "open") throw error;
      },
    },
    tmux: {
      async selectWindow() {
        if (failure === "window") throw error;
      },
      async selectPane() {
        if (failure === "pane") throw error;
      },
    },
  });

  await expect(openFile({ path: "README.md" })).rejects.toBe(error);
});

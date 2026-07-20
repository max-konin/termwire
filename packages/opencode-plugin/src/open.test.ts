import { expect, test } from "bun:test";
import { createOpenFileHandler, type NvimClient, type TmuxClient } from "./open";

const request = {
  directory: "/workspace/project",
  path: "src/app.ts",
  line: 42,
};

const workspaceEnv = () => ({
  TERMWIRE_SOCKET: "/tmp/termwire/main.sock",
  TERMWIRE_EDITOR_PANE: "%1",
});

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
  [{ TERMWIRE_SOCKET: "/tmp/termwire/main.sock" }],
  [{}],
])("rejects an incomplete workspace environment", async (env) => {
  const openFile = createOpenFileHandler({ getEnv: () => env, nvim: idleNvim, tmux: idleTmux });
  await expect(openFile(request)).rejects.toThrow("not inside an termwire workspace");
});

test("resolves a relative path from the OpenCode directory", async () => {
  const openFile = createOpenFileHandler({ getEnv: workspaceEnv, nvim: idleNvim, tmux: idleTmux });
  await expect(openFile(request)).resolves.toEqual({
    path: "/workspace/project/src/app.ts",
    line: 42,
  });
});

test("preserves an absolute path", async () => {
  const openFile = createOpenFileHandler({ getEnv: workspaceEnv, nvim: idleNvim, tmux: idleTmux });
  await expect(
    openFile({ directory: "/workspace/project", path: "/tmp/new file.ts" }),
  ).resolves.toEqual({ path: "/tmp/new file.ts", line: undefined });
});

test("selects the editor window before its pane", async () => {
  const calls: string[] = [];
  const openFile = createOpenFileHandler({
    getEnv: workspaceEnv,
    nvim: idleNvim,
    tmux: {
      async selectWindow(target: string) {
        calls.push(`window:${target}`);
      },
      async selectPane(target: string) {
        calls.push(`pane:${target}`);
      },
    },
  });

  await openFile(request);

  expect(calls).toEqual(["window:%1", "pane:%1"]);
});

test("routes each invocation through its own socket and pane in order", async () => {
  const calls: string[] = [];
  let env = {
    TERMWIRE_SOCKET: "/tmp/termwire/one.sock",
    TERMWIRE_EDITOR_PANE: "%1",
  };
  const nvim = {
    async isRunning(socket: string) {
      calls.push(`running:${socket}`);
      return true;
    },
    async openFile(socket: string, path: string, line?: number) {
      calls.push(`open:${socket}:${path}:${line ?? ""}`);
    },
  };
  const tmux = {
    async selectWindow(target: string) {
      calls.push(`window:${target}`);
    },
    async selectPane(pane: string) {
      calls.push(`focus:${pane}`);
    },
  };
  const openFile = createOpenFileHandler({ getEnv: () => env, nvim, tmux });

  await openFile(request);
  env = {
    TERMWIRE_SOCKET: "/tmp/termwire/two.sock",
    TERMWIRE_EDITOR_PANE: "%9",
  };
  await openFile({ directory: "/workspace/other", path: "README.md" });

  expect(calls).toEqual([
    "running:/tmp/termwire/one.sock",
    "open:/tmp/termwire/one.sock:/workspace/project/src/app.ts:42",
    "window:%1",
    "focus:%1",
    "running:/tmp/termwire/two.sock",
    "open:/tmp/termwire/two.sock:/workspace/other/README.md:",
    "window:%9",
    "focus:%9",
  ]);
});

test("does not open or focus when Neovim is unavailable", async () => {
  let opened = false;
  let focused = false;
  const openFile = createOpenFileHandler({
    getEnv: workspaceEnv,
    nvim: {
      async isRunning() {
        return false;
      },
      async openFile() {
        opened = true;
      },
    },
    tmux: {
      async selectWindow() {},
      async selectPane() {
        focused = true;
      },
    },
  });
  await expect(openFile(request)).rejects.toThrow(
    "nvim is not responding on socket /tmp/termwire/main.sock",
  );
  expect(opened).toBe(false);
  expect(focused).toBe(false);
});

test("propagates the opening error unchanged", async () => {
  let focused = false;
  const error = new Error("remote failed");
  const openFile = createOpenFileHandler({
    getEnv: workspaceEnv,
    nvim: {
      async isRunning() {
        return true;
      },
      async openFile() {
        throw error;
      },
    },
    tmux: {
      async selectWindow() {},
      async selectPane() {
        focused = true;
      },
    },
  });
  await expect(openFile(request)).rejects.toBe(error);
  expect(focused).toBe(false);
});

test("propagates the window-focus error unchanged", async () => {
  const error = new Error("window missing");
  const openFile = createOpenFileHandler({
    getEnv: workspaceEnv,
    nvim: idleNvim,
    tmux: {
      async selectWindow() {
        throw error;
      },
      async selectPane() {},
    },
  });
  await expect(openFile(request)).rejects.toBe(error);
});

test("propagates the pane-focus error unchanged", async () => {
  const error = new Error("pane missing");
  const openFile = createOpenFileHandler({
    getEnv: workspaceEnv,
    nvim: idleNvim,
    tmux: {
      async selectWindow() {},
      async selectPane() {
        throw error;
      },
    },
  });
  await expect(openFile(request)).rejects.toBe(error);
});

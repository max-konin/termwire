import { expect, mock, test } from "bun:test";
import type { createTmux } from "@openbridge/tmux";
import { up } from "./up";

const createWorkspaceTmux = (sessionExists = false) => {
  const hasSession =
    mock<ReturnType<typeof createTmux>["hasSession"]>().mockResolvedValue(sessionExists);
  const newSession = mock<ReturnType<typeof createTmux>["newSession"]>().mockResolvedValue({
    windowId: "@1",
    paneId: "%1",
  });
  const newWindow = mock<ReturnType<typeof createTmux>["newWindow"]>().mockResolvedValue({
    windowId: "@2",
    paneId: "%2",
  });
  const setEnvironment =
    mock<ReturnType<typeof createTmux>["setEnvironment"]>().mockResolvedValue();
  const respawnPane = mock<ReturnType<typeof createTmux>["respawnPane"]>().mockResolvedValue();
  const selectWindow = mock<ReturnType<typeof createTmux>["selectWindow"]>().mockResolvedValue();
  const selectPane = mock<ReturnType<typeof createTmux>["selectPane"]>().mockResolvedValue();
  const attach = mock<ReturnType<typeof createTmux>["attach"]>().mockResolvedValue();
  const sendKeys = mock<ReturnType<typeof createTmux>["sendKeys"]>().mockResolvedValue();
  const killSession = mock<ReturnType<typeof createTmux>["killSession"]>().mockResolvedValue();

  return {
    tmux: {
      hasSession,
      newSession,
      newWindow,
      setEnvironment,
      respawnPane,
      selectWindow,
      selectPane,
      attach,
      sendKeys,
      killSession,
    } as unknown as ReturnType<typeof createTmux>,
    hasSession,
    newSession,
    newWindow,
    setEnvironment,
    respawnPane,
    selectWindow,
    selectPane,
    attach,
    sendKeys,
    killSession,
  };
};

test("attaches immediately to an existing session without workspace side effects", async () => {
  const hasSession = mock<(session: string) => Promise<boolean>>().mockResolvedValue(true);
  const attach = mock<(session: string) => Promise<void>>().mockResolvedValue();
  const tmux = {
    hasSession,
    attach,
  } as unknown as ReturnType<typeof createTmux>;
  const findGitRoot =
    mock<(cwd: string) => Promise<string | undefined>>().mockResolvedValue("/repo");
  const prepareWorktree =
    mock<
      (options: { gitRoot: string; project: string; name: string }) => Promise<string>
    >().mockResolvedValue("/repo-feature");
  const mkdir = mock<(path: string) => Promise<void>>().mockResolvedValue();
  const removeFile = mock<(path: string) => Promise<void>>().mockResolvedValue();

  await up(
    { name: "dev", worktree: "feature" },
    {
      cwd: mock<() => string>().mockReturnValue("/repo"),
      findGitRoot,
      prepareWorktree,
      mkdir,
      removeFile,
      tmux,
    },
  );

  expect(hasSession).toHaveBeenCalledWith("repo-dev");
  expect(attach).toHaveBeenCalledWith("repo-dev");
  expect(prepareWorktree).not.toHaveBeenCalled();
  expect(mkdir).not.toHaveBeenCalled();
  expect(removeFile).not.toHaveBeenCalled();
});

test("uses the original cwd when no worktree is requested", async () => {
  const { tmux, newSession } = createWorkspaceTmux();
  const prepareWorktree =
    mock<
      (options: { gitRoot: string; project: string; name: string }) => Promise<string>
    >().mockResolvedValue("/repo-dev");

  await up(
    { name: "dev" },
    {
      cwd: mock<() => string>().mockReturnValue("/repo"),
      findGitRoot: mock<(cwd: string) => Promise<string | undefined>>().mockResolvedValue("/repo"),
      prepareWorktree,
      mkdir: mock<(path: string) => Promise<void>>().mockResolvedValue(),
      removeFile: mock<(path: string) => Promise<void>>().mockResolvedValue(),
      tmux,
    },
  );

  expect(newSession).toHaveBeenCalledWith({ session: "repo-dev", name: "editor", cwd: "/repo" });
  expect(prepareWorktree).not.toHaveBeenCalled();
});

test("uses the request name for a bare worktree", async () => {
  const { tmux, newSession } = createWorkspaceTmux();
  const prepareWorktree =
    mock<
      (options: { gitRoot: string; project: string; name: string }) => Promise<string>
    >().mockResolvedValue("/repo-dev");

  await up(
    { name: "dev", worktree: true },
    {
      cwd: mock<() => string>().mockReturnValue("/repo"),
      findGitRoot: mock<(cwd: string) => Promise<string | undefined>>().mockResolvedValue("/repo"),
      prepareWorktree,
      mkdir: mock<(path: string) => Promise<void>>().mockResolvedValue(),
      removeFile: mock<(path: string) => Promise<void>>().mockResolvedValue(),
      tmux,
    },
  );

  expect(prepareWorktree).toHaveBeenCalledWith({ gitRoot: "/repo", project: "repo", name: "dev" });
  expect(newSession).toHaveBeenCalledWith({
    session: "repo-dev",
    name: "editor",
    cwd: "/repo-dev",
  });
});

test("uses an explicit worktree name and starts its workspace", async () => {
  const { tmux, newSession } = createWorkspaceTmux();
  const prepareWorktree =
    mock<
      (options: { gitRoot: string; project: string; name: string }) => Promise<string>
    >().mockResolvedValue("/repo-feature");

  await up(
    { name: "dev", worktree: "feature" },
    {
      cwd: mock<() => string>().mockReturnValue("/repo"),
      findGitRoot: mock<(cwd: string) => Promise<string | undefined>>().mockResolvedValue("/repo"),
      prepareWorktree,
      mkdir: mock<(path: string) => Promise<void>>().mockResolvedValue(),
      removeFile: mock<(path: string) => Promise<void>>().mockResolvedValue(),
      tmux,
    },
  );

  expect(prepareWorktree).toHaveBeenCalledWith({
    gitRoot: "/repo",
    project: "repo",
    name: "feature",
  });
  expect(newSession).toHaveBeenCalledWith({
    session: "repo-dev",
    name: "editor",
    cwd: "/repo-feature",
  });
});

test("rejects a worktree request outside a Git repository", async () => {
  const { tmux, newSession } = createWorkspaceTmux();
  const prepareWorktree =
    mock<
      (options: { gitRoot: string; project: string; name: string }) => Promise<string>
    >().mockResolvedValue("/repo-feature");

  await expect(
    up(
      { name: "dev", worktree: "feature" },
      {
        cwd: mock<() => string>().mockReturnValue("/tmp/project"),
        findGitRoot:
          mock<(cwd: string) => Promise<string | undefined>>().mockResolvedValue(undefined),
        prepareWorktree,
        mkdir: mock<(path: string) => Promise<void>>().mockResolvedValue(),
        removeFile: mock<(path: string) => Promise<void>>().mockResolvedValue(),
        tmux,
      },
    ),
  ).rejects.toThrow("worktree requires a Git repository");

  expect(prepareWorktree).not.toHaveBeenCalled();
  expect(newSession).not.toHaveBeenCalled();
});

test("rejects an explicitly empty worktree name before attaching", async () => {
  const { tmux, hasSession, attach } = createWorkspaceTmux(true);
  const prepareWorktree =
    mock<
      (options: { gitRoot: string; project: string; name: string }) => Promise<string>
    >().mockResolvedValue("/repo-feature");

  await expect(
    up(
      { name: "dev", worktree: "" },
      {
        cwd: mock<() => string>().mockReturnValue("/repo"),
        findGitRoot:
          mock<(cwd: string) => Promise<string | undefined>>().mockResolvedValue("/repo"),
        prepareWorktree,
        mkdir: mock<(path: string) => Promise<void>>().mockResolvedValue(),
        removeFile: mock<(path: string) => Promise<void>>().mockResolvedValue(),
        tmux,
      },
    ),
  ).rejects.toThrow("worktree name must not be empty");

  expect(hasSession).not.toHaveBeenCalled();
  expect(attach).not.toHaveBeenCalled();
  expect(prepareWorktree).not.toHaveBeenCalled();
});

test("rejects an overlong socket identity before checking tmux", async () => {
  const { tmux, hasSession } = createWorkspaceTmux(true);

  await expect(
    up(
      { name: "n".repeat(81) },
      {
        cwd: mock<() => string>().mockReturnValue("/tmp/p"),
        findGitRoot:
          mock<(cwd: string) => Promise<string | undefined>>().mockResolvedValue(undefined),
        prepareWorktree:
          mock<(options: { gitRoot: string; project: string; name: string }) => Promise<string>>(),
        mkdir: mock<(path: string) => Promise<void>>().mockResolvedValue(),
        removeFile: mock<(path: string) => Promise<void>>().mockResolvedValue(),
        tmux,
      },
    ),
  ).rejects.toThrow("socket path exceeds macOS Unix socket limit of 103 bytes");

  expect(hasSession).not.toHaveBeenCalled();
});

test("creates the default editor and shell workspace protocol", async () => {
  const events: string[] = [];
  const hasSession = mock<(session: string) => Promise<boolean>>().mockImplementation(async () => {
    events.push("hasSession");
    return false;
  });
  const newSession = mock<
    (options: {
      session: string;
      name?: string;
      cwd?: string;
      command?: readonly string[];
      environment?: Record<string, string | undefined>;
    }) => Promise<{ windowId: string; paneId: string }>
  >().mockImplementation(async () => {
    events.push("newSession");
    return { windowId: "@1", paneId: "%1" };
  });
  const setEnvironment = mock<
    (session: string, key: string, value: string) => Promise<void>
  >().mockImplementation(async (_session, key) => {
    events.push(`setEnvironment:${key}`);
  });
  const respawnPane = mock<
    (options: {
      target: string;
      cwd?: string;
      command: readonly string[];
      environment?: Record<string, string | undefined>;
    }) => Promise<void>
  >().mockImplementation(async () => {
    events.push("respawnPane");
  });
  const newWindow = mock<
    (options: {
      target: string;
      name?: string;
      cwd?: string;
      command?: readonly string[];
      environment?: Record<string, string | undefined>;
    }) => Promise<{ windowId: string; paneId: string }>
  >().mockImplementation(async () => {
    events.push("newWindow");
    return { windowId: "@2", paneId: "%2" };
  });
  const selectWindow = mock<(target: string) => Promise<void>>().mockImplementation(async () => {
    events.push("selectWindow");
  });
  const selectPane = mock<(target: string) => Promise<void>>().mockImplementation(async () => {
    events.push("selectPane");
  });
  const attach = mock<(session: string) => Promise<void>>().mockImplementation(async () => {
    events.push("attach");
  });
  const sendKeys =
    mock<
      (target: string, keys: readonly string[], options?: { literal?: boolean }) => Promise<void>
    >();
  const tmux = {
    hasSession,
    newSession,
    setEnvironment,
    respawnPane,
    newWindow,
    selectWindow,
    selectPane,
    attach,
    sendKeys,
  } as unknown as ReturnType<typeof createTmux>;
  const mkdir = mock<(path: string) => Promise<void>>().mockImplementation(async () => {
    events.push("mkdir");
  });
  const removeFile = mock<(path: string) => Promise<void>>().mockImplementation(async () => {
    events.push("removeFile");
  });

  await up(
    { name: "dev" },
    {
      cwd: mock<() => string>().mockReturnValue("/repo"),
      findGitRoot: mock<(cwd: string) => Promise<string | undefined>>().mockResolvedValue("/repo"),
      prepareWorktree:
        mock<(options: { gitRoot: string; project: string; name: string }) => Promise<string>>(),
      mkdir,
      removeFile,
      tmux,
    },
  );

  const environment = {
    OPENBRIDGE_SESSION: "repo-dev",
    OPENBRIDGE_SOCKET: "/tmp/openbridge/repo-dev.sock",
    OPENBRIDGE_EDITOR_PANE: "%1",
  };
  expect(mkdir).toHaveBeenCalledWith("/tmp/openbridge");
  expect(removeFile).toHaveBeenCalledWith("/tmp/openbridge/repo-dev.sock");
  expect(newSession).toHaveBeenCalledWith({ session: "repo-dev", name: "editor", cwd: "/repo" });
  expect(setEnvironment.mock.calls).toEqual([
    ["repo-dev", "OPENBRIDGE_SESSION", "repo-dev"],
    ["repo-dev", "OPENBRIDGE_SOCKET", "/tmp/openbridge/repo-dev.sock"],
    ["repo-dev", "OPENBRIDGE_EDITOR_PANE", "%1"],
  ]);
  expect(respawnPane).toHaveBeenCalledWith({
    target: "%1",
    cwd: "/repo",
    command: ["nvim", "--listen", "/tmp/openbridge/repo-dev.sock"],
    environment,
  });
  expect(newWindow).toHaveBeenCalledWith({
    target: "repo-dev",
    name: "shell",
    cwd: "/repo",
    environment,
  });
  expect(selectWindow).toHaveBeenCalledWith("@1");
  expect(selectPane).toHaveBeenCalledWith("%1");
  expect(attach).toHaveBeenCalledWith("repo-dev");
  expect(sendKeys).not.toHaveBeenCalled();
  expect(events).toEqual([
    "hasSession",
    "mkdir",
    "removeFile",
    "newSession",
    "setEnvironment:OPENBRIDGE_SESSION",
    "setEnvironment:OPENBRIDGE_SOCKET",
    "setEnvironment:OPENBRIDGE_EDITOR_PANE",
    "respawnPane",
    "newWindow",
    "selectWindow",
    "selectPane",
    "attach",
  ]);
});

test("cleans up a partially created session when newWindow fails", async () => {
  const { tmux, newWindow, killSession } = createWorkspaceTmux();
  const setupError = new Error("new window failed");
  newWindow.mockRejectedValue(setupError);

  await expect(
    up(
      { name: "dev" },
      {
        cwd: mock<() => string>().mockReturnValue("/repo"),
        findGitRoot:
          mock<(cwd: string) => Promise<string | undefined>>().mockResolvedValue("/repo"),
        prepareWorktree:
          mock<(options: { gitRoot: string; project: string; name: string }) => Promise<string>>(),
        mkdir: mock<(path: string) => Promise<void>>().mockResolvedValue(),
        removeFile: mock<(path: string) => Promise<void>>().mockResolvedValue(),
        tmux,
      },
    ),
  ).rejects.toBe(setupError);

  expect(killSession).toHaveBeenCalledWith("repo-dev");
});

test("preserves the setup error when partial-session cleanup fails", async () => {
  const { tmux, newWindow, killSession } = createWorkspaceTmux();
  const setupError = new Error("new window failed");
  newWindow.mockRejectedValue(setupError);
  killSession.mockRejectedValue(new Error("cleanup failed"));

  await expect(
    up(
      { name: "dev" },
      {
        cwd: mock<() => string>().mockReturnValue("/repo"),
        findGitRoot:
          mock<(cwd: string) => Promise<string | undefined>>().mockResolvedValue("/repo"),
        prepareWorktree:
          mock<(options: { gitRoot: string; project: string; name: string }) => Promise<string>>(),
        mkdir: mock<(path: string) => Promise<void>>().mockResolvedValue(),
        removeFile: mock<(path: string) => Promise<void>>().mockResolvedValue(),
        tmux,
      },
    ),
  ).rejects.toBe(setupError);

  expect(killSession).toHaveBeenCalledWith("repo-dev");
});

test("does not clean up when stale socket removal fails before session creation", async () => {
  const { tmux, killSession, newSession } = createWorkspaceTmux();
  const setupError = new Error("socket removal failed");
  const removeFile = mock<(path: string) => Promise<void>>().mockRejectedValue(setupError);

  await expect(
    up(
      { name: "dev" },
      {
        cwd: mock<() => string>().mockReturnValue("/repo"),
        findGitRoot:
          mock<(cwd: string) => Promise<string | undefined>>().mockResolvedValue("/repo"),
        prepareWorktree:
          mock<(options: { gitRoot: string; project: string; name: string }) => Promise<string>>(),
        mkdir: mock<(path: string) => Promise<void>>().mockResolvedValue(),
        removeFile,
        tmux,
      },
    ),
  ).rejects.toBe(setupError);

  expect(newSession).not.toHaveBeenCalled();
  expect(killSession).not.toHaveBeenCalled();
});

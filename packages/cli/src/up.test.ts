import { expect, mock, test } from "bun:test";
import type { createTmux } from "@termwire/tmux";
import type { LayoutConfig } from "./config-schema";
import type { LoadedConfig } from "./config-types";
import { createLayout } from "./layout";
import { up as runUp, type UpDependencies } from "./up";

const defaultLayout: LayoutConfig = {
  windows: [
    { name: "editor", panes: [{ id: "editor", role: "editor" }] },
    { name: "shell", panes: [{ id: "shell" }] },
  ],
};

test("attaches immediately to an existing session without workspace side effects", async () => {
  const hasSession = mock<(session: string) => Promise<boolean>>().mockResolvedValue(true);
  const attach = mock<(session: string) => Promise<void>>().mockResolvedValue();
  const setSessionTitle = mock<(session: string) => Promise<void>>();
  const tmux = {
    hasSession,
    attach,
    setSessionTitle,
  } as unknown as ReturnType<typeof createTmux>;
  const findGitRoot =
    mock<(cwd: string) => Promise<string | undefined>>().mockResolvedValue("/repo");
  const prepareWorktree =
    mock<
      (options: { gitRoot: string; project: string; name: string }) => Promise<string>
    >().mockResolvedValue("/repo-feature");
  const prepareBranch = mock<(options: { cwd: string; name: string }) => Promise<void>>();
  const mkdir = mock<(path: string) => Promise<void>>().mockResolvedValue();
  const removeFile = mock<(path: string) => Promise<void>>().mockResolvedValue();

  await up(
    { name: "dev", worktree: "feature", branch: "feature/api" },
    {
      cwd: mock<() => string>().mockReturnValue("/repo"),
      findGitRoot,
      prepareBranch,
      prepareWorktree,
      mkdir,
      removeFile,
      tmux,
    },
  );

  expect(hasSession).toHaveBeenCalledWith("repo-dev");
  expect(attach).toHaveBeenCalledWith("repo-dev");
  expect(setSessionTitle).not.toHaveBeenCalled();
  expect(prepareBranch).not.toHaveBeenCalled();
  expect(prepareWorktree).not.toHaveBeenCalled();
  expect(mkdir).not.toHaveBeenCalled();
  expect(removeFile).not.toHaveBeenCalled();
});

test("attaches to an existing session without reading layout configuration", async () => {
  const hasSession = mock<(session: string) => Promise<boolean>>().mockResolvedValue(true);
  const attach = mock<(session: string) => Promise<void>>().mockResolvedValue();
  const loadGlobalConfig = mock<() => Promise<undefined>>().mockResolvedValue(undefined);
  const loadProjectConfig =
    mock<(gitRoot: string) => Promise<undefined>>().mockResolvedValue(undefined);

  await up(
    { name: "dev" },
    {
      cwd: () => "/repo",
      findGitRoot: async () => "/repo",
      prepareBranch: async () => {},
      prepareWorktree: async () => "/repo-worktree",
      mkdir: async () => {},
      removeFile: async () => {},
      tmux: { hasSession, attach } as unknown as ReturnType<typeof createTmux>,
      loadGlobalConfig,
      loadProjectConfig,
    },
  );

  expect(attach).toHaveBeenCalledWith("repo-dev");
  expect(loadGlobalConfig).not.toHaveBeenCalled();
  expect(loadProjectConfig).not.toHaveBeenCalled();
});

test.each([
  {
    request: { name: "dev" },
    cwd: "/repo/packages/cli",
    workspace: "/repo/packages/cli",
    workspaceRoot: "/repo",
  },
  {
    request: { name: "dev", worktree: "feature" as const },
    cwd: "/repo",
    workspace: "/worktrees/repo-feature",
    workspaceRoot: "/worktrees/repo-feature",
  },
])(
  "loads project configuration from the resolved workspace root",
  async ({ request, cwd, workspace, workspaceRoot }) => {
    const { tmux } = createWorkspaceTmux();
    const findGitRoot = mock<(path: string) => Promise<string | undefined>>().mockImplementation(
      async (path) => (path === workspace ? workspaceRoot : "/repo"),
    );
    const loadGlobalConfig = mock<() => Promise<undefined>>().mockResolvedValue(undefined);
    const loadProjectConfig =
      mock<(gitRoot: string) => Promise<undefined>>().mockResolvedValue(undefined);
    const resolveLayout = mock<
      (
        globalConfig: LoadedConfig | undefined,
        projectConfig: LoadedConfig | undefined,
      ) => LayoutConfig
    >().mockReturnValue({
      windows: [{ name: "editor", panes: [{ id: "editor", role: "editor" }] }],
    });

    await up(request, {
      cwd: () => cwd,
      findGitRoot,
      prepareBranch: async () => {},
      prepareWorktree: async () => workspace,
      mkdir: async () => {},
      removeFile: async () => {},
      tmux,
      loadGlobalConfig,
      loadProjectConfig,
      resolveLayout,
    });

    expect(findGitRoot).toHaveBeenLastCalledWith(workspace);
    expect(loadProjectConfig).toHaveBeenCalledWith(workspaceRoot);
  },
);

test("validates layout after preparing a worktree but before tmux side effects", async () => {
  const { tmux, newSession, killSession } = createWorkspaceTmux();
  const configError = new Error("invalid layout");
  const prepareWorktree =
    mock<
      (options: {
        gitRoot: string;
        project: string;
        name: string;
        branch: string;
      }) => Promise<string>
    >().mockResolvedValue("/worktrees/repo-feature");
  const mkdir = mock<(path: string) => Promise<void>>().mockResolvedValue();
  const removeFile = mock<(path: string) => Promise<void>>().mockResolvedValue();
  const resolveLayout = mock<
    (
      globalConfig: LoadedConfig | undefined,
      projectConfig: LoadedConfig | undefined,
    ) => LayoutConfig
  >().mockImplementation(() => {
    throw configError;
  });

  await expect(
    up(
      { name: "dev", worktree: "feature" },
      {
        cwd: () => "/repo",
        findGitRoot: async (path) => (path === "/repo" ? "/repo" : "/worktrees/repo-feature"),
        prepareBranch: async () => {},
        prepareWorktree,
        mkdir,
        removeFile,
        tmux,
        loadGlobalConfig: async () => undefined,
        loadProjectConfig: async () => undefined,
        resolveLayout,
      },
    ),
  ).rejects.toBe(configError);

  expect(prepareWorktree).toHaveBeenCalled();
  expect(mkdir).not.toHaveBeenCalled();
  expect(removeFile).not.toHaveBeenCalled();
  expect(newSession).not.toHaveBeenCalled();
  expect(killSession).not.toHaveBeenCalled();
});

test("creates the initial session from the effective layout and hands it to createLayout", async () => {
  const { tmux, newSession } = createWorkspaceTmux();
  const layout: LayoutConfig = {
    windows: [{ name: "custom", panes: [{ id: "editor", role: "editor" }] }],
  };
  const createLayoutMock = mock<typeof createLayout>().mockResolvedValue({
    editor: { windowId: "@1", paneId: "%1" },
    environment: {
      TERMWIRE_SESSION: "repo-dev",
      TERMWIRE_SOCKET: "/tmp/termwire/repo-dev.sock",
      TERMWIRE_EDITOR_PANE: "%1",
    },
  });

  await up(
    { name: "dev" },
    {
      cwd: () => "/repo",
      findGitRoot: async () => "/repo",
      prepareBranch: async () => {},
      prepareWorktree: async () => "/worktrees/repo-feature",
      mkdir: async () => {},
      removeFile: async () => {},
      tmux,
      loadGlobalConfig: async () => undefined,
      loadProjectConfig: async () => undefined,
      resolveLayout: () => layout,
      createLayout: createLayoutMock,
    },
  );

  expect(newSession).toHaveBeenCalledWith({ session: "repo-dev", name: "custom", cwd: "/repo" });
  expect(createLayoutMock).toHaveBeenCalledWith({
    tmux,
    session: "repo-dev",
    workspace: "/repo",
    socket: "/tmp/termwire/repo-dev.sock",
    layout,
    initial: { windowId: "@1", paneId: "%1" },
  });
});

test.each([
  { failure: "createLayout", cleanupFails: false },
  { failure: "attach", cleanupFails: false },
  { failure: "setSessionTitle", cleanupFails: false },
  { failure: "createLayout", cleanupFails: true },
] as const)(
  "cleans up and preserves the original error when %s fails",
  async ({ failure, cleanupFails }) => {
    const { tmux, attach, killSession, setSessionTitle } = createWorkspaceTmux();
    const setupError = new Error(`${failure} failed`);
    const createLayoutMock = mock<typeof createLayout>().mockResolvedValue({
      editor: { windowId: "@1", paneId: "%1" },
      environment: {
        TERMWIRE_SESSION: "repo-dev",
        TERMWIRE_SOCKET: "/tmp/termwire/repo-dev.sock",
        TERMWIRE_EDITOR_PANE: "%1",
      },
    });
    if (failure === "createLayout") createLayoutMock.mockRejectedValue(setupError);
    if (failure === "attach") attach.mockRejectedValue(setupError);
    if (failure === "setSessionTitle") setSessionTitle.mockRejectedValue(setupError);
    if (cleanupFails) killSession.mockRejectedValue(new Error("cleanup failed"));

    await expect(
      up(
        { name: "dev" },
        {
          cwd: () => "/repo",
          findGitRoot: async () => "/repo",
          prepareBranch: async () => {},
          prepareWorktree: async () => "/worktrees/repo-feature",
          mkdir: async () => {},
          removeFile: async () => {},
          tmux,
          createLayout: createLayoutMock,
        },
      ),
    ).rejects.toBe(setupError);

    expect(killSession).toHaveBeenCalledWith("repo-dev");
  },
);

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
      prepareBranch: mock<(options: { cwd: string; name: string }) => Promise<void>>(),
      prepareWorktree,
      mkdir: mock<(path: string) => Promise<void>>().mockResolvedValue(),
      removeFile: mock<(path: string) => Promise<void>>().mockResolvedValue(),
      tmux,
    },
  );

  expect(newSession).toHaveBeenCalledWith({ session: "repo-dev", name: "editor", cwd: "/repo" });
  expect(prepareWorktree).not.toHaveBeenCalled();
});

test("uses the exact slash-preserving request name for a bare worktree branch", async () => {
  const { tmux, newSession } = createWorkspaceTmux();
  const prepareWorktree =
    mock<
      (options: { gitRoot: string; project: string; name: string }) => Promise<string>
    >().mockResolvedValue("/repo-chore-improve");

  await up(
    { name: "chore/improve", worktree: true },
    {
      cwd: mock<() => string>().mockReturnValue("/repo"),
      findGitRoot: mock<(cwd: string) => Promise<string | undefined>>().mockResolvedValue("/repo"),
      prepareBranch: mock<(options: { cwd: string; name: string }) => Promise<void>>(),
      prepareWorktree,
      mkdir: mock<(path: string) => Promise<void>>().mockResolvedValue(),
      removeFile: mock<(path: string) => Promise<void>>().mockResolvedValue(),
      tmux,
    },
  );

  expect(prepareWorktree).toHaveBeenCalledWith({
    gitRoot: "/repo",
    project: "repo",
    name: "chore/improve",
    branch: "chore/improve",
  });
  expect(newSession).toHaveBeenCalledWith({
    session: "repo-chore-improve",
    name: "editor",
    cwd: "/repo-chore-improve",
  });
});

test("keeps an explicit worktree key independent from the branch override", async () => {
  const { tmux, newSession } = createWorkspaceTmux();
  const prepareWorktree =
    mock<
      (options: { gitRoot: string; project: string; name: string }) => Promise<string>
    >().mockResolvedValue("/repo-legacy-name");

  await up(
    { name: "dev", worktree: "legacy-name", branch: "feature/api" },
    {
      cwd: mock<() => string>().mockReturnValue("/repo"),
      findGitRoot: mock<(cwd: string) => Promise<string | undefined>>().mockResolvedValue("/repo"),
      prepareBranch: mock<(options: { cwd: string; name: string }) => Promise<void>>(),
      prepareWorktree,
      mkdir: mock<(path: string) => Promise<void>>().mockResolvedValue(),
      removeFile: mock<(path: string) => Promise<void>>().mockResolvedValue(),
      tmux,
    },
  );

  expect(prepareWorktree).toHaveBeenCalledWith({
    gitRoot: "/repo",
    project: "repo",
    name: "legacy-name",
    branch: "feature/api",
  });
  expect(newSession).toHaveBeenCalledWith({
    session: "repo-dev",
    name: "editor",
    cwd: "/repo-legacy-name",
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
        prepareBranch: mock<(options: { cwd: string; name: string }) => Promise<void>>(),
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
        prepareBranch: mock<(options: { cwd: string; name: string }) => Promise<void>>(),
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
      { name: "n".repeat(83) },
      {
        cwd: mock<() => string>().mockReturnValue("/tmp/p"),
        findGitRoot:
          mock<(cwd: string) => Promise<string | undefined>>().mockResolvedValue(undefined),
        prepareBranch: mock<(options: { cwd: string; name: string }) => Promise<void>>(),
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
  const setSessionTitle = mock<(session: string) => Promise<void>>().mockImplementation(
    async () => {
      events.push("setSessionTitle");
    },
  );
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
    setSessionTitle,
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
      prepareBranch: mock<(options: { cwd: string; name: string }) => Promise<void>>(),
      prepareWorktree:
        mock<(options: { gitRoot: string; project: string; name: string }) => Promise<string>>(),
      mkdir,
      removeFile,
      tmux,
    },
  );

  const environment = {
    TERMWIRE_SESSION: "repo-dev",
    TERMWIRE_SOCKET: "/tmp/termwire/repo-dev.sock",
    TERMWIRE_EDITOR_PANE: "%1",
  };
  expect(mkdir).toHaveBeenCalledWith("/tmp/termwire");
  expect(removeFile).toHaveBeenCalledWith("/tmp/termwire/repo-dev.sock");
  expect(newSession).toHaveBeenCalledWith({ session: "repo-dev", name: "editor", cwd: "/repo" });
  expect(setSessionTitle).toHaveBeenCalledWith("repo-dev");
  expect(setEnvironment.mock.calls).toEqual([
    ["repo-dev", "TERMWIRE_SESSION", "repo-dev"],
    ["repo-dev", "TERMWIRE_SOCKET", "/tmp/termwire/repo-dev.sock"],
    ["repo-dev", "TERMWIRE_EDITOR_PANE", "%1"],
  ]);
  expect(respawnPane).toHaveBeenCalledWith({
    target: "%1",
    cwd: "/repo",
    command: ["nvim", "--listen", "/tmp/termwire/repo-dev.sock"],
    environment,
  });
  expect(newWindow).toHaveBeenCalledWith({
    target: "repo-dev",
    name: "shell",
    cwd: "/repo",
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
    "setSessionTitle",
    "newWindow",
    "setEnvironment:TERMWIRE_SESSION",
    "setEnvironment:TERMWIRE_SOCKET",
    "setEnvironment:TERMWIRE_EDITOR_PANE",
    "respawnPane",
    "respawnPane",
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
        prepareBranch: mock<(options: { cwd: string; name: string }) => Promise<void>>(),
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
        prepareBranch: mock<(options: { cwd: string; name: string }) => Promise<void>>(),
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
        prepareBranch: mock<(options: { cwd: string; name: string }) => Promise<void>>(),
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

test("uses an explicit branch without changing the worktree directory key", async () => {
  const { tmux } = createWorkspaceTmux();
  const prepareWorktree =
    mock<
      (options: {
        gitRoot: string;
        project: string;
        name: string;
        branch: string;
      }) => Promise<string>
    >().mockResolvedValue("/repo-dev");

  await up(
    { name: "dev", worktree: true, branch: "chore/improve" },
    {
      cwd: () => "/repo",
      findGitRoot: async () => "/repo",
      prepareBranch: mock<(options: { cwd: string; name: string }) => Promise<void>>(),
      prepareWorktree,
      mkdir: async () => {},
      removeFile: async () => {},
      tmux,
    },
  );

  expect(prepareWorktree).toHaveBeenCalledWith({
    gitRoot: "/repo",
    project: "repo",
    name: "dev",
    branch: "chore/improve",
  });
});

test("prepares an explicit branch in the current checkout", async () => {
  const { tmux, newSession } = createWorkspaceTmux();
  const prepareBranch =
    mock<(options: { cwd: string; name: string }) => Promise<void>>().mockResolvedValue();

  await up(
    { name: "dev", branch: "feature/api" },
    {
      cwd: () => "/repo",
      findGitRoot: async () => "/repo",
      prepareBranch,
      prepareWorktree:
        mock<
          (options: {
            gitRoot: string;
            project: string;
            name: string;
            branch: string;
          }) => Promise<string>
        >(),
      mkdir: async () => {},
      removeFile: async () => {},
      tmux,
    },
  );

  expect(prepareBranch).toHaveBeenCalledWith({ cwd: "/repo", name: "feature/api" });
  expect(newSession).toHaveBeenCalledWith({ session: "repo-dev", name: "editor", cwd: "/repo" });
});

test("rejects a branch request outside a Git repository", async () => {
  const { tmux, newSession } = createWorkspaceTmux();
  const prepareBranch = mock<(options: { cwd: string; name: string }) => Promise<void>>();

  await expect(
    up(
      { name: "dev", branch: "feature/api" },
      {
        cwd: () => "/tmp/project",
        findGitRoot: async () => undefined,
        prepareBranch,
        prepareWorktree:
          mock<
            (options: {
              gitRoot: string;
              project: string;
              name: string;
              branch: string;
            }) => Promise<string>
          >(),
        mkdir: async () => {},
        removeFile: async () => {},
        tmux,
      },
    ),
  ).rejects.toThrow("branch requires a Git repository");
  expect(prepareBranch).not.toHaveBeenCalled();
  expect(newSession).not.toHaveBeenCalled();
});

test("rejects an empty direct branch request before checking tmux", async () => {
  const { tmux, hasSession } = createWorkspaceTmux(true);

  await expect(
    up(
      { name: "dev", branch: "" },
      {
        cwd: () => "/repo",
        findGitRoot: async () => "/repo",
        prepareBranch: mock<(options: { cwd: string; name: string }) => Promise<void>>(),
        prepareWorktree:
          mock<
            (options: {
              gitRoot: string;
              project: string;
              name: string;
              branch: string;
            }) => Promise<string>
          >(),
        mkdir: async () => {},
        removeFile: async () => {},
        tmux,
      },
    ),
  ).rejects.toThrow("branch name must not be empty");
  expect(hasSession).not.toHaveBeenCalled();
});

function createUpDependencies(
  dependencies: Omit<
    UpDependencies,
    "loadGlobalConfig" | "loadProjectConfig" | "resolveLayout" | "createLayout"
  > &
    Partial<
      Pick<
        UpDependencies,
        "loadGlobalConfig" | "loadProjectConfig" | "resolveLayout" | "createLayout"
      >
    >,
): UpDependencies {
  return {
    loadGlobalConfig: async () => undefined,
    loadProjectConfig: async () => undefined,
    resolveLayout: () => defaultLayout,
    createLayout,
    ...dependencies,
  };
}

function up(
  request: Parameters<typeof runUp>[0],
  dependencies: Omit<
    UpDependencies,
    "loadGlobalConfig" | "loadProjectConfig" | "resolveLayout" | "createLayout"
  > &
    Partial<
      Pick<
        UpDependencies,
        "loadGlobalConfig" | "loadProjectConfig" | "resolveLayout" | "createLayout"
      >
    >,
): ReturnType<typeof runUp> {
  return runUp(request, createUpDependencies(dependencies));
}

function createWorkspaceTmux(sessionExists = false) {
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
  const setSessionTitle =
    mock<ReturnType<typeof createTmux>["setSessionTitle"]>().mockResolvedValue();

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
      setSessionTitle,
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
    setSessionTitle,
  };
}

import { expect, mock, test } from "bun:test";
import type { createTmux } from "@termwire/tmux";
import type { LayoutConfig } from "./config-schema";
import { createLayout } from "./layout";

test("creates later panes and windows in declaration order while mapping the initial pane", async () => {
  const splitPane = mock<ReturnType<typeof createTmux>["splitPane"]>().mockResolvedValue("%2");
  const newWindow = mock<ReturnType<typeof createTmux>["newWindow"]>().mockResolvedValue({
    windowId: "@2",
    paneId: "%3",
  });
  const setEnvironment =
    mock<ReturnType<typeof createTmux>["setEnvironment"]>().mockResolvedValue();
  const respawnPane = mock<ReturnType<typeof createTmux>["respawnPane"]>().mockResolvedValue();
  const selectWindow = mock<ReturnType<typeof createTmux>["selectWindow"]>().mockResolvedValue();
  const selectPane = mock<ReturnType<typeof createTmux>["selectPane"]>().mockResolvedValue();
  const tmux = {
    splitPane,
    newWindow,
    setEnvironment,
    respawnPane,
    selectWindow,
    selectPane,
  } as unknown as ReturnType<typeof createTmux>;
  const layout: LayoutConfig = {
    windows: [
      {
        name: "work",
        panes: [
          { id: "editor", role: "editor" },
          { id: "shell", splitFrom: "editor", direction: "horizontal" },
        ],
      },
      { name: "logs", panes: [{ id: "tail" }] },
    ],
  };

  const result = await createLayout({
    tmux,
    session: "repo-dev",
    workspace: "/repo",
    socket: "/tmp/termwire/repo-dev.sock",
    layout,
    initial: { windowId: "@1", paneId: "%1" },
  });

  expect(splitPane).toHaveBeenCalledWith({
    target: "%1",
    direction: "horizontal",
    sizePercent: undefined,
    cwd: "/repo",
  });
  expect(newWindow).toHaveBeenCalledWith({ target: "repo-dev", name: "logs", cwd: "/repo" });
  expect(result.editor).toEqual({ windowId: "@1", paneId: "%1" });
});

test("sets the complete environment and respawns only after all pane ids are mapped", async () => {
  const events: string[] = [];
  const splitPane = mock<ReturnType<typeof createTmux>["splitPane"]>().mockImplementation(
    async () => {
      events.push("split");
      return "%2";
    },
  );
  const newWindow = mock<ReturnType<typeof createTmux>["newWindow"]>().mockImplementation(
    async () => {
      events.push("window");
      return { windowId: "@2", paneId: "%3" };
    },
  );
  const setEnvironment = mock<ReturnType<typeof createTmux>["setEnvironment"]>().mockImplementation(
    async (_session, key) => {
      events.push(`environment:${key}`);
    },
  );
  const respawnPane = mock<ReturnType<typeof createTmux>["respawnPane"]>().mockImplementation(
    async (options) => {
      events.push(`respawn:${options.target}`);
    },
  );
  const selectWindow = mock<ReturnType<typeof createTmux>["selectWindow"]>().mockResolvedValue();
  const selectPane = mock<ReturnType<typeof createTmux>["selectPane"]>().mockResolvedValue();
  const tmux = {
    splitPane,
    newWindow,
    setEnvironment,
    respawnPane,
    selectWindow,
    selectPane,
  } as unknown as ReturnType<typeof createTmux>;
  const environment = {
    TERMWIRE_SESSION: "repo-dev",
    TERMWIRE_SOCKET: "/tmp/termwire/repo-dev.sock",
    TERMWIRE_EDITOR_PANE: "%1",
  };

  await createLayout({
    tmux,
    session: "repo-dev",
    workspace: "/repo",
    socket: "/tmp/termwire/repo-dev.sock",
    layout: {
      windows: [
        {
          name: "work",
          panes: [
            { id: "editor", role: "editor" },
            { id: "shell", splitFrom: "editor", direction: "horizontal" },
          ],
        },
        { name: "logs", panes: [{ id: "tail" }] },
      ],
    },
    initial: { windowId: "@1", paneId: "%1" },
  });

  expect(setEnvironment.mock.calls).toEqual([
    ["repo-dev", "TERMWIRE_SESSION", "repo-dev"],
    ["repo-dev", "TERMWIRE_SOCKET", "/tmp/termwire/repo-dev.sock"],
    ["repo-dev", "TERMWIRE_EDITOR_PANE", "%1"],
  ]);
  expect(respawnPane.mock.calls).toEqual([
    [expect.objectContaining({ target: "%1", cwd: "/repo", environment })],
    [expect.objectContaining({ target: "%2", cwd: "/repo", environment })],
    [expect.objectContaining({ target: "%3", cwd: "/repo", environment })],
  ]);
  expect(events).toEqual([
    "split",
    "window",
    "environment:TERMWIRE_SESSION",
    "environment:TERMWIRE_SOCKET",
    "environment:TERMWIRE_EDITOR_PANE",
    "respawn:%1",
    "respawn:%2",
    "respawn:%3",
  ]);
});

test("uses editor, configured argv, and default-shell commands for respawns", async () => {
  const splitPane = mock<ReturnType<typeof createTmux>["splitPane"]>()
    .mockResolvedValueOnce("%2")
    .mockResolvedValueOnce("%3");
  const setEnvironment =
    mock<ReturnType<typeof createTmux>["setEnvironment"]>().mockResolvedValue();
  const respawnPane = mock<ReturnType<typeof createTmux>["respawnPane"]>().mockResolvedValue();
  const selectWindow = mock<ReturnType<typeof createTmux>["selectWindow"]>().mockResolvedValue();
  const selectPane = mock<ReturnType<typeof createTmux>["selectPane"]>().mockResolvedValue();
  const tmux = {
    splitPane,
    setEnvironment,
    respawnPane,
    selectWindow,
    selectPane,
  } as unknown as ReturnType<typeof createTmux>;

  await createLayout({
    tmux,
    session: "repo-dev",
    workspace: "/repo",
    socket: "/tmp/termwire/repo-dev.sock",
    layout: {
      windows: [
        {
          name: "work",
          panes: [
            { id: "editor", role: "editor" },
            { id: "login", splitFrom: "editor", direction: "horizontal", command: ["zsh", "-l"] },
            { id: "shell", splitFrom: "editor", direction: "vertical" },
          ],
        },
      ],
    },
    initial: { windowId: "@1", paneId: "%1" },
  });

  expect(respawnPane.mock.calls).toEqual([
    [
      expect.objectContaining({
        target: "%1",
        command: ["nvim", "--listen", "/tmp/termwire/repo-dev.sock"],
      }),
    ],
    [expect.objectContaining({ target: "%2", command: ["zsh", "-l"] })],
    [expect.objectContaining({ target: "%3", command: undefined })],
  ]);
});

test("focuses the editor window and pane after respawning panes", async () => {
  const events: string[] = [];
  const setEnvironment = mock<ReturnType<typeof createTmux>["setEnvironment"]>().mockImplementation(
    async () => {
      events.push("environment");
    },
  );
  const respawnPane = mock<ReturnType<typeof createTmux>["respawnPane"]>().mockImplementation(
    async () => {
      events.push("respawn");
    },
  );
  const selectWindow = mock<ReturnType<typeof createTmux>["selectWindow"]>().mockImplementation(
    async (target) => {
      events.push(`window:${target}`);
    },
  );
  const selectPane = mock<ReturnType<typeof createTmux>["selectPane"]>().mockImplementation(
    async (target) => {
      events.push(`pane:${target}`);
    },
  );
  const tmux = {
    setEnvironment,
    respawnPane,
    selectWindow,
    selectPane,
  } as unknown as ReturnType<typeof createTmux>;

  await createLayout({
    tmux,
    session: "repo-dev",
    workspace: "/repo",
    socket: "/tmp/termwire/repo-dev.sock",
    layout: { windows: [{ name: "work", panes: [{ id: "editor", role: "editor" }] }] },
    initial: { windowId: "@1", paneId: "%1" },
  });

  expect(events).toEqual([
    "environment",
    "environment",
    "environment",
    "respawn",
    "window:@1",
    "pane:%1",
  ]);
});

test("keeps pane mappings distinct when window and pane names contain colons", async () => {
  const newWindow = mock<ReturnType<typeof createTmux>["newWindow"]>().mockResolvedValue({
    windowId: "@2",
    paneId: "%2",
  });
  const setEnvironment =
    mock<ReturnType<typeof createTmux>["setEnvironment"]>().mockResolvedValue();
  const respawnPane = mock<ReturnType<typeof createTmux>["respawnPane"]>().mockResolvedValue();
  const selectWindow = mock<ReturnType<typeof createTmux>["selectWindow"]>().mockResolvedValue();
  const selectPane = mock<ReturnType<typeof createTmux>["selectPane"]>().mockResolvedValue();
  const tmux = {
    newWindow,
    setEnvironment,
    respawnPane,
    selectWindow,
    selectPane,
  } as unknown as ReturnType<typeof createTmux>;

  const result = await createLayout({
    tmux,
    session: "repo-dev",
    workspace: "/repo",
    socket: "/tmp/termwire/repo-dev.sock",
    layout: {
      windows: [
        { name: "a:b", panes: [{ id: "c", role: "editor" }] },
        { name: "a", panes: [{ id: "b:c" }] },
      ],
    },
    initial: { windowId: "@1", paneId: "%1" },
  });

  expect(result.editor).toEqual({ windowId: "@1", paneId: "%1" });
  expect(result.environment.TERMWIRE_EDITOR_PANE).toBe("%1");
  expect(respawnPane.mock.calls).toEqual([
    [expect.objectContaining({ target: "%1" })],
    [expect.objectContaining({ target: "%2" })],
  ]);
});

test("uses an editor pane created after the initial ordinary shell", async () => {
  const splitPane = mock<ReturnType<typeof createTmux>["splitPane"]>()
    .mockResolvedValueOnce("%2")
    .mockResolvedValueOnce("%3");
  const setEnvironment =
    mock<ReturnType<typeof createTmux>["setEnvironment"]>().mockResolvedValue();
  const respawnPane = mock<ReturnType<typeof createTmux>["respawnPane"]>().mockResolvedValue();
  const selectWindow = mock<ReturnType<typeof createTmux>["selectWindow"]>().mockResolvedValue();
  const selectPane = mock<ReturnType<typeof createTmux>["selectPane"]>().mockResolvedValue();
  const tmux = {
    splitPane,
    setEnvironment,
    respawnPane,
    selectWindow,
    selectPane,
  } as unknown as ReturnType<typeof createTmux>;

  const result = await createLayout({
    tmux,
    session: "repo-dev",
    workspace: "/repo",
    socket: "/tmp/termwire/repo-dev.sock",
    layout: {
      windows: [
        {
          name: "work",
          panes: [
            { id: "shell", command: ["zsh", "-l"] },
            { id: "editor", role: "editor", splitFrom: "shell", direction: "horizontal" },
            { id: "tail", splitFrom: "editor", direction: "vertical" },
          ],
        },
      ],
    },
    initial: { windowId: "@1", paneId: "%1" },
  });

  expect(splitPane.mock.calls).toEqual([
    [{ target: "%1", direction: "horizontal", sizePercent: undefined, cwd: "/repo" }],
    [{ target: "%2", direction: "vertical", sizePercent: undefined, cwd: "/repo" }],
  ]);
  expect(result.editor).toEqual({ windowId: "@1", paneId: "%2" });
  expect(result.environment.TERMWIRE_EDITOR_PANE).toBe("%2");
  expect(respawnPane.mock.calls).toEqual([
    [expect.objectContaining({ target: "%1", command: ["zsh", "-l"] })],
    [
      expect.objectContaining({
        target: "%2",
        command: ["nvim", "--listen", "/tmp/termwire/repo-dev.sock"],
      }),
    ],
    [expect.objectContaining({ target: "%3", command: undefined })],
  ]);
  expect(selectWindow).toHaveBeenCalledWith("@1");
  expect(selectPane).toHaveBeenCalledWith("%2");
});

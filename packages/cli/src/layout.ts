import type { createTmux } from "@termwire/tmux";
import type { LayoutConfig, PaneConfig } from "./config-schema";

type MappedPane = { windowId: string; paneId: string };
type PaneMappings = Map<string, Map<string, MappedPane>>;

export async function createLayout(options: {
  tmux: ReturnType<typeof createTmux>;
  session: string;
  workspace: string;
  socket: string;
  layout: LayoutConfig;
  initial: { windowId: string; paneId: string };
}): Promise<{ editor: { windowId: string; paneId: string }; environment: Record<string, string> }> {
  const paneMappings = await createPaneMappings(options);

  const editor = findEditor(options.layout, paneMappings);
  const environment = createWorkspaceEnvironment(options.session, options.socket, editor.paneId);
  await setSessionEnvironment(options.tmux, options.session, environment);
  await respawnPanes({
    tmux: options.tmux,
    workspace: options.workspace,
    socket: options.socket,
    layout: options.layout,
    paneMappings,
    environment,
  });

  await focusEditor(options.tmux, editor);

  return { editor, environment };
}

function setPaneMapping(
  mappings: PaneMappings,
  windowName: string,
  paneId: string,
  mappedPane: MappedPane,
): void {
  let windowMappings = mappings.get(windowName);
  if (!windowMappings) {
    windowMappings = new Map<string, MappedPane>();
    mappings.set(windowName, windowMappings);
  }
  windowMappings.set(paneId, mappedPane);
}

function getPaneMapping(
  mappings: PaneMappings,
  windowName: string,
  paneId: string,
): MappedPane | undefined {
  return mappings.get(windowName)?.get(paneId);
}

function createWorkspaceEnvironment(session: string, socket: string, editorPane: string) {
  return {
    TERMWIRE_SESSION: session,
    TERMWIRE_SOCKET: socket,
    TERMWIRE_EDITOR_PANE: editorPane,
  };
}

function commandForPane(pane: PaneConfig, socket: string): readonly string[] | undefined {
  return pane.role === "editor" ? ["nvim", "--listen", socket] : pane.command;
}

async function createPaneMappings(options: {
  tmux: ReturnType<typeof createTmux>;
  session: string;
  workspace: string;
  layout: LayoutConfig;
  initial: MappedPane;
}): Promise<PaneMappings> {
  const paneMappings: PaneMappings = new Map();
  const firstWindow = options.layout.windows[0];
  const firstPane = firstWindow.panes[0];
  setPaneMapping(paneMappings, firstWindow.name, firstPane.id, options.initial);

  for (const [windowIndex, window] of options.layout.windows.entries()) {
    let windowId = windowIndex === 0 ? options.initial.windowId : undefined;
    for (const [paneIndex, pane] of window.panes.entries()) {
      if (windowIndex === 0 && paneIndex === 0) continue;
      if (paneIndex === 0) {
        const created = await options.tmux.newWindow({
          target: options.session,
          name: window.name,
          cwd: options.workspace,
        });
        windowId = created.windowId;
        setPaneMapping(paneMappings, window.name, pane.id, created);
        continue;
      }
      const target = getPaneMapping(paneMappings, window.name, pane.splitFrom ?? "");
      const paneId = await options.tmux.splitPane({
        target: target?.paneId ?? "",
        direction: pane.direction ?? "horizontal",
        sizePercent: pane.sizePercent,
        cwd: options.workspace,
      });
      setPaneMapping(paneMappings, window.name, pane.id, { windowId: windowId ?? "", paneId });
    }
  }

  return paneMappings;
}

function findEditor(layout: LayoutConfig, paneMappings: PaneMappings): MappedPane {
  let editor: MappedPane | undefined;
  for (const window of layout.windows) {
    for (const pane of window.panes) {
      const mappedPane = getPaneMapping(paneMappings, window.name, pane.id);
      if (pane.role === "editor") editor = mappedPane;
    }
  }
  if (!editor) throw new Error("layout does not contain an editor pane");
  return editor;
}

async function setSessionEnvironment(
  tmux: ReturnType<typeof createTmux>,
  session: string,
  environment: Record<string, string>,
): Promise<void> {
  for (const [key, value] of Object.entries(environment)) {
    await tmux.setEnvironment(session, key, value);
  }
}

async function respawnPanes(options: {
  tmux: ReturnType<typeof createTmux>;
  workspace: string;
  socket: string;
  layout: LayoutConfig;
  paneMappings: PaneMappings;
  environment: Record<string, string>;
}): Promise<void> {
  for (const window of options.layout.windows) {
    for (const pane of window.panes) {
      const mappedPane = getPaneMapping(options.paneMappings, window.name, pane.id);
      if (!mappedPane) throw new Error(`layout pane is not mapped: ${pane.id}`);
      await options.tmux.respawnPane({
        target: mappedPane.paneId,
        cwd: options.workspace,
        environment: options.environment,
        command: commandForPane(pane, options.socket),
      });
    }
  }
}

async function focusEditor(tmux: ReturnType<typeof createTmux>, editor: MappedPane): Promise<void> {
  await tmux.selectWindow(editor.windowId);
  await tmux.selectPane(editor.paneId);
}

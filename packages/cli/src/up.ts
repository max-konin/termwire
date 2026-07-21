import type { createTmux } from "@termwire/tmux";
import { createIdentity } from "./identity";

export interface UpRequest {
  name: string;
  worktree?: true | string;
  branch?: string;
}

export interface UpDependencies {
  cwd: () => string;
  findGitRoot: (cwd: string) => Promise<string | undefined>;
  prepareBranch: (options: { cwd: string; name: string }) => Promise<void>;
  prepareWorktree: (options: {
    gitRoot: string;
    project: string;
    name: string;
    branch: string;
  }) => Promise<string>;
  mkdir: (path: string) => Promise<void>;
  removeFile: (path: string) => Promise<void>;
  tmux: ReturnType<typeof createTmux>;
}

export async function up(request: UpRequest, dependencies: UpDependencies): Promise<void> {
  if (request.worktree === "") {
    throw new Error("worktree name must not be empty");
  }
  if (request.branch === "") {
    throw new Error("branch name must not be empty");
  }

  const cwd = dependencies.cwd();
  const gitRoot = await dependencies.findGitRoot(cwd);
  const identity = createIdentity({ cwd, gitRoot, name: request.name });

  if (await dependencies.tmux.hasSession(identity.session)) {
    await dependencies.tmux.attach(identity.session);
    return;
  }

  const workspace = await resolveWorkspace(request, dependencies, identity, gitRoot, cwd);

  await dependencies.mkdir("/tmp/termwire");
  await dependencies.removeFile(identity.socket);
  const editor = await dependencies.tmux.newSession({
    session: identity.session,
    name: "editor",
    cwd: workspace,
  });
  const environment = createWorkspaceEnvironment(identity, editor.paneId);
  try {
    await configureWorkspaceSession({
      tmux: dependencies.tmux,
      identity,
      workspace,
      editor,
      environment,
    });
  } catch (error) {
    await bestEffortKillSession(dependencies.tmux, identity.session);
    throw error;
  }
  await dependencies.tmux.attach(identity.session);
}

async function resolveWorkspace(
  request: UpRequest,
  dependencies: UpDependencies,
  identity: ReturnType<typeof createIdentity>,
  gitRoot: string | undefined,
  cwd: string,
): Promise<string> {
  if (request.worktree === undefined) {
    if (request.branch !== undefined) {
      if (!gitRoot) {
        throw new Error("branch requires a Git repository");
      }
      await dependencies.prepareBranch({ cwd, name: request.branch });
    }
    return cwd;
  }
  if (!gitRoot) {
    throw new Error("worktree requires a Git repository");
  }
  const name = request.worktree === true ? request.name : request.worktree;
  return dependencies.prepareWorktree({
    gitRoot,
    project: identity.project,
    name,
    branch: request.branch ?? name,
  });
}

function createWorkspaceEnvironment(
  identity: ReturnType<typeof createIdentity>,
  editorPane: string,
) {
  return {
    TERMWIRE_SESSION: identity.session,
    TERMWIRE_SOCKET: identity.socket,
    TERMWIRE_EDITOR_PANE: editorPane,
  };
}

async function configureWorkspaceSession(options: {
  tmux: ReturnType<typeof createTmux>;
  identity: ReturnType<typeof createIdentity>;
  workspace: string;
  editor: { windowId: string; paneId: string };
  environment: Record<string, string>;
}): Promise<void> {
  for (const [key, value] of Object.entries(options.environment)) {
    await options.tmux.setEnvironment(options.identity.session, key, value);
  }
  await options.tmux.respawnPane({
    target: options.editor.paneId,
    cwd: options.workspace,
    command: ["nvim", "--listen", options.identity.socket],
    environment: options.environment,
  });
  await options.tmux.newWindow({
    target: options.identity.session,
    name: "shell",
    cwd: options.workspace,
    environment: options.environment,
  });
  await options.tmux.selectWindow(options.editor.windowId);
  await options.tmux.selectPane(options.editor.paneId);
}

async function bestEffortKillSession(
  tmux: ReturnType<typeof createTmux>,
  session: string,
): Promise<void> {
  try {
    await tmux.killSession(session);
  } catch {
    // Preserve the workspace setup failure when best-effort cleanup fails.
  }
}

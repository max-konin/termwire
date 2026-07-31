import type { createTmux } from "@termwire/tmux";
import type { LayoutConfig } from "./config-schema";
import type { LoadedConfig } from "./config-types";
import { createIdentity } from "./identity";
import type { createLayout } from "./layout";

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
  loadGlobalConfig: () => Promise<LoadedConfig | undefined>;
  loadProjectConfig: (gitRoot: string) => Promise<LoadedConfig | undefined>;
  resolveLayout: (
    globalConfig: LoadedConfig | undefined,
    projectConfig: LoadedConfig | undefined,
  ) => LayoutConfig;
  createLayout: typeof createLayout;
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
  const layout = await loadEffectiveLayout(workspace, dependencies);

  await dependencies.mkdir("/tmp/termwire");
  await dependencies.removeFile(identity.socket);
  const initial = await dependencies.tmux.newSession({
    session: identity.session,
    name: layout.windows[0].name,
    cwd: workspace,
  });
  try {
    await dependencies.createLayout({
      tmux: dependencies.tmux,
      session: identity.session,
      workspace,
      socket: identity.socket,
      layout,
      initial,
    });
    await dependencies.tmux.attach(identity.session);
  } catch (error) {
    await bestEffortKillSession(dependencies.tmux, identity.session);
    throw error;
  }
}

async function loadEffectiveLayout(
  workspace: string,
  dependencies: UpDependencies,
): Promise<LayoutConfig> {
  const globalConfig = await dependencies.loadGlobalConfig();
  const gitRoot = await dependencies.findGitRoot(workspace);
  const projectConfig =
    gitRoot === undefined ? undefined : await dependencies.loadProjectConfig(gitRoot);
  return dependencies.resolveLayout(globalConfig, projectConfig);
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

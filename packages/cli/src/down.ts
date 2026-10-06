import { dirname, resolve, sep } from "node:path";
import { createIdentity } from "./identity.js";
import { sessionVariable } from "./process-scan.js";
import type { WorktreeState } from "./worktree.js";

export interface DownRequest {
  /** Omitted inside a workspace, where the inherited label names the session. */
  name?: string;
  worktree?: true;
  force?: true;
}

export interface DownResult {
  session: string;
  /** Present only when a worktree was removed. */
  worktree?: string;
}

/** The fields of a tmux session this command reads, as the adapter reports them. */
export interface DownSession {
  name: string;
  path: string;
}

export interface DownDependencies {
  cwd: () => string;
  /** Called before this command's own directory is removed from under it. */
  chdir: (path: string) => void;
  env: Record<string, string | undefined>;
  findGitRoot: (cwd: string) => Promise<string | undefined>;
  listSessions: () => Promise<DownSession[]>;
  killSession: (session: string) => Promise<void>;
  inspectWorktree: (path: string) => Promise<WorktreeState>;
  removeWorktree: (path: string, options: { force: boolean }) => Promise<void>;
}

/** What `assertRemovable` weighs: the worktree, where we stand, and what was asked. */
interface RemovalCheck extends Pick<DownDependencies, "inspectWorktree"> {
  path: string;
  cwd: string;
  force: boolean;
  ownSession: boolean;
}

/** A removal that follows a kill, which is why it carries the session's name. */
interface KilledRemoval extends Pick<DownDependencies, "removeWorktree"> {
  session: string;
  path: string;
  force: boolean;
}

/**
 * Teardown. A name goes through `createIdentity`, so `up foo` and `down foo` always
 * mean one session; without a name the inherited `TERMWIRE_SESSION` names it, which is
 * how a workspace tears itself down from the inside. The tmux listing knows where it
 * lives.
 *
 * Processes are not hunted here: the global `session-closed` hook `up` installs runs
 * `_reap` for exactly that.
 */
export async function down(
  request: DownRequest,
  {
    cwd,
    chdir,
    env,
    findGitRoot,
    listSessions,
    killSession,
    inspectWorktree,
    removeWorktree,
  }: DownDependencies,
): Promise<DownResult> {
  const directory = cwd();
  const target = await resolveSession(request, { cwd: directory, env, findGitRoot });
  const sessions = await listSessions();
  const session = sessions.find((entry) => entry.name === target);

  if (session === undefined) {
    throw new Error(`no workspace session named ${target}`);
  }

  if (request.worktree !== true) {
    await killSession(target);
    return { session: target };
  }

  /** Whether the session being torn down is the one this command is running in. */
  const ownSession = env[sessionVariable]?.trim() === target;
  const force = request.force === true;

  // Everything is refused before anything is destroyed, so a refusal leaves the
  // session running and the worktree untouched.
  await assertRemovable({ path: session.path, cwd: directory, force, ownSession, inspectWorktree });

  if (ownSession) {
    // The kill ends this process with its pane, so it goes last. And the kill is a
    // spawn, which fails with ENOENT from a deleted working directory, so step out of
    // the worktree first; the parent of a worktree always outlives it.
    if (contains(session.path, directory)) chdir(dirname(session.path));
    await removeWorktree(session.path, { force });
    await killSession(target);
  } else {
    // Nothing of ours dies here, so the processes go first and their files after them.
    await killSession(target);
    await removeKilledWorktree({ session: target, path: session.path, force, removeWorktree });
  }

  return { session: target, worktree: session.path };
}

/**
 * A name is resolved from the current directory, exactly as `up` resolves it. Without
 * one, the session is the workspace this command is running in, which is the only way
 * to name a worktree session from inside it: there the Git root is the worktree, so
 * `createIdentity` would build `<worktree>-<name>` and find nothing.
 */
async function resolveSession(
  request: DownRequest,
  { cwd, env, findGitRoot }: { cwd: string } & Pick<DownDependencies, "env" | "findGitRoot">,
): Promise<string> {
  if (request.name === undefined) {
    const session = env[sessionVariable]?.trim();
    if (!session) {
      throw new Error("not inside a termwire workspace");
    }
    return session;
  }

  const gitRoot = await findGitRoot(cwd);
  return createIdentity({ cwd, gitRoot, name: request.name }).session;
}

/**
 * The session is already gone by the time the worktree is removed, so a failure here
 * says so: `down` cannot be retried for a session that no longer exists, and the user
 * needs to know that `git worktree remove` is what is left to do.
 */
async function removeKilledWorktree({
  session,
  path,
  force,
  removeWorktree,
}: KilledRemoval): Promise<void> {
  try {
    await removeWorktree(path, { force });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`session ${session} was killed, but its worktree was not removed: ${message}`, {
      cause,
    });
  }
}

async function assertRemovable({
  path,
  cwd,
  force,
  ownSession,
  inspectWorktree,
}: RemovalCheck): Promise<void> {
  // Sawing off the branch you stand on, unless the shell standing there is itself part
  // of what is being torn down: it dies with the session a moment later.
  if (!ownSession && contains(path, cwd)) {
    throw new Error(`refusing to remove the directory this command runs in: ${path}`);
  }

  const state = await inspectWorktree(path);

  if (state.main) {
    throw new Error(`refusing to remove the main checkout: ${path}`);
  }
  if (state.dirty && !force) {
    throw new Error(`${path} has uncommitted changes: pass --force to remove it anyway`);
  }
}

/** Whether `inner` is `outer` itself or lies below it. */
function contains(outer: string, inner: string): boolean {
  const base = resolve(outer);
  const nested = resolve(inner);
  return nested === base || nested.startsWith(`${base}${sep}`);
}

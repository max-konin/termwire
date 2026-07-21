import { realpath as resolveRealpath } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { sanitizeComponent } from "./identity";

export type GitExec = (
  argv: readonly string[],
  options?: { cwd?: string },
) => Promise<{ exitCode: number; stdout: string; stderr: string }>;

export interface WorktreeEntry {
  path: string;
  branch?: string;
  bare?: true;
  detached?: true;
  locked?: true | string;
  prunable?: true | string;
}

export async function findGitRoot(exec: GitExec, cwd: string): Promise<string | undefined> {
  const result = await exec(["git", "rev-parse", "--show-toplevel"], { cwd });
  if (result.exitCode === 128 && /not a git repository/i.test(result.stderr)) {
    return undefined;
  }
  if (result.exitCode !== 0) {
    throw new Error(`git rev-parse failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

export function parseWorktreeList(output: string): WorktreeEntry[] {
  const trimmed = output.trim();
  if (trimmed === "") {
    return [];
  }
  return trimmed.split(/\n\s*\n/).map((record) => {
    const path = record.match(/^worktree (.+)$/m)?.[1];
    if (!path) {
      throw new Error("Git worktree record is missing a path");
    }
    const entry: WorktreeEntry = { path };
    const branch = record.match(/^branch refs\/heads\/(.+)$/m)?.[1];

    if (branch) entry.branch = branch;
    if (/^bare$/m.test(record)) entry.bare = true;
    if (/^detached$/m.test(record)) entry.detached = true;

    for (const field of ["locked", "prunable"] as const) {
      const match = record.match(new RegExp(`^${field}(?: (.*))?$`, "m"));
      if (match) entry[field] = match[1] || true;
    }
    return entry;
  });
}

export async function prepareWorktree(options: {
  exec: GitExec;
  pathExists: (path: string) => Promise<boolean>;
  realpath?: (path: string) => Promise<string>;
  gitRoot: string;
  project: string;
  name: string;
  branch?: string;
}): Promise<string> {
  const pathName = sanitizeComponent(options.name, "name");
  const branch = options.branch ?? options.name;
  const target = join(dirname(options.gitRoot), `${options.project}-${pathName}`);
  const entries = await listWorktrees(options.exec, options.gitRoot);

  const registered = findWorktreeAt(entries, target);
  if (registered) {
    return reuseRegisteredWorktree({
      entry: registered,
      branch,
      target,
      gitRoot: options.gitRoot,
      exec: options.exec,
      pathExists: options.pathExists,
      realpath: options.realpath ?? resolveRealpath,
    });
  }

  if (await options.pathExists(target)) {
    throw new Error(`Worktree conflict: target path is occupied: ${target}`);
  }

  const branchAt = findBranchCheckout(entries, branch);
  if (branchAt) {
    throw new Error(
      `Worktree conflict: branch ${branch} is already checked out at ${branchAt.path}`,
    );
  }

  await addWorktree(options.exec, options.gitRoot, target, branch);
  return target;
}

async function listWorktrees(exec: GitExec, gitRoot: string): Promise<WorktreeEntry[]> {
  const list = await exec(["git", "worktree", "list", "--porcelain"], {
    cwd: gitRoot,
  });
  if (list.exitCode !== 0) {
    throw new Error(`git worktree list failed: ${list.stderr}`);
  }
  return parseWorktreeList(list.stdout);
}

function findWorktreeAt(entries: WorktreeEntry[], target: string): WorktreeEntry | undefined {
  return entries.find((entry) => resolve(entry.path) === resolve(target));
}

function validateRegistrationMetadata(entry: WorktreeEntry, branch: string): void {
  if (entry.prunable) {
    throw new Error(
      `Worktree conflict: registered target is prunable${
        typeof entry.prunable === "string" ? `: ${entry.prunable}` : ""
      }`,
    );
  }
  if (entry.bare) {
    throw new Error("Worktree conflict: registered target is bare");
  }
  if (entry.detached) {
    throw new Error("Worktree conflict: registered target is detached");
  }
  if (entry.branch !== branch) {
    throw new Error(
      `Worktree conflict: expected ${branch}, found ${entry.branch ?? "detached HEAD"}`,
    );
  }
}

async function reuseRegisteredWorktree(options: {
  entry: WorktreeEntry;
  branch: string;
  target: string;
  gitRoot: string;
  exec: GitExec;
  pathExists: (path: string) => Promise<boolean>;
  realpath: (path: string) => Promise<string>;
}): Promise<string> {
  validateRegistrationMetadata(options.entry, options.branch);
  if (!(await options.pathExists(options.target))) {
    throw new Error(`Worktree conflict: registered target path is missing: ${options.target}`);
  }
  await validateRegisteredWorktree({
    exec: options.exec,
    realpath: options.realpath,
    target: options.target,
    gitRoot: options.gitRoot,
    branch: options.branch,
  });
  return options.target;
}

function findBranchCheckout(entries: WorktreeEntry[], branch: string): WorktreeEntry | undefined {
  return entries.find((entry) => entry.branch === branch);
}

async function addWorktree(
  exec: GitExec,
  gitRoot: string,
  target: string,
  branch: string,
): Promise<void> {
  const existing = await exec(["git", "show-ref", "--verify", "--quiet", `refs/heads/${branch}`], {
    cwd: gitRoot,
  });
  if (existing.exitCode !== 0 && existing.exitCode !== 1) {
    throw new Error(`git show-ref failed: ${existing.stderr}`);
  }
  const command =
    existing.exitCode === 0
      ? ["git", "worktree", "add", target, branch]
      : ["git", "worktree", "add", "-b", branch, target];
  const added = await exec(command, { cwd: gitRoot });
  if (added.exitCode !== 0) {
    throw new Error(`git worktree add failed: ${added.stderr}`);
  }
}

async function validateRegisteredWorktree(options: {
  exec: GitExec;
  realpath: (path: string) => Promise<string>;
  target: string;
  gitRoot: string;
  branch: string;
}): Promise<void> {
  const targetDetails = await options.exec(
    ["git", "rev-parse", "--show-toplevel", "--git-common-dir"],
    { cwd: options.target },
  );
  if (targetDetails.exitCode !== 0) {
    throw new Error(
      `Worktree conflict: registered target is not a usable Git worktree: ${targetDetails.stderr}`,
    );
  }

  const [targetTopLevel, targetCommonDir] = targetDetails.stdout.trim().split(/\r?\n/);
  if (!targetTopLevel || !targetCommonDir) {
    throw new Error("Worktree conflict: registered target is not a usable Git worktree");
  }

  const [canonicalTarget, canonicalTopLevel] = await Promise.all([
    options.realpath(options.target),
    options.realpath(targetTopLevel),
  ]);
  if (canonicalTarget !== canonicalTopLevel) {
    throw new Error(
      `Worktree conflict: registered target canonical path does not match: ${targetTopLevel}`,
    );
  }

  const sourceCommonDir = await options.exec(["git", "rev-parse", "--git-common-dir"], {
    cwd: options.gitRoot,
  });
  if (sourceCommonDir.exitCode !== 0) {
    throw new Error(`git rev-parse --git-common-dir failed: ${sourceCommonDir.stderr}`);
  }

  const [canonicalTargetCommonDir, canonicalSourceCommonDir] = await Promise.all([
    options.realpath(resolveGitPath(targetCommonDir, options.target)),
    options.realpath(resolveGitPath(sourceCommonDir.stdout.trim(), options.gitRoot)),
  ]);
  if (canonicalTargetCommonDir !== canonicalSourceCommonDir) {
    throw new Error("Worktree conflict: registered target has a different Git common directory");
  }

  const liveBranch = await options.exec(["git", "symbolic-ref", "--quiet", "HEAD"], {
    cwd: options.target,
  });
  if (liveBranch.exitCode !== 0) {
    throw new Error(
      `Worktree conflict: registered target has no symbolic HEAD: ${liveBranch.stderr}`,
    );
  }
  if (liveBranch.stdout.trim() !== `refs/heads/${options.branch}`) {
    throw new Error(
      `Worktree conflict: registered target live branch is ${liveBranch.stdout.trim()}, expected refs/heads/${options.branch}`,
    );
  }
}

function resolveGitPath(path: string, cwd: string): string {
  return isAbsolute(path) ? path : resolve(cwd, path);
}

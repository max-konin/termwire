import type { GitExec } from "./worktree";

export async function prepareBranch(exec: GitExec, cwd: string, name: string): Promise<void> {
  const existing = await exec(
    ["git", "show-ref", "--verify", "--quiet", `refs/heads/${name}`],
    { cwd },
  );
  if (existing.exitCode !== 0 && existing.exitCode !== 1) {
    throw new Error(`git show-ref failed: ${existing.stderr}`);
  }

  const command =
    existing.exitCode === 0 ? ["git", "switch", name] : ["git", "switch", "-c", name];
  const switched = await exec(command, { cwd });
  if (switched.exitCode !== 0) {
    throw new Error(`git switch failed: ${switched.stderr}`);
  }
}

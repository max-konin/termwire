import { expect, mock, test } from "bun:test";
import { prepareBranch } from "./branch";
import type { GitExec } from "./worktree";

test("switches to an existing local branch", async () => {
  const exec = mock<GitExec>()
    .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" })
    .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" });

  await prepareBranch(exec, "/repo", "feature/api");

  expect(exec.mock.calls).toEqual([
    [["git", "show-ref", "--verify", "--quiet", "refs/heads/feature/api"], { cwd: "/repo" }],
    [["git", "switch", "feature/api"], { cwd: "/repo" }],
  ]);
});

test("creates and switches to an absent local branch", async () => {
  const exec = mock<GitExec>()
    .mockResolvedValueOnce({ exitCode: 1, stdout: "", stderr: "" })
    .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" });

  await prepareBranch(exec, "/repo", "feature/api");

  expect(exec.mock.calls[1]).toEqual([
    ["git", "switch", "-c", "feature/api"],
    { cwd: "/repo" },
  ]);
});

test("reports an unexpected show-ref failure", async () => {
  const exec = mock<GitExec>().mockResolvedValue({
    exitCode: 2,
    stdout: "",
    stderr: "reference database failed",
  });

  await expect(prepareBranch(exec, "/repo", "feature/api")).rejects.toThrow(
    "git show-ref failed: reference database failed",
  );
});

test("reports a switch failure", async () => {
  const exec = mock<GitExec>()
    .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" })
    .mockResolvedValueOnce({ exitCode: 1, stdout: "", stderr: "dirty checkout" });

  await expect(prepareBranch(exec, "/repo", "feature/api")).rejects.toThrow(
    "git switch failed: dirty checkout",
  );
});

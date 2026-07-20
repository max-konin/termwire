import { expect, mock, test } from "bun:test";
import { findGitRoot, type GitExec, parseWorktreeList, prepareWorktree } from "./worktree";

test("finds a Git root with exact argv", async () => {
  const exec = mock<GitExec>().mockResolvedValue({
    exitCode: 0,
    stdout: "/repo/termwire\n",
    stderr: "",
  });

  expect(await findGitRoot(exec, "/repo/termwire/src")).toBe("/repo/termwire");
  expect(exec).toHaveBeenCalledTimes(1);
  expect(exec).toHaveBeenCalledWith(["git", "rev-parse", "--show-toplevel"], {
    cwd: "/repo/termwire/src",
  });
});

test("returns undefined outside a Git repository", async () => {
  const exec = mock<GitExec>().mockResolvedValue({
    exitCode: 128,
    stdout: "",
    stderr: "not a git repository",
  });
  expect(await findGitRoot(exec, "/tmp")).toBeUndefined();
});

test("preserves an exit-128 Git root diagnostic that is not an outside-repository error", async () => {
  const exec = mock<GitExec>().mockResolvedValue({
    exitCode: 128,
    stdout: "",
    stderr: "fatal: detected dubious ownership in repository at '/repo'",
  });

  await expect(findGitRoot(exec, "/repo")).rejects.toThrow(
    "git rev-parse failed: fatal: detected dubious ownership in repository at '/repo'",
  );
});

test("reports an unexpected Git root error", async () => {
  const exec = mock<GitExec>().mockResolvedValue({ exitCode: 2, stdout: "", stderr: "denied" });
  await expect(findGitRoot(exec, "/repo")).rejects.toThrow("git rev-parse failed: denied");
});

test("parses branch and detached porcelain records", () => {
  expect(
    parseWorktreeList(
      "worktree /repo/main\nHEAD a\nbranch refs/heads/main\n\nworktree /repo/detached\nHEAD b",
    ),
  ).toEqual([{ path: "/repo/main", branch: "main" }, { path: "/repo/detached" }]);
});

test("parses a single porcelain record with Git's trailing blank separator", () => {
  expect(parseWorktreeList("worktree /repo/main\nHEAD a\nbranch refs/heads/main\n\n")).toEqual([
    { path: "/repo/main", branch: "main" },
  ]);
});

test("parses worktree state fields and ignores unknown porcelain fields", () => {
  expect(
    parseWorktreeList(
      [
        "worktree /repo/main",
        "HEAD a",
        "branch refs/heads/main",
        "locked maintenance",
        "unknown value",
        "",
        "worktree /repo/detached",
        "HEAD b",
        "detached",
        "prunable stale gitdir",
        "",
        "worktree /repo/bare",
        "bare",
        "locked",
        "prunable",
      ].join("\n"),
    ),
  ).toEqual([
    { path: "/repo/main", branch: "main", locked: "maintenance" },
    { path: "/repo/detached", detached: true, prunable: "stale gitdir" },
    { path: "/repo/bare", bare: true, locked: true, prunable: true },
  ]);
});

test("rejects a malformed porcelain record", () => {
  expect(() => parseWorktreeList("HEAD a")).toThrow("missing a path");
});

const run = (
  responses: { exitCode: number; stdout?: string; stderr?: string }[],
  exists = false,
  gitRoot = "/repo/main",
) => {
  const exec = mock<GitExec>();
  for (const response of responses) {
    exec.mockResolvedValueOnce({
      exitCode: response.exitCode,
      stdout: response.stdout ?? "",
      stderr: response.stderr ?? "",
    });
  }
  exec.mockImplementation(async (argv, options) => {
    if (
      argv.join(" ") === "git rev-parse --show-toplevel --git-common-dir" &&
      options?.cwd === "/repo/Repo-dev"
    ) {
      return { exitCode: 0, stdout: "/repo/Repo-dev\n/repo/main/.git\n", stderr: "" };
    }
    if (argv.join(" ") === "git rev-parse --git-common-dir" && options?.cwd === "/repo/main") {
      return { exitCode: 0, stdout: "/repo/main/.git\n", stderr: "" };
    }
    if (argv.join(" ") === "git symbolic-ref --quiet HEAD" && options?.cwd === "/repo/Repo-dev") {
      return { exitCode: 0, stdout: "refs/heads/dev\n", stderr: "" };
    }
    return { exitCode: 0, stdout: "", stderr: "" };
  });
  const pathExists = mock<(path: string) => Promise<boolean>>().mockImplementation(
    async () => exists,
  );
  const realpath = mock<(path: string) => Promise<string>>().mockImplementation(
    async (path) => path,
  );
  return {
    exec,
    pathExists,
    realpath,
    value: () =>
      prepareWorktree({
        exec,
        pathExists,
        realpath,
        gitRoot,
        project: "Repo",
        name: "dev",
      }),
  };
};

test("reuses a matching registered worktree", async () => {
  const f = run(
    [{ exitCode: 0, stdout: "worktree /repo/Repo-dev\nHEAD a\nbranch refs/heads/dev" }],
    true,
  );
  expect(await f.value()).toBe("/repo/Repo-dev");
  expect(f.exec.mock.calls).toEqual([
    [["git", "worktree", "list", "--porcelain"], { cwd: "/repo/main" }],
    [["git", "rev-parse", "--show-toplevel", "--git-common-dir"], { cwd: "/repo/Repo-dev" }],
    [["git", "rev-parse", "--git-common-dir"], { cwd: "/repo/main" }],
    [["git", "symbolic-ref", "--quiet", "HEAD"], { cwd: "/repo/Repo-dev" }],
  ]);
});

test("resolves relative common directories against their worktree cwd values", async () => {
  const f = run(
    [
      { exitCode: 0, stdout: "worktree /repo/Repo-dev\nHEAD a\nbranch refs/heads/dev" },
      { exitCode: 0, stdout: "/repo/Repo-dev\n.git\n" },
      { exitCode: 0, stdout: ".git\n" },
      { exitCode: 0, stdout: "refs/heads/dev\n" },
    ],
    true,
    "/repo/source-linked",
  );
  f.realpath.mockImplementation(async (path) => {
    if (path.endsWith("/.git")) return "/canonical/common.git";
    return path;
  });

  expect(await f.value()).toBe("/repo/Repo-dev");
  expect(f.realpath.mock.calls).toEqual([
    ["/repo/Repo-dev"],
    ["/repo/Repo-dev"],
    ["/repo/Repo-dev/.git"],
    ["/repo/source-linked/.git"],
  ]);
});

test("rejects a registered target when source common-directory probing fails", async () => {
  const f = run(
    [
      { exitCode: 0, stdout: "worktree /repo/Repo-dev\nHEAD a\nbranch refs/heads/dev" },
      { exitCode: 0, stdout: "/repo/Repo-dev\n/repo/main/.git\n" },
      { exitCode: 2, stderr: "source common-dir failed" },
    ],
    true,
  );

  await expect(f.value()).rejects.toThrow(
    "git rev-parse --git-common-dir failed: source common-dir failed",
  );
  expect(f.exec).toHaveBeenCalledTimes(3);
});

test("rejects a registered target with a different canonical Git common directory", async () => {
  const f = run(
    [
      { exitCode: 0, stdout: "worktree /repo/Repo-dev\nHEAD a\nbranch refs/heads/dev" },
      { exitCode: 0, stdout: "/repo/Repo-dev\n/repo/main/.git\n" },
      { exitCode: 0, stdout: "/repo/other/.git\n" },
    ],
    true,
  );
  f.realpath.mockImplementation(async (path) => {
    if (path === "/repo/other/.git") return "/canonical/other.git";
    return path;
  });

  await expect(f.value()).rejects.toThrow(
    "Worktree conflict: registered target has a different Git common directory",
  );
  expect(f.exec).toHaveBeenCalledTimes(3);
});

test("rejects a registered target whose HEAD is detached or not symbolic", async () => {
  const f = run(
    [
      { exitCode: 0, stdout: "worktree /repo/Repo-dev\nHEAD a\nbranch refs/heads/dev" },
      { exitCode: 0, stdout: "/repo/Repo-dev\n/repo/main/.git\n" },
      { exitCode: 0, stdout: "/repo/main/.git\n" },
      { exitCode: 1, stderr: "detached HEAD" },
    ],
    true,
  );

  await expect(f.value()).rejects.toThrow(
    "Worktree conflict: registered target has no symbolic HEAD: detached HEAD",
  );
  expect(f.exec).toHaveBeenCalledTimes(4);
});

test("rejects a registered target whose live branch differs from the requested branch", async () => {
  const f = run(
    [
      { exitCode: 0, stdout: "worktree /repo/Repo-dev\nHEAD a\nbranch refs/heads/dev" },
      { exitCode: 0, stdout: "/repo/Repo-dev\n/repo/main/.git\n" },
      { exitCode: 0, stdout: "/repo/main/.git\n" },
      { exitCode: 0, stdout: "refs/heads/main\n" },
    ],
    true,
  );

  await expect(f.value()).rejects.toThrow(
    "Worktree conflict: registered target live branch is refs/heads/main, expected refs/heads/dev",
  );
  expect(f.exec).toHaveBeenCalledTimes(4);
});

test("rejects a registered target whose Git metadata probe fails", async () => {
  const f = run(
    [
      { exitCode: 0, stdout: "worktree /repo/Repo-dev\nHEAD a\nbranch refs/heads/dev" },
      { exitCode: 128, stderr: "fatal: not a git repository" },
    ],
    true,
  );

  await expect(f.value()).rejects.toThrow(
    "Worktree conflict: registered target is not a usable Git worktree: fatal: not a git repository",
  );
  expect(f.realpath).not.toHaveBeenCalled();
  expect(f.exec).toHaveBeenCalledTimes(2);
});

test("rejects a registered target whose Git metadata output is incomplete", async () => {
  const f = run(
    [
      { exitCode: 0, stdout: "worktree /repo/Repo-dev\nHEAD a\nbranch refs/heads/dev" },
      { exitCode: 0, stdout: "/repo/Repo-dev\n" },
    ],
    true,
  );

  await expect(f.value()).rejects.toThrow(
    "Worktree conflict: registered target is not a usable Git worktree",
  );
  expect(f.realpath).not.toHaveBeenCalled();
  expect(f.exec).toHaveBeenCalledTimes(2);
});

test("rejects a registered target whose reported top-level canonicalizes elsewhere", async () => {
  const f = run(
    [
      { exitCode: 0, stdout: "worktree /repo/Repo-dev\nHEAD a\nbranch refs/heads/dev" },
      { exitCode: 0, stdout: "/repo/linked-alias\n/repo/main/.git\n" },
    ],
    true,
  );
  f.realpath.mockImplementation(async (path) => {
    if (path === "/repo/linked-alias") return "/canonical/other";
    return "/canonical/Repo-dev";
  });

  await expect(f.value()).rejects.toThrow(
    "Worktree conflict: registered target canonical path does not match: /repo/linked-alias",
  );
  expect(f.exec).toHaveBeenCalledTimes(2);
  expect(f.realpath.mock.calls).toEqual([["/repo/Repo-dev"], ["/repo/linked-alias"]]);
});

test("rejects a prunable registered target before filesystem or additional Git probes", async () => {
  const f = run([
    {
      exitCode: 0,
      stdout: "worktree /repo/Repo-dev\nHEAD a\nbranch refs/heads/dev\nprunable stale gitdir",
    },
  ]);

  await expect(f.value()).rejects.toThrow(
    "Worktree conflict: registered target is prunable: stale gitdir",
  );
  expect(f.pathExists).not.toHaveBeenCalled();
  expect(f.exec).toHaveBeenCalledTimes(1);
});

test("rejects a bare registered target before filesystem or additional Git probes", async () => {
  const f = run([{ exitCode: 0, stdout: "worktree /repo/Repo-dev\nbare\nbranch refs/heads/dev" }]);

  await expect(f.value()).rejects.toThrow("Worktree conflict: registered target is bare");
  expect(f.pathExists).not.toHaveBeenCalled();
  expect(f.exec).toHaveBeenCalledTimes(1);
});

test("rejects a detached registered target before filesystem or additional Git probes", async () => {
  const f = run([{ exitCode: 0, stdout: "worktree /repo/Repo-dev\nHEAD a\ndetached" }]);

  await expect(f.value()).rejects.toThrow("Worktree conflict: registered target is detached");
  expect(f.pathExists).not.toHaveBeenCalled();
  expect(f.exec).toHaveBeenCalledTimes(1);
});

test("reuses a matching registered worktree with an equivalent normalized path", async () => {
  const f = run(
    [{ exitCode: 0, stdout: "worktree /repo/./Repo-dev\nHEAD a\nbranch refs/heads/dev" }],
    true,
  );
  expect(await f.value()).toBe("/repo/Repo-dev");
  expect(f.exec).toHaveBeenCalledWith(["git", "worktree", "list", "--porcelain"], {
    cwd: "/repo/main",
  });
});

test("rejects a registered target with a wrong branch", async () => {
  const f = run([
    { exitCode: 0, stdout: "worktree /repo/Repo-dev\nHEAD a\nbranch refs/heads/main" },
  ]);
  await expect(f.value()).rejects.toThrow("expected dev, found main");
  expect(f.pathExists).not.toHaveBeenCalled();
  expect(f.exec).toHaveBeenCalledTimes(1);
});

test("rejects a matching registered target missing from disk before additional Git probes", async () => {
  const f = run([
    { exitCode: 0, stdout: "worktree /repo/Repo-dev\nHEAD a\nbranch refs/heads/dev" },
  ]);

  await expect(f.value()).rejects.toThrow(
    "Worktree conflict: registered target path is missing: /repo/Repo-dev",
  );
  expect(f.pathExists).toHaveBeenCalledWith("/repo/Repo-dev");
  expect(f.exec).toHaveBeenCalledTimes(1);
});

test("allows a locked matching registered target", async () => {
  const f = run(
    [
      {
        exitCode: 0,
        stdout: "worktree /repo/Repo-dev\nHEAD a\nbranch refs/heads/dev\nlocked maintenance",
      },
    ],
    true,
  );

  expect(await f.value()).toBe("/repo/Repo-dev");
  expect(f.pathExists).toHaveBeenCalledWith("/repo/Repo-dev");
  expect(f.exec).toHaveBeenCalledTimes(4);
});

test("rejects an occupied unregistered target", async () => {
  const f = run([{ exitCode: 0, stdout: "" }], true);
  await expect(f.value()).rejects.toThrow("target path is occupied: /repo/Repo-dev");
});

test("rejects a branch checked out at another registered path", async () => {
  const f = run([{ exitCode: 0, stdout: "worktree /repo/other\nHEAD a\nbranch refs/heads/dev" }]);
  await expect(f.value()).rejects.toThrow("branch dev is already checked out at /repo/other");
});

test("adds an existing local branch with exact argv", async () => {
  const f = run([{ exitCode: 0, stdout: "" }, { exitCode: 0 }, { exitCode: 0 }]);
  expect(await f.value()).toBe("/repo/Repo-dev");
  expect(f.exec.mock.calls).toEqual([
    [["git", "worktree", "list", "--porcelain"], { cwd: "/repo/main" }],
    [["git", "show-ref", "--verify", "--quiet", "refs/heads/dev"], { cwd: "/repo/main" }],
    [["git", "worktree", "add", "/repo/Repo-dev", "dev"], { cwd: "/repo/main" }],
  ]);
});

test("creates an absent local branch with exact argv", async () => {
  const f = run([{ exitCode: 0, stdout: "" }, { exitCode: 1 }, { exitCode: 0 }]);
  expect(await f.value()).toBe("/repo/Repo-dev");
  expect(f.exec.mock.calls).toEqual([
    [["git", "worktree", "list", "--porcelain"], { cwd: "/repo/main" }],
    [["git", "show-ref", "--verify", "--quiet", "refs/heads/dev"], { cwd: "/repo/main" }],
    [["git", "worktree", "add", "-b", "dev", "/repo/Repo-dev"], { cwd: "/repo/main" }],
  ]);
});

test("reports an unexpected show-ref failure", async () => {
  const f = run([
    { exitCode: 0, stdout: "" },
    { exitCode: 2, stderr: "reference database failed" },
  ]);
  await expect(f.value()).rejects.toThrow("git show-ref failed: reference database failed");
});

test("reports a worktree-list failure", async () => {
  const f = run([{ exitCode: 2, stderr: "unable to list worktrees" }]);
  await expect(f.value()).rejects.toThrow("git worktree list failed: unable to list worktrees");
});

test("reports a worktree-add failure", async () => {
  const f = run([
    { exitCode: 0, stdout: "" },
    { exitCode: 0 },
    { exitCode: 2, stderr: "branch is locked" },
  ]);
  await expect(f.value()).rejects.toThrow("git worktree add failed: branch is locked");
});

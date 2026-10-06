import { describe, expect, type Mock, mock, test } from "bun:test";
import { type DownDependencies, type DownSession, down } from "./down.js";

const worktreePath = "/home/user/projects/repo-dev";

/** Every step with a consequence stays a mock, so a refusal can assert on all three. */
type DownFakes = DownDependencies & {
  chdir: Mock<DownDependencies["chdir"]>;
  killSession: Mock<DownDependencies["killSession"]>;
  removeWorktree: Mock<DownDependencies["removeWorktree"]>;
};

function createDependencies(overrides: Partial<DownFakes> = {}): DownFakes {
  return {
    cwd: () => "/home/user/projects/repo",
    chdir: mock<DownDependencies["chdir"]>(),
    env: {},
    findGitRoot: async () => "/home/user/projects/repo",
    listSessions: async () => [{ name: "repo-dev", path: worktreePath }],
    killSession: mock<DownDependencies["killSession"]>().mockResolvedValue(),
    inspectWorktree: async () => ({ main: false, dirty: false }),
    removeWorktree: mock<DownDependencies["removeWorktree"]>().mockResolvedValue(),
    ...overrides,
  };
}

describe("down", () => {
  test("kills the session the same name would have brought up", async () => {
    const dependencies = createDependencies();

    expect(await down({ name: "dev" }, dependencies)).toEqual({ session: "repo-dev" });

    expect(dependencies.killSession).toHaveBeenCalledWith("repo-dev");
    expect(dependencies.removeWorktree).not.toHaveBeenCalled();
  });

  test("resolves the project from the Git root rather than the current directory", async () => {
    const dependencies = createDependencies({
      cwd: () => "/home/user/projects/repo/packages/cli",
      findGitRoot: async () => "/home/user/projects/repo",
    });

    await down({ name: "dev" }, dependencies);

    expect(dependencies.killSession).toHaveBeenCalledWith("repo-dev");
  });

  test("leaves the worktree alone without -w", async () => {
    const inspectWorktree = mock<DownDependencies["inspectWorktree"]>();
    const dependencies = createDependencies({ inspectWorktree });

    await down({ name: "dev" }, dependencies);

    expect(inspectWorktree).not.toHaveBeenCalled();
  });

  test("removes the worktree the session sits in, after killing the session", async () => {
    const order: string[] = [];
    const dependencies = createDependencies({
      killSession: mock<DownDependencies["killSession"]>(async () => {
        order.push("kill");
      }),
      removeWorktree: mock<DownDependencies["removeWorktree"]>(async () => {
        order.push("remove");
      }),
    });

    expect(await down({ name: "dev", worktree: true }, dependencies)).toEqual({
      session: "repo-dev",
      worktree: worktreePath,
    });

    expect(dependencies.removeWorktree).toHaveBeenCalledWith(worktreePath, { force: false });
    expect(order).toEqual(["kill", "remove"]);
  });

  test("refuses a dirty worktree and removes nothing at all", async () => {
    const dependencies = createDependencies({
      inspectWorktree: async () => ({ main: false, dirty: true }),
    });

    await expect(down({ name: "dev", worktree: true }, dependencies)).rejects.toThrow(
      `${worktreePath} has uncommitted changes: pass --force to remove it anyway`,
    );

    expect(dependencies.killSession).not.toHaveBeenCalled();
    expect(dependencies.removeWorktree).not.toHaveBeenCalled();
  });

  test("removes a dirty worktree with --force, and still never the branch", async () => {
    const dependencies = createDependencies({
      inspectWorktree: async () => ({ main: false, dirty: true }),
    });

    await down({ name: "dev", worktree: true, force: true }, dependencies);

    expect(dependencies.removeWorktree).toHaveBeenCalledWith(worktreePath, { force: true });
  });

  test.each([
    [
      "the main checkout",
      { inspectWorktree: async () => ({ main: true, dirty: false }) },
      `refusing to remove the main checkout: ${worktreePath}`,
    ],
    [
      "the directory this command runs in",
      { cwd: () => worktreePath },
      `refusing to remove the directory this command runs in: ${worktreePath}`,
    ],
    [
      "a directory this command runs below",
      { cwd: () => `${worktreePath}/packages/cli` },
      `refusing to remove the directory this command runs in: ${worktreePath}`,
    ],
  ] as [string, Partial<DownFakes>, string][])(
    "refuses to remove %s",
    async (_label, overrides, message) => {
      const dependencies = createDependencies({
        findGitRoot: async () => "/home/user/projects/repo",
        ...overrides,
      });

      await expect(down({ name: "dev", worktree: true }, dependencies)).rejects.toThrow(message);

      expect(dependencies.killSession).not.toHaveBeenCalled();
      expect(dependencies.removeWorktree).not.toHaveBeenCalled();
    },
  );

  test("reports an unknown session as a plain failure", async () => {
    const dependencies = createDependencies({ listSessions: async () => [] });

    await expect(down({ name: "dev" }, dependencies)).rejects.toThrow(
      "no workspace session named repo-dev",
    );

    expect(dependencies.killSession).not.toHaveBeenCalled();
  });

  test("matches the session name exactly, not by prefix", async () => {
    const sessions: DownSession[] = [{ name: "repo-development", path: worktreePath }];
    const dependencies = createDependencies({ listSessions: async () => sessions });

    await expect(down({ name: "dev" }, dependencies)).rejects.toThrow(
      "no workspace session named repo-dev",
    );
  });

  test("rejects a name that cannot become a session component", async () => {
    const dependencies = createDependencies();

    await expect(down({ name: "///" }, dependencies)).rejects.toThrow(
      "name must contain a letter, number, _ or -",
    );

    expect(dependencies.killSession).not.toHaveBeenCalled();
  });
});

test("says the session is already gone when the worktree removal fails", async () => {
  const dependencies = createDependencies({
    removeWorktree: mock<DownDependencies["removeWorktree"]>(() => {
      throw new Error("git worktree remove failed: contains modified files");
    }),
  });

  await expect(down({ name: "dev", worktree: true }, dependencies)).rejects.toThrow(
    "session repo-dev was killed, but its worktree was not removed: git worktree remove failed: contains modified files",
  );

  expect(dependencies.killSession).toHaveBeenCalledWith("repo-dev");
});

describe("down inside its own workspace", () => {
  test("without a name, the inherited label names the session and Git is never asked", async () => {
    const findGitRoot = mock<DownDependencies["findGitRoot"]>();
    const dependencies = createDependencies({
      env: { TERMWIRE_SESSION: "repo-dev" },
      findGitRoot,
    });

    expect(await down({}, dependencies)).toEqual({ session: "repo-dev" });

    expect(dependencies.killSession).toHaveBeenCalledWith("repo-dev");
    expect(findGitRoot).not.toHaveBeenCalled();
  });

  test("names the session that created it, not one derived from the worktree", async () => {
    // Inside a worktree the Git root is the worktree, so `createIdentity` would build
    // `repo-dev-dev` and find nothing. This is the case the bare form exists for.
    const dependencies = createDependencies({
      cwd: () => worktreePath,
      env: { TERMWIRE_SESSION: "repo-dev" },
      findGitRoot: async () => worktreePath,
      listSessions: async () => [{ name: "repo-dev", path: worktreePath }],
    });

    expect(await down({}, dependencies)).toEqual({ session: "repo-dev" });

    expect(dependencies.killSession).toHaveBeenCalledWith("repo-dev");
  });

  test("leaves the directory, removes the worktree, and only then kills", async () => {
    const order: string[] = [];
    const dependencies = createDependencies({
      cwd: () => worktreePath,
      env: { TERMWIRE_SESSION: "repo-dev" },
      listSessions: async () => [{ name: "repo-dev", path: worktreePath }],
      chdir: mock<DownDependencies["chdir"]>(() => {
        order.push("chdir");
      }),
      killSession: mock<DownDependencies["killSession"]>(async () => {
        order.push("kill");
      }),
      removeWorktree: mock<DownDependencies["removeWorktree"]>(async () => {
        order.push("remove");
      }),
    });

    expect(await down({ worktree: true }, dependencies)).toEqual({
      session: "repo-dev",
      worktree: worktreePath,
    });

    // The shell standing in that directory is part of what is being torn down, so the
    // current-directory refusal does not apply here. The chdir has to come first: the
    // kill is a spawn, and a spawn from a deleted working directory fails.
    expect(order).toEqual(["chdir", "remove", "kill"]);
    expect(dependencies.chdir).toHaveBeenCalledWith("/home/user/projects");
  });

  test("stays put when its own workspace is not the directory it runs in", async () => {
    const dependencies = createDependencies({
      cwd: () => "/home/user/projects/repo",
      env: { TERMWIRE_SESSION: "repo-dev" },
      listSessions: async () => [{ name: "repo-dev", path: worktreePath }],
    });

    await down({ worktree: true }, dependencies);

    expect(dependencies.chdir).not.toHaveBeenCalled();
    expect(dependencies.removeWorktree).toHaveBeenCalledWith(worktreePath, { force: false });
  });

  test("keeps the session when its own worktree cannot be removed, so it can be retried", async () => {
    const dependencies = createDependencies({
      cwd: () => worktreePath,
      env: { TERMWIRE_SESSION: "repo-dev" },
      listSessions: async () => [{ name: "repo-dev", path: worktreePath }],
      removeWorktree: mock<DownDependencies["removeWorktree"]>(() => {
        throw new Error("git worktree remove failed: locked");
      }),
    });

    await expect(down({ worktree: true }, dependencies)).rejects.toThrow(
      "git worktree remove failed: locked",
    );

    expect(dependencies.killSession).not.toHaveBeenCalled();
  });

  test("still refuses the main checkout of its own workspace", async () => {
    const dependencies = createDependencies({
      cwd: () => "/home/user/projects/repo",
      env: { TERMWIRE_SESSION: "repo-dev" },
      listSessions: async () => [{ name: "repo-dev", path: "/home/user/projects/repo" }],
      inspectWorktree: async () => ({ main: true, dirty: false }),
    });

    await expect(down({ worktree: true }, dependencies)).rejects.toThrow(
      "refusing to remove the main checkout: /home/user/projects/repo",
    );

    expect(dependencies.killSession).not.toHaveBeenCalled();
    expect(dependencies.removeWorktree).not.toHaveBeenCalled();
  });

  test("still refuses a dirty worktree without --force", async () => {
    const dependencies = createDependencies({
      cwd: () => worktreePath,
      env: { TERMWIRE_SESSION: "repo-dev" },
      listSessions: async () => [{ name: "repo-dev", path: worktreePath }],
      inspectWorktree: async () => ({ main: false, dirty: true }),
    });

    await expect(down({ worktree: true }, dependencies)).rejects.toThrow(
      "has uncommitted changes: pass --force to remove it anyway",
    );

    expect(dependencies.removeWorktree).not.toHaveBeenCalled();
  });

  test("a named session other than this one keeps the kill-first order", async () => {
    const order: string[] = [];
    const dependencies = createDependencies({
      env: { TERMWIRE_SESSION: "repo-other" },
      killSession: mock<DownDependencies["killSession"]>(async () => {
        order.push("kill");
      }),
      removeWorktree: mock<DownDependencies["removeWorktree"]>(async () => {
        order.push("remove");
      }),
    });

    await down({ name: "dev", worktree: true }, dependencies);

    expect(order).toEqual(["kill", "remove"]);
  });

  test.each([[{}], [{ TERMWIRE_SESSION: "   " }]])(
    "reports %p as outside a workspace when no name is given",
    async (env) => {
      const dependencies = createDependencies({ env });

      await expect(down({}, dependencies)).rejects.toThrow("not inside a termwire workspace");

      expect(dependencies.killSession).not.toHaveBeenCalled();
    },
  );
});

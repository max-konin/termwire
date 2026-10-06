import { describe, expect, mock, test } from "bun:test";
import type { SessionScan, SessionScanner } from "./process-scan.js";
import {
  collectWorkspaces,
  formatRss,
  formatWorkspacesJson,
  formatWorkspaceTable,
  readBranch,
  shortenHome,
  type Workspace,
  type WorkspacesDependencies,
} from "./workspaces.js";
import type { GitExec } from "./worktree.js";

const emptyScan: SessionScan = { processes: [], labeled: new Map() };

function createWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    session: "repo-dev",
    attached: true,
    branch: "master",
    directory: "/home/user/projects/repo",
    missing: false,
    procs: 7,
    rssKib: 1258291,
    ...overrides,
  };
}

function createDependencies(
  overrides: Partial<WorkspacesDependencies> = {},
): WorkspacesDependencies {
  return {
    listSessions: async () => [{ name: "repo-dev", attached: true, path: "/repo" }],
    showEnvironment: async () => ({ TERMWIRE_SESSION: "repo-dev" }),
    git: async () => ({ exitCode: 0, stdout: "master\n", stderr: "" }),
    pathExists: async () => true,
    scan: async () => emptyScan,
    ...overrides,
  };
}

describe("collectWorkspaces", () => {
  test("describes a labeled session from tmux and Git", async () => {
    const scan = mock<SessionScanner>(async () => ({
      processes: [
        { pid: 900, ppid: 1, rss: 204800 },
        { pid: 901, ppid: 900, rss: 51200 },
        { pid: 1, ppid: 0, rss: 8192 },
      ],
      labeled: new Map([["repo-dev", [900, 901]]]),
    }));

    expect(await collectWorkspaces(createDependencies({ scan }))).toEqual([
      {
        session: "repo-dev",
        attached: true,
        branch: "master",
        directory: "/repo",
        missing: false,
        procs: 2,
        rssKib: 256000,
      },
    ]);
    expect(scan).toHaveBeenCalledWith(["repo-dev"]);
  });

  test("asks for every workspace in one walk over the process table", async () => {
    const scan = mock<SessionScanner>(async () => ({
      processes: [
        { pid: 900, ppid: 1, rss: 204800 },
        { pid: 910, ppid: 1, rss: 51200 },
      ],
      labeled: new Map([
        ["repo-dev", [900]],
        ["repo-demo", [910]],
      ]),
    }));

    const workspaces = await collectWorkspaces(
      createDependencies({
        listSessions: async () => [
          { name: "repo-dev", attached: true, path: "/repo" },
          { name: "repo-demo", attached: false, path: "/repo-demo" },
        ],
        scan,
      }),
    );

    expect(workspaces.map(({ session, procs, rssKib }) => ({ session, procs, rssKib }))).toEqual([
      { session: "repo-dev", procs: 1, rssKib: 204800 },
      { session: "repo-demo", procs: 1, rssKib: 51200 },
    ]);
    expect(scan.mock.calls).toEqual([[["repo-dev", "repo-demo"]]]);
  });

  test("ignores a session whose environment carries no label", async () => {
    const showEnvironment = mock<(session: string) => Promise<Record<string, string>>>(
      async (session): Promise<Record<string, string>> =>
        session === "repo-dev" ? { TERMWIRE_SESSION: "repo-dev" } : { SHELL: "/bin/zsh" },
    );
    const scan = mock<SessionScanner>(async () => emptyScan);

    const workspaces = await collectWorkspaces(
      createDependencies({
        listSessions: async () => [
          { name: "repo-dev", attached: true, path: "/repo" },
          // A plain `tmux new-session` with a name that looks just like ours.
          { name: "repo-demo", attached: false, path: "/repo" },
        ],
        showEnvironment,
        scan,
      }),
    );

    expect(workspaces.map((workspace) => workspace.session)).toEqual(["repo-dev"]);
    expect(showEnvironment.mock.calls).toEqual([["repo-dev"], ["repo-demo"]]);
    expect(scan.mock.calls).toEqual([[["repo-dev"]]]);
  });

  test("lists and marks a session whose directory is gone, without asking Git", async () => {
    const git = mock<GitExec>();

    expect(
      await collectWorkspaces(createDependencies({ git, pathExists: async () => false })),
    ).toEqual([
      {
        session: "repo-dev",
        attached: true,
        branch: "-",
        directory: "/repo",
        missing: true,
        procs: 0,
        rssKib: 0,
      },
    ]);
    expect(git).not.toHaveBeenCalled();
  });

  test("reads an empty list when tmux reports no sessions", async () => {
    const scan = mock<SessionScanner>(async () => emptyScan);

    expect(
      await collectWorkspaces(createDependencies({ listSessions: async () => [], scan })),
    ).toEqual([]);
    expect(scan).not.toHaveBeenCalled();
  });

  test("reports an attached session as attached", async () => {
    const workspaces = await collectWorkspaces(
      createDependencies({
        listSessions: async () => [{ name: "repo-dev", attached: false, path: "/repo" }],
      }),
    );

    expect(workspaces[0]?.attached).toBe(false);
  });
});

describe("readBranch", () => {
  test("asks Git through -C, so a directory that is gone is Git's answer", async () => {
    const git = mock<GitExec>(async () => ({ exitCode: 0, stdout: "feature/api\n", stderr: "" }));

    expect(await readBranch(git, "/repo")).toBe("feature/api");
    expect(git.mock.calls).toEqual([[["git", "-C", "/repo", "branch", "--show-current"]]]);
  });

  test("names a detached HEAD by its short sha", async () => {
    const git = mock<GitExec>(async (argv) =>
      argv.includes("rev-parse")
        ? { exitCode: 0, stdout: "1a2b3c4\n", stderr: "" }
        : { exitCode: 0, stdout: "\n", stderr: "" },
    );

    expect(await readBranch(git, "/repo")).toBe("1a2b3c4");
    expect(git.mock.calls[1]?.[0]).toEqual(["git", "-C", "/repo", "rev-parse", "--short", "HEAD"]);
  });

  test.each([
    ["outside a repository", 128, ""],
    ["an unreadable HEAD", 0, ""],
  ])("falls back to a dash for %s", async (_label, exitCode, sha) => {
    const git = mock<GitExec>(async (argv) =>
      argv.includes("rev-parse")
        ? { exitCode, stdout: sha, stderr: "" }
        : { exitCode: exitCode === 0 ? 0 : 128, stdout: "", stderr: "not a git repository" },
    );

    expect(await readBranch(git, "/repo")).toBe("-");
  });
});

describe("shortenHome", () => {
  test.each([
    ["/home/user/projects/repo", "/home/user", "~/projects/repo"],
    ["/home/user", "/home/user", "~"],
    ["/home/user/", "/home/user", "~/"],
    ["/home/user2/projects", "/home/user", "/home/user2/projects"],
    ["/opt/repo", "/home/user", "/opt/repo"],
    ["/home/user/repo", "/home/user/", "~/repo"],
    ["/home/user/repo", "", "/home/user/repo"],
  ])("shortens %p under %p", (path, home, expected) => {
    expect(shortenHome(path, home)).toBe(expected);
  });
});

describe("formatRss", () => {
  test.each([
    [0, "0K"],
    [1023, "1023K"],
    [1024, "1M"],
    [798720, "780M"],
    [1258291, "1.2G"],
    [16777216, "16.0G"],
  ])("formats %p KiB as %p", (kib, expected) => {
    expect(formatRss(kib)).toBe(expected);
  });
});

describe("formatWorkspaceTable", () => {
  test("aligns the columns and right-aligns the counts", () => {
    const table = formatWorkspaceTable(
      [
        createWorkspace(),
        createWorkspace({
          session: "repo-demo",
          attached: false,
          branch: "demo",
          directory: "/home/user/projects/repo-demo",
          procs: 4,
          rssKib: 798720,
        }),
      ],
      "/home/user",
    );

    expect(table).toBe(
      [
        "SESSION    A  BRANCH  DIRECTORY             PROCS   RSS",
        "repo-dev   *  master  ~/projects/repo           7  1.2G",
        "repo-demo     demo    ~/projects/repo-demo      4  780M",
        "",
      ].join("\n"),
    );
  });

  test("marks a directory that is gone", () => {
    expect(
      formatWorkspaceTable(
        [createWorkspace({ missing: true, branch: "-", procs: 0, rssKib: 0 })],
        "/home/user",
      ),
    ).toContain("~/projects/repo (missing)");
  });

  test("says so instead of printing an empty table", () => {
    expect(formatWorkspaceTable([], "/home/user")).toBe("no termwire workspaces\n");
  });
});

describe("formatWorkspacesJson", () => {
  test("prints the same rows with absolute directories", () => {
    const output = formatWorkspacesJson([createWorkspace()]);

    expect(JSON.parse(output)).toEqual([
      {
        session: "repo-dev",
        attached: true,
        branch: "master",
        directory: "/home/user/projects/repo",
        missing: false,
        procs: 7,
        rssKib: 1258291,
      },
    ]);
    expect(output.endsWith("\n")).toBe(true);
  });

  test("prints an empty array for no workspaces", () => {
    expect(formatWorkspacesJson([])).toBe("[]\n");
  });
});

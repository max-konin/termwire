import { expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { createNvim as createNvimAdapter } from "@termwire/nvim";
import type { createTmux as createTmuxAdapter } from "@termwire/tmux";
import packageJson from "../package.json";
import type { DownRequest, DownResult } from "./down.js";
import type { Exec } from "./exec.js";
import type { InstallPrompter, InstallRequest, InstallResult } from "./install.js";
import type { OpenRequest, OpenResult } from "./open.js";
import type { SessionScanner } from "./process-scan.js";
import { createDarwinScanner } from "./process-scan-darwin.js";
import {
  createDown,
  createInstall,
  createLs,
  createOpen,
  createProgram,
  createReap,
  createUp,
  type ProgramDependencies,
  removeStaleSocket,
  runCommands,
} from "./program.js";
import type { KillOutcome, ReapSignal } from "./reap.js";
import { createReapHookCommand } from "./reap-hook.js";
import type { CliRuntime, RuntimeFileSystem, RuntimeHost } from "./runtime.js";
import { executeGit } from "./runtime.js";
import type { UpRequest } from "./up.js";
import type { Workspace } from "./workspaces.js";
import type { GitExec } from "./worktree.js";

type TmuxAdapter = ReturnType<typeof createTmuxAdapter>;
type NvimAdapter = ReturnType<typeof createNvimAdapter>;

function createInstallStub(result: Partial<InstallResult> = {}) {
  return mock<(request: InstallRequest) => Promise<InstallResult>>().mockResolvedValue({
    cancelled: false,
    configWritten: true,
    agents: [],
    failures: [],
    ...result,
  });
}

function createCommandStubs(overrides: Partial<ProgramDependencies> = {}): ProgramDependencies {
  return {
    up: mock<(request: UpRequest) => Promise<void>>().mockResolvedValue(),
    ls: mock<() => Promise<Workspace[]>>().mockResolvedValue([]),
    down: mock<(request: DownRequest) => Promise<DownResult>>().mockResolvedValue({
      session: "repo-dev",
    }),
    open: createOpenStub(),
    reap: createReapStub(),
    install: createInstallStub(),
    homedir: () => "/home/user",
    writeError: mock<(message: string) => void>(),
    writeOutput: mock<(message: string) => void>(),
    ...overrides,
  };
}

function createTestRuntime(
  overrides: {
    fs?: Partial<RuntimeFileSystem>;
    host?: Partial<RuntimeHost>;
    /** Feeds the real darwin scanner, so `ps` parsing stays covered through a runtime. */
    exec?: Exec;
    createScanner?: () => SessionScanner;
    git?: GitExec;
    tmux?: TmuxAdapter;
    nvim?: NvimAdapter;
    createPrompter?: () => Promise<InstallPrompter>;
  } = {},
): CliRuntime {
  return {
    fs: {
      readFile: async () => "",
      exists: async () => false,
      mkdir: async () => {},
      writeFile: async () => {},
      rename: async () => {},
      appendFile: async () => {},
      unlink: async () => {},
      ...overrides.fs,
    },
    host: {
      env: {},
      cwd: () => "/repo",
      chdir: () => {},
      homedir: () => "/home/user",
      pid: 4242,
      execPath: "/usr/local/bin/node",
      scriptPath: "/opt/termwire/bin/termwire.js",
      now: () => new Date("2026-09-28T10:00:00.000Z"),
      randomId: () => "abc123",
      isTerminal: false,
      kill: () => "gone",
      wait: async () => {},
      writeOutput: () => {},
      writeError: () => {},
      ...overrides.host,
    },
    git: overrides.git ?? (async () => ({ exitCode: 0, stdout: "", stderr: "" })),
    createScanner:
      overrides.createScanner ??
      (() =>
        createDarwinScanner({
          exec: overrides.exec ?? (async () => ({ exitCode: 0, stdout: "", stderr: "" })),
          uid: 501,
        })),
    tmux: overrides.tmux ?? ({} as TmuxAdapter),
    nvim: overrides.nvim ?? ({} as NvimAdapter),
    createPrompter:
      overrides.createPrompter ??
      (async () => {
        throw new Error("no prompter in this test");
      }),
  };
}

function createOpenStub(result: OpenResult = { path: "/repo/src/app.ts", line: 42 }) {
  return mock<(request: OpenRequest) => Promise<OpenResult>>().mockResolvedValue(result);
}

function createReapStub() {
  return mock<(session: string) => Promise<void>>().mockResolvedValue();
}

test.each([
  [["up", "dev"], { name: "dev" }],
  [["up", "dev", "-w"], { name: "dev", worktree: true }],
  [["up", "dev", "--worktree"], { name: "dev", worktree: true }],
  [["up", "dev", "--worktree=feature"], { name: "dev", worktree: "feature" }],
  [["up", "dev", "--worktree", "feature"], { name: "dev", worktree: "feature" }],
  [["up", "dev", "-wfeature"], { name: "dev", worktree: "feature" }],
  [["up", "dev", "-w", "feature"], { name: "dev", worktree: "feature" }],
  [["up", "dev", "-b", "feature/api"], { name: "dev", branch: "feature/api" }],
  [
    ["up", "dev", "-w", "-b", "feature/api"],
    { name: "dev", worktree: true, branch: "feature/api" },
  ],
  [
    ["up", "dev", "--worktree=legacy", "--branch=feature/api"],
    { name: "dev", worktree: "legacy", branch: "feature/api" },
  ],
] as [string[], UpRequest][])("normalizes %p into an up request", async (argv, request) => {
  const up = mock<(request: UpRequest) => Promise<void>>().mockResolvedValue();
  const writeError = mock<(message: string) => void>();
  const program = createProgram(createCommandStubs({ up, writeError }));

  await program.parseAsync(argv, { from: "user" });

  expect(up).toHaveBeenCalledTimes(1);
  expect(up).toHaveBeenCalledWith(request);
  expect(writeError).not.toHaveBeenCalled();
});

test.each([["--version"], ["-V"]])("prints the package version for %s", async (flag) => {
  const writeOutput = mock<(message: string) => void>();
  const writeError = mock<(message: string) => void>();

  expect(
    await runCommands(
      [flag],
      createCommandStubs({
        up: mock<(request: UpRequest) => Promise<void>>().mockResolvedValue(),
        open: createOpenStub(),
        reap: createReapStub(),
        writeError,
        writeOutput,
      }),
    ),
  ).toBe(0);

  expect(writeOutput).toHaveBeenCalledWith(`${packageJson.version}\n`);
  expect(writeError).not.toHaveBeenCalled();
});

test("documents the version flag in help", async () => {
  const writeOutput = mock<(message: string) => void>();

  await runCommands(
    ["--help"],
    createCommandStubs({
      up: mock<(request: UpRequest) => Promise<void>>().mockResolvedValue(),
      open: createOpenStub(),
      reap: createReapStub(),
      writeError: mock<(message: string) => void>(),
      writeOutput,
    }),
  );

  expect(writeOutput.mock.calls.map(([message]) => message).join("")).toContain("-V, --version");
});

test.each([
  [["--help"], ["Usage: termwire", "up [options] <name>"]],
  [
    ["up", "--help"],
    [
      "Usage: termwire up [options] <name>",
      "-w, --worktree [wt-name]",
      "-b, --branch <name>",
      "Branch and worktree selection:",
      "Without -w, --branch switches the current checkout",
      "With -w, the optional worktree name selects the directory",
      "Slashes are preserved in Git branch names",
      "Existing sessions attach without Git changes",
    ],
  ],
])("prints %p help to injected stdout", async (argv, expected) => {
  const up = mock<(request: UpRequest) => Promise<void>>().mockResolvedValue();
  const writeError = mock<(message: string) => void>();
  const writeOutput = mock<(message: string) => void>();

  expect(await runCommands(argv, createCommandStubs({ up, writeError, writeOutput }))).toBe(0);

  const output = writeOutput.mock.calls.flat().join("");
  for (const value of expected) {
    expect(output).toContain(value);
  }
  expect(up).not.toHaveBeenCalled();
  expect(writeError).not.toHaveBeenCalled();
});

test.each([[["up"]], [["up", "dev", "--unknown"]], [["up", "dev", "--branch"]]])(
  "reports %p as a usage error",
  async (argv) => {
    const up = mock<(request: UpRequest) => Promise<void>>().mockResolvedValue();
    const writeError = mock<(message: string) => void>();
    const writeOutput = mock<(message: string) => void>();

    expect(await runCommands(argv, createCommandStubs({ up, writeError, writeOutput }))).not.toBe(
      0,
    );

    const error = writeError.mock.calls.flat().join("");
    expect(error).toContain("error:");
    expect(error).toContain("Usage:");
    expect(up).not.toHaveBeenCalled();
  },
);

test("presents up failures without a stack trace", async () => {
  const up = mock<(request: UpRequest) => Promise<void>>().mockRejectedValue(
    new Error("worktree requires a Git repository"),
  );
  const writeError = mock<(message: string) => void>();
  const writeOutput = mock<(message: string) => void>();

  expect(
    await runCommands(["up", "dev", "-w"], createCommandStubs({ up, writeError, writeOutput })),
  ).toBe(1);

  expect(writeError).toHaveBeenCalledTimes(1);
  expect(writeError).toHaveBeenCalledWith("termwire: worktree requires a Git repository\n");
});

test("does not read config files when attaching an existing runtime session", async () => {
  const hasSession = mock<(session: string) => Promise<boolean>>().mockResolvedValue(true);
  const attach = mock<(session: string) => Promise<void>>().mockResolvedValue();
  const pathExists = mock<(path: string) => Promise<boolean>>().mockResolvedValue(true);
  const readFile = mock<(path: string) => Promise<string>>().mockResolvedValue('{ "version": 1 }');
  const runtimeUp = createUp(
    createTestRuntime({
      tmux: { hasSession, attach } as unknown as TmuxAdapter,
      host: { env: { XDG_CONFIG_HOME: "/xdg" } },
      fs: { readFile, exists: pathExists },
      git: mock<GitExec>().mockResolvedValue({ exitCode: 0, stdout: "/repo\n", stderr: "" }),
    }),
  );

  await runtimeUp({ name: "dev" });

  expect(attach).toHaveBeenCalledWith("repo-dev");
  expect(pathExists).not.toHaveBeenCalled();
  expect(readFile).not.toHaveBeenCalled();
});

test("reads global then project config for a new runtime session", async () => {
  const tmux = {
    hasSession: mock<(session: string) => Promise<boolean>>().mockResolvedValue(false),
    newSession: mock<() => Promise<{ windowId: string; paneId: string }>>().mockResolvedValue({
      windowId: "@1",
      paneId: "%1",
    }),
    setSessionTitle: mock<() => Promise<void>>().mockResolvedValue(),
    newWindow: mock<() => Promise<{ windowId: string; paneId: string }>>().mockResolvedValue({
      windowId: "@2",
      paneId: "%2",
    }),
    setEnvironment: mock<() => Promise<void>>().mockResolvedValue(),
    respawnPane: mock<() => Promise<void>>().mockResolvedValue(),
    selectWindow: mock<() => Promise<void>>().mockResolvedValue(),
    selectPane: mock<() => Promise<void>>().mockResolvedValue(),
    attach: mock<() => Promise<void>>().mockResolvedValue(),
  } as unknown as TmuxAdapter;
  const readFile = mock<(path: string) => Promise<string>>().mockResolvedValue(
    '// config\n{ "version": 1, }',
  );
  const runtimeUp = createUp(
    createTestRuntime({
      tmux,
      host: { env: { XDG_CONFIG_HOME: "/xdg" } },
      fs: { readFile, exists: async () => true },
      git: mock<GitExec>().mockResolvedValue({ exitCode: 0, stdout: "/repo\n", stderr: "" }),
    }),
  );

  await runtimeUp({ name: "dev" });

  expect(readFile.mock.calls).toEqual([["/xdg/termwire/config.jsonc"], ["/repo/.termwire.jsonc"]]);
});

test("wires runtime requests through Git discovery and existing-session attach", async () => {
  const hasSession = mock<(session: string) => Promise<boolean>>().mockResolvedValue(true);
  const attach = mock<(session: string) => Promise<void>>().mockResolvedValue();
  const tmux = { hasSession, attach } as unknown as TmuxAdapter;
  const gitExec = mock<GitExec>().mockResolvedValue({
    exitCode: 0,
    stdout: "/repo\n",
    stderr: "",
  });
  const mkdir = mock<(path: string) => Promise<void>>().mockResolvedValue();
  const pathExists = mock<(path: string) => Promise<boolean>>().mockResolvedValue(false);
  const unlink = mock<(path: string) => Promise<void>>().mockResolvedValue();

  const runtimeUp = createUp(
    createTestRuntime({ tmux, git: gitExec, fs: { mkdir, exists: pathExists, unlink } }),
  );
  await runtimeUp({ name: "dev", worktree: "feature" });

  expect(hasSession).toHaveBeenCalledTimes(1);
  expect(gitExec).toHaveBeenCalledWith(["git", "rev-parse", "--show-toplevel"], { cwd: "/repo" });
  expect(hasSession).toHaveBeenCalledWith("repo-dev");
  expect(attach).toHaveBeenCalledWith("repo-dev");
  expect(mkdir).not.toHaveBeenCalled();
  expect(pathExists).not.toHaveBeenCalled();
  expect(unlink).not.toHaveBeenCalled();
});

test("wires runtime branch preparation before creating a new session", async () => {
  const tmux = {
    hasSession: mock<() => Promise<boolean>>().mockResolvedValue(false),
    newSession: mock<() => Promise<{ windowId: string; paneId: string }>>().mockResolvedValue({
      windowId: "@1",
      paneId: "%1",
    }),
    setSessionTitle: mock<() => Promise<void>>().mockResolvedValue(),
    setEnvironment: mock<() => Promise<void>>().mockResolvedValue(),
    respawnPane: mock<() => Promise<void>>().mockResolvedValue(),
    newWindow: mock<() => Promise<{ windowId: string; paneId: string }>>().mockResolvedValue({
      windowId: "@2",
      paneId: "%2",
    }),
    selectWindow: mock<() => Promise<void>>().mockResolvedValue(),
    selectPane: mock<() => Promise<void>>().mockResolvedValue(),
    attach: mock<() => Promise<void>>().mockResolvedValue(),
  } as unknown as TmuxAdapter;
  const gitExec = mock<GitExec>().mockImplementation(async (argv) => {
    if (argv.join(" ") === "git rev-parse --show-toplevel") {
      return { exitCode: 0, stdout: "/repo\n", stderr: "" };
    }
    if (argv.join(" ") === "git show-ref --verify --quiet refs/heads/feature/api") {
      return { exitCode: 1, stdout: "", stderr: "" };
    }
    return { exitCode: 0, stdout: "", stderr: "" };
  });

  const runtimeUp = createUp(createTestRuntime({ tmux, git: gitExec }));

  await runtimeUp({ name: "dev", branch: "feature/api" });

  expect(gitExec.mock.calls).toEqual([
    [["git", "rev-parse", "--show-toplevel"], { cwd: "/repo" }],
    [["git", "show-ref", "--verify", "--quiet", "refs/heads/feature/api"], { cwd: "/repo" }],
    [["git", "switch", "-c", "feature/api"], { cwd: "/repo" }],
    [["git", "rev-parse", "--show-toplevel"], { cwd: "/repo" }],
  ]);
});

test("ignores a missing stale socket", async () => {
  const missing = Object.assign(new Error("missing"), { code: "ENOENT" });
  const unlink = mock<(path: string) => Promise<void>>().mockRejectedValue(missing);

  expect(await removeStaleSocket("/tmp/termwire/repo-dev.sock", unlink)).toBeUndefined();

  expect(unlink).toHaveBeenCalledWith("/tmp/termwire/repo-dev.sock");
});

test("propagates a stale socket removal error other than ENOENT", async () => {
  const failure = Object.assign(new Error("permission denied"), { code: "EACCES" });
  const unlink = mock<(path: string) => Promise<void>>().mockRejectedValue(failure);

  await expect(removeStaleSocket("/tmp/termwire/repo-dev.sock", unlink)).rejects.toBe(failure);

  expect(unlink).toHaveBeenCalledWith("/tmp/termwire/repo-dev.sock");
});

test("rejects an explicitly empty worktree option before calling up", async () => {
  const up = mock<(request: UpRequest) => Promise<void>>().mockResolvedValue();
  const writeError = mock<(message: string) => void>();
  const writeOutput = mock<(message: string) => void>();

  expect(
    await runCommands(
      ["up", "dev", "--worktree="],
      createCommandStubs({ up, writeError, writeOutput }),
    ),
  ).toBe(1);

  expect(writeError).toHaveBeenCalledWith("termwire: worktree name must not be empty\n");
  expect(up).not.toHaveBeenCalled();
});

test("rejects an explicitly empty branch option before calling up", async () => {
  const up = mock<(request: UpRequest) => Promise<void>>().mockResolvedValue();
  const writeError = mock<(message: string) => void>();
  const writeOutput = mock<(message: string) => void>();

  expect(
    await runCommands(
      ["up", "dev", "--branch="],
      createCommandStubs({ up, writeError, writeOutput }),
    ),
  ).toBe(1);

  expect(writeError).toHaveBeenCalledWith("termwire: branch name must not be empty\n");
  expect(up).not.toHaveBeenCalled();
});

test("wraps a spawn failure with Git execution context", async () => {
  await expect(
    executeGit(["termwire-missing-git-binary", "status"], { cwd: "/" }),
  ).rejects.toMatchObject({
    message: "git execution failed: termwire-missing-git-binary status",
    cause: { code: "ENOENT" },
  });
});

test("rejects an empty Git command", async () => {
  await expect(executeGit([], { cwd: "/" })).rejects.toThrow("git execution failed: empty command");
});

test("captures Git stdout and exit code", async () => {
  const result = await executeGit(["git", "--version"], { cwd: "/" });

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("git version");
});

test.each([
  [["open", "src/app.ts"], { target: "src/app.ts" }],
  [["open", "src/app.ts:42"], { target: "src/app.ts:42" }],
  [["open", "src/app.ts", "-l", "42"], { target: "src/app.ts", line: "42" }],
  [["open", "src/app.ts", "--line", "42"], { target: "src/app.ts", line: "42" }],
  [["open", "src/app.ts", "--line=42"], { target: "src/app.ts", line: "42" }],
] as [string[], OpenRequest][])("normalizes %p into an open request", async (argv, request) => {
  const open = createOpenStub();
  const writeError = mock<(message: string) => void>();

  expect(await runCommands(argv, createCommandStubs({ open, writeError }))).toBe(0);

  expect(open).toHaveBeenCalledTimes(1);
  expect(open).toHaveBeenCalledWith(request);
  expect(writeError).not.toHaveBeenCalled();
});

test.each([
  [{ path: "/repo/src/app.ts", line: 42 }, "Opened /repo/src/app.ts at line 42\n"],
  [{ path: "/repo/README.md" }, "Opened /repo/README.md\n"],
] as [OpenResult, string][])("reports %p on stdout", async (result, expected) => {
  const writeOutput = mock<(message: string) => void>();

  expect(
    await runCommands(
      ["open", "src/app.ts"],
      createCommandStubs({ open: createOpenStub(result), writeOutput }),
    ),
  ).toBe(0);

  expect(writeOutput).toHaveBeenCalledWith(expected);
});

test("prints open help to injected stdout", async () => {
  const writeOutput = mock<(message: string) => void>();
  const open = createOpenStub();

  expect(
    await runCommands(
      ["open", "--help"],
      createCommandStubs({
        open,
        writeError: mock<(message: string) => void>(),
        writeOutput,
      }),
    ),
  ).toBe(0);

  const output = writeOutput.mock.calls.flat().join("");
  for (const value of [
    "Usage: termwire open [options] <target>",
    "-l, --line <number>",
    "Target syntax:",
    "A trailing :<line> selects the line",
    "With --line, the target is used verbatim",
    "Requires a shell created by termwire up",
  ]) {
    expect(output).toContain(value);
  }
  expect(open).not.toHaveBeenCalled();
});

test("presents open failures without a stack trace", async () => {
  const open = mock<(request: OpenRequest) => Promise<OpenResult>>().mockRejectedValue(
    new Error("not inside a termwire workspace"),
  );
  const writeError = mock<(message: string) => void>();

  expect(
    await runCommands(
      ["open", "src/app.ts"],
      createCommandStubs({
        open,
        writeError,
        writeOutput: mock<(message: string) => void>(),
      }),
    ),
  ).toBe(1);

  expect(writeError).toHaveBeenCalledWith("termwire: not inside a termwire workspace\n");
});

test("wires runtime open through the injected adapters and environment", async () => {
  const isRunning = mock<(socket: string) => Promise<boolean>>().mockResolvedValue(true);
  const openFile =
    mock<(socket: string, path: string, line?: number) => Promise<void>>().mockResolvedValue();
  const selectWindow = mock<(target: string) => Promise<void>>().mockResolvedValue();
  const selectPane = mock<(pane: string) => Promise<void>>().mockResolvedValue();

  const runtimeOpen = createOpen(
    createTestRuntime({
      nvim: { isRunning, openFile } as unknown as NvimAdapter,
      tmux: { selectWindow, selectPane } as unknown as TmuxAdapter,
      host: {
        env: { TERMWIRE_SOCKET: "/tmp/termwire/repo-dev.sock", TERMWIRE_EDITOR_PANE: "%3" },
      },
    }),
  );

  expect(await runtimeOpen({ target: "src/app.ts:42" })).toEqual({
    path: "/repo/src/app.ts",
    line: 42,
  });

  expect(isRunning).toHaveBeenCalledWith("/tmp/termwire/repo-dev.sock");
  expect(openFile).toHaveBeenCalledWith("/tmp/termwire/repo-dev.sock", "/repo/src/app.ts", 42);
  expect(selectWindow).toHaveBeenCalledWith("%3");
  expect(selectPane).toHaveBeenCalledWith("%3");
});

test("routes the hidden reap command and keeps it out of help", async () => {
  const reap = createReapStub();
  const writeOutput = mock<(message: string) => void>();
  const writeError = mock<(message: string) => void>();

  expect(
    await runCommands(
      ["_reap", "repo-dev"],
      createCommandStubs({
        up: mock<(request: UpRequest) => Promise<void>>().mockResolvedValue(),
        open: createOpenStub(),
        reap,
        writeError,
        writeOutput,
      }),
    ),
  ).toBe(0);
  expect(reap).toHaveBeenCalledWith("repo-dev");

  await runCommands(
    ["--help"],
    createCommandStubs({
      up: mock<(request: UpRequest) => Promise<void>>().mockResolvedValue(),
      open: createOpenStub(),
      reap,
      writeError,
      writeOutput,
    }),
  );

  const help = writeOutput.mock.calls.map(([message]) => message).join("");
  expect(help).toContain("up [options] <name>");
  expect(help).not.toContain("_reap");
});

test("installs the cleanup hook with absolute runtime paths", async () => {
  const showHooks = mock<() => Promise<never[]>>().mockResolvedValue([]);
  const setHook = mock<(options: unknown) => Promise<void>>().mockResolvedValue();
  const tmux = {
    hasSession: mock<() => Promise<boolean>>().mockResolvedValue(true),
    attach: mock<() => Promise<void>>().mockResolvedValue(),
    showHooks,
    setHook,
  } as unknown as TmuxAdapter;
  const warn = mock<(message: string) => void>();

  const runtimeUp = createUp(
    createTestRuntime({
      tmux,
      git: mock<GitExec>().mockResolvedValue({ exitCode: 0, stdout: "/repo\n", stderr: "" }),
      host: {
        execPath: "/usr/local/bin/node",
        scriptPath: "/opt/termwire/bin/termwire.js",
        writeError: warn,
      },
    }),
  );

  await runtimeUp({ name: "dev" });

  expect(showHooks).toHaveBeenCalledWith({ global: true });
  expect(setHook).toHaveBeenCalledWith({
    name: "session-closed",
    command: createReapHookCommand({
      execPath: "/usr/local/bin/node",
      scriptPath: "/opt/termwire/bin/termwire.js",
    }),
    global: true,
    append: true,
  });
  expect(warn).not.toHaveBeenCalled();
});

test.each([
  ["the tmux server refuses the hook", "/opt/termwire/bin/termwire.js"],
  ["the script path is unknown", undefined],
])("warns and still brings the workspace up when %s", async (_label, scriptPath) => {
  const tmux = {
    hasSession: mock<() => Promise<boolean>>().mockResolvedValue(true),
    attach: mock<() => Promise<void>>().mockResolvedValue(),
    showHooks: mock<() => Promise<never[]>>().mockRejectedValue(new Error("no server")),
    setHook: mock<(options: unknown) => Promise<void>>().mockResolvedValue(),
  } as unknown as TmuxAdapter;
  const warn = mock<(message: string) => void>();

  const runtimeUp = createUp(
    createTestRuntime({
      tmux,
      git: mock<GitExec>().mockResolvedValue({ exitCode: 0, stdout: "/repo\n", stderr: "" }),
      host: { execPath: "/usr/local/bin/node", scriptPath, writeError: warn },
    }),
  );

  await runtimeUp({ name: "dev" });

  expect(warn.mock.calls[0]?.[0]).toContain("termwire: session cleanup hook not installed:");
  expect(tmux.attach).toHaveBeenCalledWith("repo-dev");
});

test("reports what a runtime reap killed in the log", async () => {
  const appendFile = mock<(path: string, contents: string) => Promise<void>>().mockResolvedValue();
  const mkdir = mock<(path: string) => Promise<void>>().mockResolvedValue();
  const kill = mock<(pid: number, signal: ReapSignal) => KillOutcome>().mockReturnValue("gone");
  const exec = mock<Exec>(async (argv) =>
    argv.includes("-Eww")
      ? {
          exitCode: 0,
          stdout: " 900 1 204800 /usr/local/bin/node /repo/dev.js TERMWIRE_SESSION=repo-dev\n",
          stderr: "",
        }
      : { exitCode: 0, stdout: " 900 /usr/local/bin/node /repo/dev.js\n", stderr: "" },
  );

  const runtimeReap = createReap(
    createTestRuntime({
      exec,
      fs: { appendFile, mkdir },
      host: { env: { XDG_STATE_HOME: "/state" }, kill },
    }),
  );

  await runtimeReap("repo-dev");

  expect(kill).toHaveBeenCalledWith(900, "SIGTERM");
  expect(mkdir).toHaveBeenCalledWith("/state/termwire");
  expect(appendFile).toHaveBeenCalledWith(
    "/state/termwire/reap.log",
    "2026-09-28T10:00:00.000Z session=repo-dev targets=900 terminated=900 killed=- survived=- denied=- unlabeled=-\n",
  );
});

test("never kills the tmux server named by TMUX, even when it carries the label", async () => {
  const appendFile = mock<(path: string, contents: string) => Promise<void>>().mockResolvedValue();
  const kill = mock<(pid: number, signal: ReapSignal) => KillOutcome>().mockReturnValue("gone");
  const listing =
    " 700 1 8192 tmux new-session -d -s repo-dev TERMWIRE_SESSION=repo-dev\n" +
    " 900 1 204800 /usr/local/bin/node /repo/dev.js TERMWIRE_SESSION=repo-dev\n";
  const exec = mock<Exec>(async (argv) =>
    argv.includes("-Eww")
      ? { exitCode: 0, stdout: listing, stderr: "" }
      : {
          exitCode: 0,
          stdout: " 700 tmux new-session -d -s repo-dev\n 900 /usr/local/bin/node /repo/dev.js\n",
          stderr: "",
        },
  );

  const runtimeReap = createReap(
    createTestRuntime({
      exec,
      fs: { appendFile },
      host: {
        env: { XDG_STATE_HOME: "/state", TMUX: "/private/tmp/tmux-501/default,700,0" },
        kill,
      },
    }),
  );

  await runtimeReap("repo-dev");

  expect(kill).toHaveBeenCalledWith(900, "SIGTERM");
  expect(kill).not.toHaveBeenCalledWith(700, "SIGTERM");
  expect(appendFile.mock.calls[0]?.[1]).toContain("targets=900");
});

test("records a failed runtime reap and reports it as a command failure", async () => {
  const appendFile = mock<(path: string, contents: string) => Promise<void>>().mockResolvedValue();
  const writeError = mock<(message: string) => void>();
  const reap = createReap(
    createTestRuntime({
      fs: { appendFile },
      host: { env: { XDG_STATE_HOME: "/state" } },
      // What `createPlatformScanner` throws there; the runtime owns that choice now.
      createScanner: () => {
        throw new Error("process scanning is not supported on plan9");
      },
    }),
  );

  expect(
    await runCommands(
      ["_reap", "repo-dev"],
      createCommandStubs({
        up: mock<(request: UpRequest) => Promise<void>>().mockResolvedValue(),
        open: createOpenStub(),
        reap,
        writeError,
        writeOutput: mock<(message: string) => void>(),
      }),
    ),
  ).toBe(1);

  expect(appendFile).toHaveBeenCalledWith(
    "/state/termwire/reap.log",
    "2026-09-28T10:00:00.000Z session=repo-dev error=process scanning is not supported on plan9\n",
  );
  expect(writeError).toHaveBeenCalledWith("termwire: process scanning is not supported on plan9\n");
});

test.each([
  [["install"], {}],
  [["install", "--yes"], { yes: true }],
  [["install", "-y"], { yes: true }],
  [["install", "--layout", "focused"], { layout: "focused" }],
  [["install", "-l", "none"], { layout: "none" }],
  [["install", "--project"], { project: true }],
  [["install", "--force"], { force: true }],
  [["install", "--agents", "claude,opencode"], { agents: ["claude", "opencode"] }],
  [["install", "--agents", "none"], { agents: [] }],
  [
    ["install", "-l", "default", "-a", "claude", "-p", "-f", "-y"],
    { layout: "default", agents: ["claude"], project: true, force: true, yes: true },
  ],
] as [string[], InstallRequest][])(
  "normalizes %p into an install request",
  async (argv, request) => {
    const install = createInstallStub();

    expect(await runCommands(argv, createCommandStubs({ install }))).toBe(0);
    expect(install).toHaveBeenCalledWith(request);
  },
);

test("reports an unknown agent without calling install", async () => {
  const install = createInstallStub();
  const writeError = mock<(message: string) => void>();

  expect(
    await runCommands(
      ["install", "--agents", "cursor"],
      createCommandStubs({ install, writeError }),
    ),
  ).toBe(1);
  expect(install).not.toHaveBeenCalled();
  expect(writeError).toHaveBeenCalledWith(
    "termwire: unknown agent: cursor (expected claude, codex, opencode)\n",
  );
});

test("exits non-zero when a step of install failed", async () => {
  const writeError = mock<(message: string) => void>();

  expect(
    await runCommands(
      ["install", "--yes"],
      createCommandStubs({
        install: createInstallStub({ configWritten: false, failures: ["config exists"] }),
        writeError,
      }),
    ),
  ).toBe(1);
  expect(writeError).toHaveBeenCalledWith(
    "termwire: install finished with errors: config exists\n",
  );
});

test("documents install in the root help", async () => {
  const writeOutput = mock<(message: string) => void>();

  await runCommands(["--help"], createCommandStubs({ writeOutput }));

  expect(writeOutput.mock.calls.map(([message]) => message).join("")).toContain(
    "install [options]",
  );
});

test("composes install from the runtime: writes the config and the skill", async () => {
  const writeFile = mock<RuntimeFileSystem["writeFile"]>().mockResolvedValue();
  const rename = mock<RuntimeFileSystem["rename"]>().mockResolvedValue();
  const runtimeInstall = createInstall(
    createTestRuntime({
      fs: {
        writeFile,
        rename,
        // Claude is set up here, Codex is not.
        exists: async (path) => path === "/home/user/.claude",
        // The real shipped skill, read the way the runtime reads it.
        readFile: async (path) => readFileSync(path, "utf8"),
      },
      host: { env: { XDG_CONFIG_HOME: "/xdg" }, homedir: () => "/home/user" },
    }),
  );

  const result = await runtimeInstall({ layout: "default", agents: ["claude", "codex"] });

  expect(writeFile).toHaveBeenCalledWith(
    "/xdg/termwire/config.jsonc",
    expect.stringContaining('"role": "editor"'),
    { flag: "wx" },
  );
  // Nothing was there, so the skill is created exclusively rather than replaced.
  expect(writeFile).toHaveBeenCalledWith(
    "/home/user/.claude/skills/termwire-open/SKILL.md",
    expect.stringContaining("termwire open <path>[:<line>]"),
    { flag: "wx" },
  );
  expect(rename).not.toHaveBeenCalled();
  expect(result.agents).toEqual([
    { id: "claude", outcome: "installed" },
    { id: "codex", outcome: "unavailable" },
  ]);
});

test("never builds a prompter without a terminal", async () => {
  const createPrompter = mock<() => Promise<InstallPrompter>>().mockRejectedValue(
    new Error("should not be called"),
  );

  await createInstall(createTestRuntime({ createPrompter, host: { isTerminal: false } }))({
    layout: "none",
    agents: [],
  });

  expect(createPrompter).not.toHaveBeenCalled();
});

test("skips the prompter when --yes answers everything", async () => {
  const createPrompter = mock<() => Promise<InstallPrompter>>().mockRejectedValue(
    new Error("should not be called"),
  );

  await createInstall(
    createTestRuntime({ createPrompter, host: { isTerminal: true, env: { PATH: "" } } }),
  )({ yes: true, layout: "none" });

  expect(createPrompter).not.toHaveBeenCalled();
});

const workspaceRow: Workspace = {
  session: "repo-dev",
  attached: true,
  branch: "master",
  directory: "/home/user/projects/repo",
  missing: false,
  procs: 7,
  rssKib: 1258291,
};

test("prints the workspace table with $HOME shortened", async () => {
  const writeOutput = mock<(message: string) => void>();

  expect(
    await runCommands(
      ["ls"],
      createCommandStubs({
        ls: mock<() => Promise<Workspace[]>>().mockResolvedValue([workspaceRow]),
        homedir: () => "/home/user",
        writeOutput,
      }),
    ),
  ).toBe(0);

  expect(writeOutput.mock.calls.flat().join("")).toBe(
    "SESSION   A  BRANCH  DIRECTORY        PROCS   RSS\nrepo-dev  *  master  ~/projects/repo      7  1.2G\n",
  );
});

test("prints the same rows as JSON for --json", async () => {
  const writeOutput = mock<(message: string) => void>();

  expect(
    await runCommands(
      ["ls", "--json"],
      createCommandStubs({
        ls: mock<() => Promise<Workspace[]>>().mockResolvedValue([workspaceRow]),
        writeOutput,
      }),
    ),
  ).toBe(0);

  expect(JSON.parse(writeOutput.mock.calls.flat().join(""))).toEqual([workspaceRow]);
});

test("reports no workspaces without failing", async () => {
  const writeOutput = mock<(message: string) => void>();
  const writeError = mock<(message: string) => void>();

  expect(await runCommands(["ls"], createCommandStubs({ writeOutput, writeError }))).toBe(0);

  expect(writeOutput).toHaveBeenCalledWith("no termwire workspaces\n");
  expect(writeError).not.toHaveBeenCalled();
});

test("composes ls from the runtime: labeled sessions, Git, and the process scan", async () => {
  const listSessions = mock<TmuxAdapter["listSessions"]>().mockResolvedValue([
    { name: "repo-dev", attached: true, path: "/home/user/projects/repo" },
    { name: "repo-plain", attached: false, path: "/home/user/projects/repo" },
  ]);
  const showEnvironment = mock<(session: string) => Promise<Record<string, string>>>(
    async (session): Promise<Record<string, string>> =>
      session === "repo-dev" ? { TERMWIRE_SESSION: "repo-dev" } : {},
  );
  const exec = mock<Exec>(async (argv) =>
    argv.includes("-Eww")
      ? {
          exitCode: 0,
          stdout: " 900 1 204800 /usr/local/bin/node /repo/dev.js TERMWIRE_SESSION=repo-dev\n",
          stderr: "",
        }
      : { exitCode: 0, stdout: " 900 /usr/local/bin/node /repo/dev.js\n", stderr: "" },
  );

  const runtimeLs = createLs(
    createTestRuntime({
      tmux: { listSessions, showEnvironment } as unknown as TmuxAdapter,
      git: mock<GitExec>().mockResolvedValue({ exitCode: 0, stdout: "master\n", stderr: "" }),
      fs: { exists: async () => true },
      exec,
    }),
  );

  expect(await runtimeLs()).toEqual([
    {
      session: "repo-dev",
      attached: true,
      branch: "master",
      directory: "/home/user/projects/repo",
      missing: false,
      procs: 1,
      rssKib: 204800,
    },
  ]);
});

test.each([
  [["down"], {}],
  [["down", "-w"], { worktree: true }],
  [["down", "dev"], { name: "dev" }],
  [["down", "dev", "-w"], { name: "dev", worktree: true }],
  [["down", "dev", "--worktree"], { name: "dev", worktree: true }],
  [["down", "dev", "-w", "--force"], { name: "dev", worktree: true, force: true }],
  [["down", "dev", "-wf"], { name: "dev", worktree: true, force: true }],
] as [string[], DownRequest][])("normalizes %p into a down request", async (argv, request) => {
  const down = mock<(request: DownRequest) => Promise<DownResult>>().mockResolvedValue({
    session: "repo-dev",
  });
  const writeError = mock<(message: string) => void>();

  expect(await runCommands(argv, createCommandStubs({ down, writeError }))).toBe(0);

  expect(down).toHaveBeenCalledWith(request);
  expect(writeError).not.toHaveBeenCalled();
});

test.each([
  [{ session: "repo-dev" }, ["Killed session repo-dev\n"]],
  [
    { session: "repo-dev", worktree: "/home/user/projects/repo-dev" },
    ["Killed session repo-dev\n", "Removed worktree /home/user/projects/repo-dev\n"],
  ],
] as [DownResult, string[]][])("reports %p on stdout", async (result, expected) => {
  const writeOutput = mock<(message: string) => void>();

  expect(
    await runCommands(
      ["down", "dev"],
      createCommandStubs({
        down: mock<(request: DownRequest) => Promise<DownResult>>().mockResolvedValue(result),
        writeOutput,
      }),
    ),
  ).toBe(0);

  expect(writeOutput.mock.calls.flat()).toEqual(expected);
});

test("presents an unknown session without a stack trace", async () => {
  const writeError = mock<(message: string) => void>();

  expect(
    await runCommands(
      ["down", "dev"],
      createCommandStubs({
        down: mock<(request: DownRequest) => Promise<DownResult>>().mockRejectedValue(
          new Error("no workspace session named repo-dev"),
        ),
        writeError,
      }),
    ),
  ).toBe(1);

  expect(writeError).toHaveBeenCalledWith("termwire: no workspace session named repo-dev\n");
});

test("composes a bare down from the runtime: the inherited label names the session", async () => {
  const listSessions = mock<TmuxAdapter["listSessions"]>().mockResolvedValue([
    { name: "repo-dev", attached: true, path: "/home/user/projects/repo" },
  ]);
  const killSession = mock<(session: string) => Promise<void>>().mockResolvedValue();
  const git = mock<GitExec>();

  const runtimeDown = createDown(
    createTestRuntime({
      tmux: { listSessions, killSession } as unknown as TmuxAdapter,
      git,
      host: { env: { TERMWIRE_SESSION: "repo-dev" } },
    }),
  );

  expect(await runtimeDown({})).toEqual({ session: "repo-dev" });

  expect(killSession).toHaveBeenCalledWith("repo-dev");
  expect(git).not.toHaveBeenCalled();
});

test("composes down from the runtime: kills the session and removes its worktree", async () => {
  const listSessions = mock<TmuxAdapter["listSessions"]>().mockResolvedValue([
    { name: "repo-dev", attached: false, path: "/home/user/projects/repo-dev" },
  ]);
  const killSession = mock<(session: string) => Promise<void>>().mockResolvedValue();
  const git = mock<GitExec>(async (argv) => {
    if (argv.includes("--show-toplevel")) {
      return { exitCode: 0, stdout: "/repo\n", stderr: "" };
    }
    if (argv.includes("--absolute-git-dir")) {
      return {
        exitCode: 0,
        stdout: "/repo/.git/worktrees/repo-dev\n/repo/.git\n",
        stderr: "",
      };
    }
    return { exitCode: 0, stdout: "", stderr: "" };
  });

  const runtimeDown = createDown(
    createTestRuntime({
      tmux: { listSessions, killSession } as unknown as TmuxAdapter,
      git,
    }),
  );

  expect(await runtimeDown({ name: "dev", worktree: true })).toEqual({
    session: "repo-dev",
    worktree: "/home/user/projects/repo-dev",
  });

  expect(killSession).toHaveBeenCalledWith("repo-dev");
  expect(git.mock.calls.map(([argv]) => argv)).toEqual([
    ["git", "rev-parse", "--show-toplevel"],
    [
      "git",
      "-C",
      "/home/user/projects/repo-dev",
      "rev-parse",
      "--absolute-git-dir",
      "--git-common-dir",
    ],
    ["git", "-C", "/home/user/projects/repo-dev", "status", "--porcelain"],
    [
      "git",
      "-C",
      "/home/user/projects/repo-dev",
      "worktree",
      "remove",
      "/home/user/projects/repo-dev",
    ],
  ]);
});

test.each([
  [["--help"], ["ls [options]", "down [options] [name]"]],
  [
    ["ls", "--help"],
    [
      "Usage: termwire ls [options]",
      "--json",
      "Columns:",
      "A marks an attached session",
      "only when its tmux environment carries TERMWIRE_SESSION",
    ],
  ],
  [
    ["down", "--help"],
    [
      "Usage: termwire down [options] [name]",
      "-w, --worktree",
      "-f, --force",
      "Teardown:",
      "the workspace this command runs in, from TERMWIRE_SESSION",
      "the branch always outlives the workspace",
    ],
  ],
])("documents %p in help", async (argv, expected) => {
  const writeOutput = mock<(message: string) => void>();

  expect(await runCommands(argv, createCommandStubs({ writeOutput }))).toBe(0);

  const output = writeOutput.mock.calls.flat().join("");
  for (const value of expected) {
    expect(output).toContain(value);
  }
});

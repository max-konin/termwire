import { expect, mock, test } from "bun:test";
import type { createNvim as createNvimAdapter } from "@termwire/nvim";
import type { createTmux as createTmuxAdapter } from "@termwire/tmux";
import type { OpenRequest, OpenResult } from "./open.js";
import {
  createProgram,
  createRuntimeOpen,
  createRuntimeUp,
  executeGit,
  removeStaleSocket,
  run,
} from "./program.js";
import type { UpRequest } from "./up.js";
import type { GitExec } from "./worktree.js";

function createOpenStub(result: OpenResult = { path: "/repo/src/app.ts", line: 42 }) {
  return mock<(request: OpenRequest) => Promise<OpenResult>>().mockResolvedValue(result);
}

test("normalizes supported up worktree forms", async () => {
  const cases: { argv: string[]; request: UpRequest }[] = [
    { argv: ["up", "dev"], request: { name: "dev" } },
    { argv: ["up", "dev", "-w"], request: { name: "dev", worktree: true } },
    { argv: ["up", "dev", "--worktree"], request: { name: "dev", worktree: true } },
    { argv: ["up", "dev", "--worktree=feature"], request: { name: "dev", worktree: "feature" } },
    { argv: ["up", "dev", "--worktree", "feature"], request: { name: "dev", worktree: "feature" } },
    { argv: ["up", "dev", "-wfeature"], request: { name: "dev", worktree: "feature" } },
    { argv: ["up", "dev", "-w", "feature"], request: { name: "dev", worktree: "feature" } },
    { argv: ["up", "dev", "-b", "feature/api"], request: { name: "dev", branch: "feature/api" } },
    {
      argv: ["up", "dev", "-w", "-b", "feature/api"],
      request: { name: "dev", worktree: true, branch: "feature/api" },
    },
    {
      argv: ["up", "dev", "--worktree=legacy", "--branch=feature/api"],
      request: { name: "dev", worktree: "legacy", branch: "feature/api" },
    },
  ];

  for (const { argv, request } of cases) {
    const up = mock<(request: UpRequest) => Promise<void>>().mockResolvedValue();
    const writeError = mock<(message: string) => void>();
    const writeOutput = mock<(message: string) => void>();
    const program = createProgram({ up, open: createOpenStub(), writeError, writeOutput });

    await program.parseAsync(argv, { from: "user" });

    expect(up).toHaveBeenCalledTimes(1);
    expect(up).toHaveBeenCalledWith(request);
    expect(writeError).not.toHaveBeenCalled();
  }
});

test("prints root and up help to injected stdout", async () => {
  const cases = [
    { argv: ["--help"], expected: ["Usage: termwire", "up [options] <name>"] },
    {
      argv: ["up", "--help"],
      expected: [
        "Usage: termwire up [options] <name>",
        "-w, --worktree [wt-name]",
        "-b, --branch <name>",
        "Branch and worktree selection:",
        "Without -w, --branch switches the current checkout",
        "With -w, the optional worktree name selects the directory",
        "Slashes are preserved in Git branch names",
        "Existing sessions attach without Git changes",
      ],
    },
  ];

  for (const { argv, expected } of cases) {
    const up = mock<(request: UpRequest) => Promise<void>>().mockResolvedValue();
    const writeError = mock<(message: string) => void>();
    const writeOutput = mock<(message: string) => void>();

    expect(await run(argv, { up, writeError, writeOutput })).toBe(0);

    const output = writeOutput.mock.calls.flat().join("");
    for (const value of expected) {
      expect(output).toContain(value);
    }
    expect(up).not.toHaveBeenCalled();
    expect(writeError).not.toHaveBeenCalled();
  }
});

test("reports missing names and invalid options as usage errors", async () => {
  const cases = [["up"], ["up", "dev", "--unknown"], ["up", "dev", "--branch"]];

  for (const argv of cases) {
    const up = mock<(request: UpRequest) => Promise<void>>().mockResolvedValue();
    const writeError = mock<(message: string) => void>();
    const writeOutput = mock<(message: string) => void>();

    expect(await run(argv, { up, writeError, writeOutput })).not.toBe(0);

    const error = writeError.mock.calls.flat().join("");
    expect(error).toContain("error:");
    expect(error).toContain("Usage:");
    expect(up).not.toHaveBeenCalled();
  }
});

test("presents up failures without a stack trace", async () => {
  const up = mock<(request: UpRequest) => Promise<void>>().mockRejectedValue(
    new Error("worktree requires a Git repository"),
  );
  const writeError = mock<(message: string) => void>();
  const writeOutput = mock<(message: string) => void>();

  expect(await run(["up", "dev", "-w"], { up, writeError, writeOutput })).toBe(1);

  expect(writeError).toHaveBeenCalledTimes(1);
  expect(writeError).toHaveBeenCalledWith("termwire: worktree requires a Git repository\n");
});

test("does not read config files when attaching an existing runtime session", async () => {
  const hasSession = mock<(session: string) => Promise<boolean>>().mockResolvedValue(true);
  const attach = mock<(session: string) => Promise<void>>().mockResolvedValue();
  const pathExists = mock<(path: string) => Promise<boolean>>().mockResolvedValue(true);
  const readFile =
    mock<(path: string, encoding: "utf8") => Promise<string>>().mockResolvedValue(
      '{ "version": 1 }',
    );
  const runtimeUp = createRuntimeUp({
    createTmux: () => ({ hasSession, attach }) as unknown as ReturnType<typeof createTmuxAdapter>,
    cwd: () => "/repo",
    env: { XDG_CONFIG_HOME: "/xdg" },
    homedir: () => "/home/max",
    readFile,
    pathExists,
    gitExec: mock<GitExec>().mockResolvedValue({ exitCode: 0, stdout: "/repo\n", stderr: "" }),
  });

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
  } as unknown as ReturnType<typeof createTmuxAdapter>;
  const readFile = mock<(path: string, encoding: "utf8") => Promise<string>>().mockResolvedValue(
    '// config\n{ "version": 1, }',
  );
  const runtimeUp = createRuntimeUp({
    createTmux: () => tmux,
    cwd: () => "/repo",
    env: { XDG_CONFIG_HOME: "/xdg" },
    homedir: () => "/home/max",
    readFile,
    gitExec: mock<GitExec>().mockResolvedValue({ exitCode: 0, stdout: "/repo\n", stderr: "" }),
    mkdir:
      mock<(path: string, options: { recursive: true }) => Promise<unknown>>().mockResolvedValue(
        undefined,
      ),
    pathExists: mock<(path: string) => Promise<boolean>>().mockResolvedValue(true),
    unlink: mock<(path: string) => Promise<void>>().mockResolvedValue(),
  });

  await runtimeUp({ name: "dev" });

  expect(readFile.mock.calls).toEqual([
    ["/xdg/termwire/config.jsonc", "utf8"],
    ["/repo/.termwire.jsonc", "utf8"],
  ]);
});

test("wires runtime requests through Git discovery and existing-session attach", async () => {
  const hasSession = mock<(session: string) => Promise<boolean>>().mockResolvedValue(true);
  const attach = mock<(session: string) => Promise<void>>().mockResolvedValue();
  const tmux = { hasSession, attach } as unknown as ReturnType<typeof createTmuxAdapter>;
  const createTmux = mock<() => typeof tmux>().mockReturnValue(tmux);
  const gitExec = mock<GitExec>().mockResolvedValue({
    exitCode: 0,
    stdout: "/repo\n",
    stderr: "",
  });
  const cwd = mock<() => string>().mockReturnValue("/repo");
  const mkdir =
    mock<(path: string, options: { recursive: true }) => Promise<unknown>>().mockResolvedValue(
      undefined,
    );
  const pathExists = mock<(path: string) => Promise<boolean>>().mockResolvedValue(false);
  const unlink = mock<(path: string) => Promise<void>>().mockResolvedValue();

  const runtimeUp = createRuntimeUp({ createTmux, gitExec, cwd, mkdir, pathExists, unlink });
  await runtimeUp({ name: "dev", worktree: "feature" });

  expect(createTmux).toHaveBeenCalledTimes(1);
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
  } as unknown as ReturnType<typeof createTmuxAdapter>;
  const gitExec = mock<GitExec>().mockImplementation(async (argv) => {
    if (argv.join(" ") === "git rev-parse --show-toplevel") {
      return { exitCode: 0, stdout: "/repo\n", stderr: "" };
    }
    if (argv.join(" ") === "git show-ref --verify --quiet refs/heads/feature/api") {
      return { exitCode: 1, stdout: "", stderr: "" };
    }
    return { exitCode: 0, stdout: "", stderr: "" };
  });

  const runtimeUp = createRuntimeUp({
    createTmux: () => tmux,
    gitExec,
    cwd: () => "/repo",
    mkdir:
      mock<(path: string, options: { recursive: true }) => Promise<unknown>>().mockResolvedValue(
        undefined,
      ),
    pathExists: mock<(path: string) => Promise<boolean>>().mockResolvedValue(false),
    unlink: mock<(path: string) => Promise<void>>().mockResolvedValue(),
  });

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

  expect(await run(["up", "dev", "--worktree="], { up, writeError, writeOutput })).toBe(1);

  expect(writeError).toHaveBeenCalledWith("termwire: worktree name must not be empty\n");
  expect(up).not.toHaveBeenCalled();
});

test("rejects an explicitly empty branch option before calling up", async () => {
  const up = mock<(request: UpRequest) => Promise<void>>().mockResolvedValue();
  const writeError = mock<(message: string) => void>();
  const writeOutput = mock<(message: string) => void>();

  expect(await run(["up", "dev", "--branch="], { up, writeError, writeOutput })).toBe(1);

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

test("normalizes supported open target forms", async () => {
  const cases: { argv: string[]; request: OpenRequest }[] = [
    { argv: ["open", "src/app.ts"], request: { target: "src/app.ts" } },
    { argv: ["open", "src/app.ts:42"], request: { target: "src/app.ts:42" } },
    { argv: ["open", "src/app.ts", "-l", "42"], request: { target: "src/app.ts", line: "42" } },
    {
      argv: ["open", "src/app.ts", "--line", "42"],
      request: { target: "src/app.ts", line: "42" },
    },
    { argv: ["open", "src/app.ts", "--line=42"], request: { target: "src/app.ts", line: "42" } },
  ];

  for (const { argv, request } of cases) {
    const open = createOpenStub();
    const writeError = mock<(message: string) => void>();
    const writeOutput = mock<(message: string) => void>();

    expect(await run(argv, { open, writeError, writeOutput })).toBe(0);

    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(request);
    expect(writeError).not.toHaveBeenCalled();
  }
});

test("reports the opened path and line on stdout", async () => {
  const cases: { result: OpenResult; expected: string }[] = [
    {
      result: { path: "/repo/src/app.ts", line: 42 },
      expected: "Opened /repo/src/app.ts at line 42\n",
    },
    { result: { path: "/repo/README.md" }, expected: "Opened /repo/README.md\n" },
  ];

  for (const { result, expected } of cases) {
    const writeOutput = mock<(message: string) => void>();

    expect(
      await run(["open", "src/app.ts"], {
        open: createOpenStub(result),
        writeError: mock<(message: string) => void>(),
        writeOutput,
      }),
    ).toBe(0);

    expect(writeOutput).toHaveBeenCalledWith(expected);
  }
});

test("prints open help to injected stdout", async () => {
  const writeOutput = mock<(message: string) => void>();
  const open = createOpenStub();

  expect(
    await run(["open", "--help"], {
      open,
      writeError: mock<(message: string) => void>(),
      writeOutput,
    }),
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
    await run(["open", "src/app.ts"], {
      open,
      writeError,
      writeOutput: mock<(message: string) => void>(),
    }),
  ).toBe(1);

  expect(writeError).toHaveBeenCalledWith("termwire: not inside a termwire workspace\n");
});

test("wires runtime open through the injected adapters and environment", async () => {
  const isRunning = mock<(socket: string) => Promise<boolean>>().mockResolvedValue(true);
  const openFile =
    mock<(socket: string, path: string, line?: number) => Promise<void>>().mockResolvedValue();
  const selectWindow = mock<(target: string) => Promise<void>>().mockResolvedValue();
  const selectPane = mock<(pane: string) => Promise<void>>().mockResolvedValue();

  const runtimeOpen = createRuntimeOpen({
    createNvim: () => ({ isRunning, openFile }) as unknown as ReturnType<typeof createNvimAdapter>,
    createTmux: () =>
      ({ selectWindow, selectPane }) as unknown as ReturnType<typeof createTmuxAdapter>,
    cwd: () => "/repo",
    env: { TERMWIRE_SOCKET: "/tmp/termwire/repo-dev.sock", TERMWIRE_EDITOR_PANE: "%3" },
  });

  expect(await runtimeOpen({ target: "src/app.ts:42" })).toEqual({
    path: "/repo/src/app.ts",
    line: 42,
  });

  expect(isRunning).toHaveBeenCalledWith("/tmp/termwire/repo-dev.sock");
  expect(openFile).toHaveBeenCalledWith("/tmp/termwire/repo-dev.sock", "/repo/src/app.ts", 42);
  expect(selectWindow).toHaveBeenCalledWith("%3");
  expect(selectPane).toHaveBeenCalledWith("%3");
});

import { expect, mock, spyOn, test } from "bun:test";
import type { createTmux as createTmuxAdapter } from "@termwire/tmux";
import { createProgram, createRuntimeUp, executeGit, removeStaleSocket, run } from "./program";
import type { UpRequest } from "./up";
import type { GitExec } from "./worktree";

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
    const program = createProgram({ up, writeError, writeOutput });

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

test("wraps a Bun spawn failure with Git execution context", async () => {
  const cause = new Error("spawn unavailable");
  const spawn = spyOn(Bun, "spawn").mockImplementation(() => {
    throw cause;
  });

  try {
    await expect(executeGit(["git", "status"], { cwd: "/repo" })).rejects.toMatchObject({
      message: "git execution failed: git status",
      cause,
    });
  } finally {
    spawn.mockRestore();
  }
});

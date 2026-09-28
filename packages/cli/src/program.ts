import { spawn } from "node:child_process";
import {
  mkdir as mkdirDirectory,
  readFile as readFileFromDisk,
  stat,
  unlink as unlinkFile,
} from "node:fs/promises";
import { homedir as getHomeDirectory } from "node:os";
import { createNvim } from "@termwire/nvim";
import { createTmux } from "@termwire/tmux";
import { Command, CommanderError } from "commander";
import { prepareBranch } from "./branch.js";
import { createConfigLoader } from "./config-loader.js";
import { resolveLayout } from "./config-validation.js";
import { createLayout } from "./layout.js";
import { type OpenRequest, type OpenResult, open } from "./open.js";
import { type UpRequest, up } from "./up.js";
import { findGitRoot, type GitExec, prepareWorktree } from "./worktree.js";

export interface ProgramDependencies {
  up: (request: UpRequest) => Promise<void>;
  open: (request: OpenRequest) => Promise<OpenResult>;
  writeError: (message: string) => void;
  writeOutput: (message: string) => void;
}

export interface RuntimeDependencies {
  createTmux: () => ReturnType<typeof createTmux>;
  cwd: () => string;
  env: Record<string, string | undefined>;
  homedir: () => string;
  readFile: (path: string, encoding: "utf8") => Promise<string>;
  gitExec: GitExec;
  mkdir: (path: string, options: { recursive: true }) => Promise<unknown>;
  pathExists: (path: string) => Promise<boolean>;
  unlink: (path: string) => Promise<void>;
}

export interface RuntimeOpenDependencies {
  createNvim: () => ReturnType<typeof createNvim>;
  createTmux: () => ReturnType<typeof createTmux>;
  cwd: () => string;
  env: Record<string, string | undefined>;
}

export const executeGit: GitExec = async (argv, options) => {
  const [command, ...args] = argv;

  if (command === undefined) {
    throw new Error("git execution failed: empty command");
  }

  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options?.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.once("error", (cause) => {
      reject(new Error(`git execution failed: ${argv.join(" ")}`, { cause }));
    });
    child.once("close", (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });
};

export async function removeStaleSocket(
  path: string,
  unlink: (path: string) => Promise<void>,
): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

export function createRuntimeUp(dependencies: Partial<RuntimeDependencies> = {}) {
  const tmux = (dependencies.createTmux ?? (() => createTmux()))();
  const cwd = dependencies.cwd ?? (() => process.cwd());
  const env = dependencies.env ?? process.env;
  const homedir = dependencies.homedir ?? getHomeDirectory;
  const readFile =
    dependencies.readFile ?? ((path: string, encoding: "utf8") => readFileFromDisk(path, encoding));
  const gitExec = dependencies.gitExec ?? executeGit;
  const mkdir = dependencies.mkdir ?? mkdirDirectory;
  const pathExists =
    dependencies.pathExists ??
    (async (path: string) => {
      try {
        await stat(path);
        return true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
        throw error;
      }
    });
  const unlink = dependencies.unlink ?? unlinkFile;
  const loader = createConfigLoader({ env, homedir, exists: pathExists, readFile });
  const loadGlobalConfig = loader.loadGlobal;
  const loadProjectConfig = loader.loadProject;

  return (request: UpRequest) =>
    up(request, {
      cwd,
      findGitRoot: (directory) => findGitRoot(gitExec, directory),
      prepareBranch: ({ cwd: directory, name }) => prepareBranch(gitExec, directory, name),
      prepareWorktree: (options) => prepareWorktree({ ...options, exec: gitExec, pathExists }),
      mkdir: async (path) => {
        await mkdir(path, { recursive: true });
      },
      removeFile: (path) => removeStaleSocket(path, unlink),
      tmux,
      loadGlobalConfig,
      loadProjectConfig,
      resolveLayout,
      createLayout,
    });
}

export function createRuntimeOpen(dependencies: Partial<RuntimeOpenDependencies> = {}) {
  const nvim = (dependencies.createNvim ?? (() => createNvim()))();
  const tmux = (dependencies.createTmux ?? (() => createTmux()))();
  const cwd = dependencies.cwd ?? (() => process.cwd());
  const env = dependencies.env ?? process.env;

  return (request: OpenRequest) => open(request, { cwd, env, nvim, tmux });
}

export function createProgram(dependencies: ProgramDependencies): Command {
  const program = new Command().name("termwire").configureOutput({
    writeErr: dependencies.writeError,
    writeOut: dependencies.writeOutput,
  });
  program.exitOverride();
  program.showHelpAfterError();

  program
    .command("up <name>")
    .description("create or attach to the workspace tmux session <project>-<name>")
    .option("-w, --worktree [wt-name]", "create or reuse a Git worktree")
    .option("-b, --branch <name>", "select the exact Git branch")
    .addHelpText(
      "after",
      `
Branch and worktree selection:
  Without -w, --branch switches the current checkout, creating the branch when absent.
  With -w, the optional worktree name selects the directory; otherwise <name> is used.
  --branch selects the branch; otherwise the worktree directory key is also the branch.
  Slashes are preserved in Git branch names and sanitized only in worktree directory names.
  Existing sessions attach without Git changes.
`,
    )
    .action(async (name: string, options: { worktree?: true | string; branch?: string }) => {
      if (options.worktree === "") {
        throw new Error("worktree name must not be empty");
      }
      if (options.branch === "") {
        throw new Error("branch name must not be empty");
      }
      await dependencies.up({
        name,
        ...(options.worktree === undefined ? {} : { worktree: options.worktree }),
        ...(options.branch === undefined ? {} : { branch: options.branch }),
      });
    });

  program
    .command("open <target>")
    .description("open a file in this workspace's editor and focus it")
    .option("-l, --line <number>", "line to jump to, instead of a path:line suffix")
    .addHelpText(
      "after",
      `
Target syntax:
  A trailing :<line> selects the line, so src/app.ts:42 opens line 42.
  With --line, the target is used verbatim, which keeps a literal colon in a name.
  Relative paths resolve from the current directory.
  Requires a shell created by termwire up, which exports TERMWIRE_SOCKET.
`,
    )
    .action(async (target: string, options: { line?: string }) => {
      const result = await dependencies.open({
        target,
        ...(options.line === undefined ? {} : { line: options.line }),
      });
      const suffix = result.line === undefined ? "" : ` at line ${result.line}`;
      dependencies.writeOutput(`Opened ${result.path}${suffix}\n`);
    });

  return program;
}

export async function run(
  argv: readonly string[],
  dependencies: Partial<ProgramDependencies> = {},
): Promise<number> {
  const writeError =
    dependencies.writeError ?? ((message: string) => process.stderr.write(message));
  const program = createProgram({
    up: dependencies.up ?? createRuntimeUp(),
    open: dependencies.open ?? createRuntimeOpen(),
    writeError,
    writeOutput: dependencies.writeOutput ?? ((message: string) => process.stdout.write(message)),
  });
  try {
    await program.parseAsync(argv, { from: "user" });
    return 0;
  } catch (error) {
    if (error instanceof CommanderError) {
      return error.exitCode;
    }
    const message = error instanceof Error ? error.message : String(error);
    writeError(`termwire: ${message}\n`);
    return 1;
  }
}

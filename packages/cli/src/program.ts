import { mkdir as mkdirDirectory, stat, unlink as unlinkFile } from "node:fs/promises";
import { createTmux } from "@termwire/tmux";
import { Command, CommanderError } from "commander";
import { type UpRequest, up } from "./up";
import { findGitRoot, type GitExec, prepareWorktree } from "./worktree";

export interface ProgramDependencies {
  up: (request: UpRequest) => Promise<void>;
  writeError: (message: string) => void;
  writeOutput: (message: string) => void;
}

export interface RuntimeDependencies {
  createTmux: () => ReturnType<typeof createTmux>;
  cwd: () => string;
  gitExec: GitExec;
  mkdir: (path: string, options: { recursive: true }) => Promise<unknown>;
  pathExists: (path: string) => Promise<boolean>;
  unlink: (path: string) => Promise<void>;
}

export const executeGit: GitExec = async (argv, options) => {
  const spawn = () => Bun.spawn([...argv], { cwd: options?.cwd, stdout: "pipe", stderr: "pipe" });
  let child: ReturnType<typeof spawn>;
  try {
    child = spawn();
  } catch (error) {
    throw new Error(`git execution failed: ${argv.join(" ")}`, { cause: error });
  }
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { exitCode, stdout, stderr };
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

  return (request: UpRequest) =>
    up(request, {
      cwd,
      findGitRoot: (directory) => findGitRoot(gitExec, directory),
      prepareWorktree: (options) => prepareWorktree({ ...options, exec: gitExec, pathExists }),
      mkdir: async (path) => {
        await mkdir(path, { recursive: true });
      },
      removeFile: (path) => removeStaleSocket(path, unlink),
      tmux,
    });
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
    .option("-w, --worktree [wt-name]", "create or reuse a Git worktree")
    .action(async (name: string, options: { worktree?: true | string }) => {
      if (options.worktree === "") {
        throw new Error("worktree name must not be empty");
      }
      await dependencies.up({
        name,
        ...(options.worktree === undefined ? {} : { worktree: options.worktree }),
      });
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

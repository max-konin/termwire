import { spawn } from "node:child_process";
import {
  appendFile as appendFileToDisk,
  mkdir as mkdirDirectory,
  readdir as readDirectory,
  readFile as readFileFromDisk,
  stat,
  unlink as unlinkFile,
} from "node:fs/promises";
import { homedir as getHomeDirectory } from "node:os";
import { dirname, resolve as resolvePath } from "node:path";
import { createNvim } from "@termwire/nvim";
import { createTmux } from "@termwire/tmux";
import { Command, CommanderError } from "commander";
import { prepareBranch } from "./branch.js";
import { createConfigLoader } from "./config-loader.js";
import { resolveLayout } from "./config-validation.js";
import { type Exec, spawnCapture } from "./exec.js";
import { createLayout } from "./layout.js";
import { type OpenRequest, type OpenResult, open } from "./open.js";
import { createProcessScanner } from "./process-scan.js";
import {
  formatReapFailure,
  formatReapReport,
  type KillOutcome,
  parseTmuxServerPid,
  type ReapSignal,
  reapLogPath,
  reapSession,
} from "./reap.js";
import { ensureReapHook, reapCommandName } from "./reap-hook.js";
import { type UpRequest, up } from "./up.js";
import { findGitRoot, type GitExec, prepareWorktree } from "./worktree.js";

export interface ProgramDependencies {
  up: (request: UpRequest) => Promise<void>;
  open: (request: OpenRequest) => Promise<OpenResult>;
  reap: (session: string) => Promise<void>;
  writeError: (message: string) => void;
  writeOutput: (message: string) => void;
}

export interface RuntimeDependencies {
  createTmux: () => ReturnType<typeof createTmux>;
  cwd: () => string;
  env: Record<string, string | undefined>;
  homedir: () => string;
  execPath: string;
  scriptPath: string | undefined;
  warn: (message: string) => void;
  readFile: (path: string, encoding: "utf8") => Promise<string>;
  gitExec: GitExec;
  mkdir: (path: string, options: { recursive: true }) => Promise<unknown>;
  pathExists: (path: string) => Promise<boolean>;
  unlink: (path: string) => Promise<void>;
}

export interface RuntimeReapDependencies {
  env: Record<string, string | undefined>;
  homedir: () => string;
  platform: string;
  uid: number;
  pid: number;
  exec: Exec;
  readdir: (path: string) => Promise<string[]>;
  readFile: (path: string) => Promise<string>;
  kill: (pid: number, signal: ReapSignal) => KillOutcome;
  wait: (milliseconds: number) => Promise<void>;
  appendFile: (path: string, contents: string) => Promise<void>;
  mkdir: (path: string, options: { recursive: true }) => Promise<unknown>;
  now: () => Date;
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
  const execPath = dependencies.execPath ?? process.execPath;
  const scriptPath = "scriptPath" in dependencies ? dependencies.scriptPath : process.argv[1];
  const warn = dependencies.warn ?? ((message: string) => process.stderr.write(message));
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
      installReapHook: () => installReapHook({ tmux, execPath, scriptPath, warn }),
      loadGlobalConfig,
      loadProjectConfig,
      resolveLayout,
      createLayout,
    });
}

/**
 * Installing the cleanup hook is best effort: a workspace is still usable when the
 * tmux server refuses the hook, so `up` only warns.
 */
async function installReapHook(options: {
  tmux: ReturnType<typeof createTmux>;
  execPath: string;
  scriptPath: string | undefined;
  warn: (message: string) => void;
}): Promise<void> {
  try {
    if (options.scriptPath === undefined) {
      throw new Error("the termwire script path is unknown");
    }
    await ensureReapHook({
      tmux: options.tmux,
      execPath: options.execPath,
      scriptPath: resolvePath(options.scriptPath),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    options.warn(`termwire: session cleanup hook not installed: ${message}\n`);
  }
}

export function killProcess(pid: number, signal: ReapSignal): KillOutcome {
  try {
    process.kill(pid, signal);
    return "signalled";
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ESRCH") return "gone";
    if (code === "EPERM") return "denied";
    throw error;
  }
}

export function createRuntimeReap(dependencies: Partial<RuntimeReapDependencies> = {}) {
  const env = dependencies.env ?? process.env;
  const homedir = dependencies.homedir ?? getHomeDirectory;
  const platform = dependencies.platform ?? process.platform;
  const uid = dependencies.uid ?? process.getuid?.() ?? 0;
  const pid = dependencies.pid ?? process.pid;
  const exec = dependencies.exec ?? spawnCapture;
  const readdir = dependencies.readdir ?? ((path: string) => readDirectory(path));
  const readFile = dependencies.readFile ?? ((path: string) => readFileFromDisk(path, "utf8"));
  const kill = dependencies.kill ?? killProcess;
  const wait =
    dependencies.wait ??
    ((milliseconds: number) =>
      new Promise<void>((resolveWait) => {
        setTimeout(resolveWait, milliseconds);
      }));
  const appendFile =
    dependencies.appendFile ??
    ((path: string, contents: string) => appendFileToDisk(path, contents));
  const mkdir = dependencies.mkdir ?? mkdirDirectory;
  const now = dependencies.now ?? (() => new Date());

  const record = async (line: string) => {
    const path = reapLogPath({ env, homedir });
    try {
      await mkdir(dirname(path), { recursive: true });
      await appendFile(path, line);
    } catch {
      // A missing log must not hide the reap itself.
    }
  };

  return async (session: string) => {
    try {
      const serverPid = parseTmuxServerPid(env.TMUX);
      const report = await reapSession(session, {
        scan: createProcessScanner({ platform, exec, uid, readdir, readFile }),
        kill,
        wait,
        selfPid: pid,
        // The reap inherits the tmux server's environment, TMUX included, which is
        // the only way back to the server it must not kill.
        ...(serverPid === undefined ? {} : { serverPid }),
      });
      await record(formatReapReport(report, now().toISOString()));
    } catch (error) {
      await record(formatReapFailure(session, error, now().toISOString()));
      throw error;
    }
  };
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

  // Part of the `up` lifecycle, not a user-facing command: the global tmux
  // `session-closed` hook installed by `up` invokes it with the closed session.
  program
    .command(`${reapCommandName} <session>`, { hidden: true })
    .description("kill the processes a closed workspace session left behind")
    .action(async (session: string) => {
      await dependencies.reap(session);
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
    reap: dependencies.reap ?? createRuntimeReap(),
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

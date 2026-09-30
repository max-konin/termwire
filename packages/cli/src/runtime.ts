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
import { createNvim } from "@termwire/nvim";
import { createTmux } from "@termwire/tmux";
import { type Exec, spawnCapture } from "./exec.js";
import type { KillOutcome, ReapSignal } from "./reap.js";
import type { GitExec } from "./worktree.js";

export interface RuntimeFileSystem {
  readFile: (path: string) => Promise<string>;
  readdir: (path: string) => Promise<string[]>;
  exists: (path: string) => Promise<boolean>;
  mkdir: (path: string) => Promise<void>;
  appendFile: (path: string, contents: string) => Promise<void>;
  unlink: (path: string) => Promise<void>;
}

export interface RuntimeHost {
  env: Record<string, string | undefined>;
  cwd: () => string;
  homedir: () => string;
  platform: string;
  uid: number;
  pid: number;
  execPath: string;
  /** The launched script, which the tmux hook has to name by absolute path. */
  scriptPath: string | undefined;
  now: () => Date;
  kill: (pid: number, signal: ReapSignal) => KillOutcome;
  wait: (milliseconds: number) => Promise<void>;
  writeOutput: (message: string) => void;
  writeError: (message: string) => void;
}

/**
 * Everything the CLI needs from the outside world. Commands receive it whole and
 * never reach for `node:*` or `process` themselves, so a test builds a runtime of
 * fakes instead of overriding a dozen separate default arguments.
 *
 * The adapters carry their own copy of the environment, so a composed runtime should
 * build them from the same `host.env` it passes here — `createAdapters` does that.
 * Otherwise `attach` reads one environment to decide between `attach-session` and
 * `switch-client` while the reap reads another to find the tmux server.
 */
export interface CliRuntime {
  fs: RuntimeFileSystem;
  host: RuntimeHost;
  /** Used for anything without an adapter, currently the process scanner. */
  exec: Exec;
  git: GitExec;
  tmux: ReturnType<typeof createTmux>;
  nvim: ReturnType<typeof createNvim>;
}

/**
 * Binds both adapters to one exec and one environment. The exec has to forward
 * `ExecOptions`: `attach` asks for an inherited terminal, and tmux refuses to attach
 * without one.
 */
export function createAdapters({
  exec,
  env,
}: {
  exec: Exec;
  env: Record<string, string | undefined>;
}): Pick<CliRuntime, "tmux" | "nvim"> {
  return { tmux: createTmux({ exec, env }), nvim: createNvim({ exec }) };
}

/** The one place where the real world is bound. Nothing else imports `node:*`. */
export function createNodeRuntime(): CliRuntime {
  const env = process.env;

  return {
    fs: {
      readFile: (path) => readFileFromDisk(path, "utf8"),
      readdir: readDirectory,
      exists: fileExists,
      mkdir: async (path) => {
        await mkdirDirectory(path, { recursive: true });
      },
      appendFile: appendFileToDisk,
      unlink: unlinkFile,
    },
    host: {
      env,
      cwd: () => process.cwd(),
      homedir: getHomeDirectory,
      platform: process.platform,
      uid: process.getuid?.() ?? 0,
      pid: process.pid,
      execPath: process.execPath,
      scriptPath: process.argv[1],
      now: () => new Date(),
      kill: killProcess,
      wait: waitFor,
      writeOutput: (message) => process.stdout.write(message),
      writeError: (message) => process.stderr.write(message),
    },
    exec: spawnCapture,
    git: executeGit,
    ...createAdapters({ exec: spawnCapture, env }),
  };
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
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

function waitFor(milliseconds: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
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

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  appendFile as appendFileToDisk,
  mkdir as mkdirDirectory,
  readdir as readDirectory,
  readFile as readFileFromDisk,
  rename as renameFile,
  stat,
  unlink as unlinkFile,
  writeFile as writeFileToDisk,
} from "node:fs/promises";
import { homedir as getHomeDirectory } from "node:os";
import { createNvim } from "@termwire/nvim";
import { createTmux } from "@termwire/tmux";
import { type Exec, spawnCapture } from "./exec.js";
import type { InstallPrompter } from "./install.js";
import type { SessionScanner } from "./process-scan.js";
import { createDarwinScanner } from "./process-scan-darwin.js";
import { createLinuxScanner } from "./process-scan-linux.js";
import type { KillOutcome, ReapSignal } from "./reap.js";
import type { GitExec } from "./worktree.js";

export interface RuntimeFileSystem {
  readFile: (path: string) => Promise<string>;
  exists: (path: string) => Promise<boolean>;
  mkdir: (path: string) => Promise<void>;
  /** `flag: "wx"` fails on an existing file instead of replacing it. */
  writeFile: (path: string, contents: string, options?: { flag: "wx" }) => Promise<void>;
  rename: (from: string, to: string) => Promise<void>;
  appendFile: (path: string, contents: string) => Promise<void>;
  unlink: (path: string) => Promise<void>;
}

export interface RuntimeHost {
  env: Record<string, string | undefined>;
  cwd: () => string;
  /** Leaves a directory before it is removed: a spawn from a deleted cwd fails. */
  chdir: (path: string) => void;
  homedir: () => string;
  pid: number;
  execPath: string;
  /** The launched script, which the tmux hook has to name by absolute path. */
  scriptPath: string | undefined;
  now: () => Date;
  /** A unique name for a temporary file, so two writers cannot collide. */
  randomId: () => string;
  /** Whether there is a terminal to ask questions on, both ways. */
  isTerminal: boolean;
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
  git: GitExec;
  /**
   * Built on demand, so a platform that cannot be scanned fails the command that
   * scans rather than every command, `--help` included.
   */
  createScanner: () => SessionScanner;
  tmux: ReturnType<typeof createTmux>;
  nvim: ReturnType<typeof createNvim>;
  /** Built on demand, so a command that never asks anything loads no terminal UI. */
  createPrompter: () => Promise<InstallPrompter>;
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
      exists: fileExists,
      mkdir: async (path) => {
        await mkdirDirectory(path, { recursive: true });
      },
      writeFile: (path, contents, options) =>
        writeFileToDisk(path, contents, options ? { flag: options.flag } : undefined),
      rename: renameFile,
      appendFile: appendFileToDisk,
      unlink: unlinkFile,
    },
    host: {
      env,
      cwd: () => process.cwd(),
      chdir: (path) => process.chdir(path),
      homedir: getHomeDirectory,
      pid: process.pid,
      execPath: process.execPath,
      scriptPath: process.argv[1],
      now: () => new Date(),
      randomId: randomUUID,
      isTerminal: process.stdin.isTTY === true && process.stdout.isTTY === true,
      kill: killProcess,
      wait: waitFor,
      writeOutput: (message) => process.stdout.write(message),
      writeError: (message) => process.stderr.write(message),
    },
    git: executeGit,
    createScanner: () => createPlatformScanner(process.platform),
    ...createAdapters({ exec: spawnCapture, env }),
    // Imported here and not at the top, so `up` and `open` never load the prompts.
    createPrompter: async () =>
      (await import("./install-prompt.js")).createClackPrompter({
        columns: process.stdout.columns ?? 80,
      }),
  };
}

/**
 * The one place that knows which platforms can be scanned. A platform module takes
 * only its own dependencies, which a registry keyed by platform could not express:
 * every entry would have to accept the union of what all of them need. So a new
 * platform is a new module plus a branch here.
 */
export function createPlatformScanner(platform: string): SessionScanner {
  if (platform === "darwin") {
    return createDarwinScanner({ exec: spawnCapture, uid: process.getuid?.() ?? 0 });
  }
  if (platform === "linux") {
    return createLinuxScanner({
      readdir: readDirectory,
      readFile: (path) => readFileFromDisk(path, "utf8"),
    });
  }
  throw new Error(`process scanning is not supported on ${platform}`);
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

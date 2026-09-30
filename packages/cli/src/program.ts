import { readFileSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { Command, CommanderError } from "commander";
import { prepareBranch } from "./branch.js";
import { createConfigLoader } from "./config-loader.js";
import { resolveLayout } from "./config-validation.js";
import { createLayout } from "./layout.js";
import { type OpenRequest, type OpenResult, open } from "./open.js";
import { createProcessScanner } from "./process-scan.js";
import {
  formatReapFailure,
  formatReapReport,
  parseTmuxServerPid,
  reapLogPath,
  reapSession,
} from "./reap.js";
import { ensureReapHook, reapCommandName } from "./reap-hook.js";
import type { CliRuntime, RuntimeFileSystem } from "./runtime.js";
import { type UpRequest, up } from "./up.js";
import { findGitRoot, prepareWorktree } from "./worktree.js";

/**
 * Read at runtime rather than baked in at build time, the way `@termwire/mcp`
 * reports its own version. `dist/program.js` and `src/program.ts` both sit one
 * level below the package root, so the same specifier resolves in a published
 * install and from a checkout.
 */
const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  version: string;
};

export interface ProgramDependencies {
  up: (request: UpRequest) => Promise<void>;
  open: (request: OpenRequest) => Promise<OpenResult>;
  reap: (session: string) => Promise<void>;
  writeError: (message: string) => void;
  writeOutput: (message: string) => void;
}

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

export function createUp({
  fs,
  host,
  git,
  tmux,
}: CliRuntime): (request: UpRequest) => Promise<void> {
  const loader = createConfigLoader({
    env: host.env,
    homedir: host.homedir,
    exists: fs.exists,
    readFile: (path) => fs.readFile(path),
  });

  return (request) =>
    up(request, {
      cwd: host.cwd,
      findGitRoot: (directory) => findGitRoot(git, directory),
      prepareBranch: ({ cwd: directory, name }) => prepareBranch(git, directory, name),
      prepareWorktree: (options) =>
        prepareWorktree({ ...options, exec: git, pathExists: fs.exists }),
      mkdir: fs.mkdir,
      removeFile: (path) => removeStaleSocket(path, fs.unlink),
      tmux,
      installReapHook: () => installReapHook({ host, tmux }),
      loadGlobalConfig: loader.loadGlobal,
      loadProjectConfig: loader.loadProject,
      resolveLayout,
      createLayout,
    });
}

/**
 * Installing the cleanup hook is best effort: a workspace is still usable when the
 * tmux server refuses the hook, so `up` only warns.
 */
async function installReapHook({ host, tmux }: Pick<CliRuntime, "host" | "tmux">): Promise<void> {
  try {
    await ensureReapHook({
      tmux,
      execPath: host.execPath,
      scriptPath: resolveScriptPath(host.scriptPath),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    host.writeError(`termwire: session cleanup hook not installed: ${message}\n`);
  }
}

function resolveScriptPath(scriptPath: string | undefined): string {
  if (scriptPath === undefined) {
    throw new Error("the termwire script path is unknown");
  }
  return resolvePath(scriptPath);
}

export function createOpen({
  host,
  nvim,
  tmux,
}: CliRuntime): (request: OpenRequest) => Promise<OpenResult> {
  return (request) => open(request, { cwd: host.cwd, env: host.env, nvim, tmux });
}

export function createReap({ fs, host, exec }: CliRuntime): (session: string) => Promise<void> {
  const record = (line: string) =>
    appendQuietly(reapLogPath({ env: host.env, homedir: host.homedir }), line, fs);

  return async (session) => {
    try {
      const serverPid = parseTmuxServerPid(host.env.TMUX);
      const report = await reapSession(session, {
        scan: createProcessScanner({
          platform: host.platform,
          exec,
          uid: host.uid,
          readdir: fs.readdir,
          readFile: fs.readFile,
        }),
        kill: host.kill,
        wait: host.wait,
        selfPid: host.pid,
        // The reap inherits the tmux server's environment, TMUX included, which is
        // the only way back to the server it must not kill.
        ...(serverPid === undefined ? {} : { serverPid }),
      });
      await record(formatReapReport(report, host.now().toISOString()));
    } catch (error) {
      await record(formatReapFailure(session, error, host.now().toISOString()));
      throw error;
    }
  };
}

/** A log that cannot be written must not hide what the reap did. */
async function appendQuietly(path: string, line: string, fs: RuntimeFileSystem): Promise<void> {
  try {
    await fs.mkdir(dirname(path));
    await fs.appendFile(path, line);
  } catch {
    // Nothing left to report it to.
  }
}

/** Binds every command to one runtime. The only caller that needs the real one. */
export function createCommands(runtime: CliRuntime): ProgramDependencies {
  return {
    up: createUp(runtime),
    open: createOpen(runtime),
    reap: createReap(runtime),
    writeError: runtime.host.writeError,
    writeOutput: runtime.host.writeOutput,
  };
}

export function createProgram(dependencies: ProgramDependencies): Command {
  const program = new Command().name("termwire").configureOutput({
    writeErr: dependencies.writeError,
    writeOut: dependencies.writeOutput,
  });
  program.exitOverride();
  program.showHelpAfterError();
  program.version(manifest.version, "-V, --version", "print the installed termwire version");

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

/** The composition root's entry: one runtime in, an exit code out. */
export async function run(argv: readonly string[], runtime: CliRuntime): Promise<number> {
  if (runtime === undefined) {
    // Reachable from JavaScript, where the required parameter is only a suggestion.
    throw new Error("run needs a runtime: pass createNodeRuntime()");
  }
  return await runCommands(argv, createCommands(runtime));
}

/** Parsing and exit-code mapping, indifferent to how the commands were built. */
export async function runCommands(
  argv: readonly string[],
  commands: ProgramDependencies,
): Promise<number> {
  const program = createProgram(commands);

  try {
    await program.parseAsync(argv, { from: "user" });
    return 0;
  } catch (error) {
    if (error instanceof CommanderError) {
      return error.exitCode;
    }
    const message = error instanceof Error ? error.message : String(error);
    commands.writeError(`termwire: ${message}\n`);
    return 1;
  }
}

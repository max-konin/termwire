import { readFileSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { Command, CommanderError } from "commander";
import { agentIds, parseAgentIds } from "./agents.js";
import { prepareBranch } from "./branch.js";
import { configHome, createConfigLoader, globalConfigPath } from "./config-loader.js";
import { resolveLayout } from "./config-validation.js";
import { writeConfigFile } from "./config-writer.js";
import { type DownRequest, type DownResult, down } from "./down.js";
import { type InstallRequest, type InstallResult, install, noLayout } from "./install.js";
import { createLayout } from "./layout.js";
import { type OpenRequest, type OpenResult, open } from "./open.js";
import { toSingleSession } from "./process-scan.js";
import {
  formatReapFailure,
  formatReapReport,
  parseTmuxServerPid,
  reapLogPath,
  reapSession,
} from "./reap.js";
import { ensureReapHook, reapCommandName } from "./reap-hook.js";
import type { CliRuntime, RuntimeFileSystem } from "./runtime.js";
import { skillSourcePath } from "./skill.js";
import { layoutTemplateIds } from "./templates.js";
import { type UpRequest, up } from "./up.js";
import {
  collectWorkspaces,
  formatWorkspacesJson,
  formatWorkspaceTable,
  type Workspace,
} from "./workspaces.js";
import { findGitRoot, inspectWorktree, prepareWorktree, removeWorktree } from "./worktree.js";

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
  ls: () => Promise<Workspace[]>;
  down: (request: DownRequest) => Promise<DownResult>;
  open: (request: OpenRequest) => Promise<OpenResult>;
  reap: (session: string) => Promise<void>;
  install: (request: InstallRequest) => Promise<InstallResult>;
  /** Only the table shortens `$HOME` to `~`; the JSON rows keep absolute paths. */
  homedir: () => string;
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

export function createLs({ fs, git, tmux, createScanner }: CliRuntime): () => Promise<Workspace[]> {
  return () =>
    collectWorkspaces({
      listSessions: () => tmux.listSessions(),
      showEnvironment: (session) => tmux.showEnvironment(session),
      git,
      pathExists: fs.exists,
      // Built per run, not while the program is composed: an unsupported platform
      // has to fail `ls` alone, not every command.
      scan: createScanner(),
    });
}

export function createDown({
  host,
  git,
  tmux,
}: CliRuntime): (request: DownRequest) => Promise<DownResult> {
  return (request) =>
    down(request, {
      cwd: host.cwd,
      chdir: host.chdir,
      env: host.env,
      findGitRoot: (directory) => findGitRoot(git, directory),
      listSessions: () => tmux.listSessions(),
      killSession: (session) => tmux.killSession(session),
      inspectWorktree: (path) => inspectWorktree(git, path),
      removeWorktree: (path, options) => removeWorktree(git, path, options),
    });
}

export function createOpen({
  host,
  nvim,
  tmux,
}: CliRuntime): (request: OpenRequest) => Promise<OpenResult> {
  return (request) => open(request, { cwd: host.cwd, env: host.env, nvim, tmux });
}

export function createReap({
  fs,
  host,
  createScanner,
}: CliRuntime): (session: string) => Promise<void> {
  const record = (line: string) =>
    appendQuietly(reapLogPath({ env: host.env, homedir: host.homedir }), line, fs);

  return async (session) => {
    try {
      const serverPid = parseTmuxServerPid(host.env.TMUX);
      const report = await reapSession(session, {
        scan: toSingleSession(createScanner()),
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

export function createInstall({
  fs,
  host,
  git,
  createPrompter,
}: CliRuntime): (request: InstallRequest) => Promise<InstallResult> {
  return async (request) => {
    const prompt = host.isTerminal && request.yes !== true ? await createPrompter() : undefined;

    return await install(request, {
      cwd: host.cwd,
      findGitRoot: (directory) => findGitRoot(git, directory),
      globalConfigPath: () => globalConfigPath({ env: host.env, homedir: host.homedir }),
      agentPaths: {
        home: host.homedir(),
        configHome: configHome({ env: host.env, homedir: host.homedir }),
      },
      skillSource: skillSourcePath(),
      pathExists: fs.exists,
      readFile: fs.readFile,
      writeConfig: (options) => writeConfigFile(options, { ...fs, suffix: host.randomId }),
      write: host.writeOutput,
      isTerminal: host.isTerminal,
      ...(prompt === undefined ? {} : { prompt }),
    });
  };
}

/** Binds every command to one runtime. The only caller that needs the real one. */
export function createCommands(runtime: CliRuntime): ProgramDependencies {
  return {
    up: createUp(runtime),
    ls: createLs(runtime),
    down: createDown(runtime),
    open: createOpen(runtime),
    reap: createReap(runtime),
    install: createInstall(runtime),
    homedir: runtime.host.homedir,
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
    .command("ls")
    .description("list the termwire workspaces on this machine")
    .option("--json", "print the same rows as JSON, with absolute directories")
    .addHelpText(
      "after",
      `
Columns:
  A marks an attached session, and DIRECTORY is where it was created, $HOME as ~.
  BRANCH is the Git branch there, a short sha on a detached HEAD, - outside a repository.
  PROCS and RSS count every process still labeled with the session, pane or not.
  A workspace whose directory is gone is listed and marked, never fatal.
  A session is a workspace only when its tmux environment carries TERMWIRE_SESSION.
`,
    )
    .action(async (options: { json?: true }) => {
      const workspaces = await dependencies.ls();

      dependencies.writeOutput(
        options.json === true
          ? formatWorkspacesJson(workspaces)
          : formatWorkspaceTable(workspaces, dependencies.homedir()),
      );
    });

  program
    .command("down [name]")
    .description("kill a workspace tmux session, this one when [name] is omitted")
    .option("-w, --worktree", "also remove that workspace's Git worktree")
    .option("-f, --force", "with -w, remove a worktree that has uncommitted changes")
    .addHelpText(
      "after",
      `
Teardown:
  [name] resolves exactly as it does for up, so down names the session up created.
  Without it the target is the workspace this command runs in, from TERMWIRE_SESSION.
  That bare form is the only one that works inside a worktree, where the Git root moves.
  Closing the session kills what ran in it; the branch always outlives the workspace.
  -w also removes the worktree the session sits in, refusing the main checkout.
  A worktree with uncommitted changes, or the directory you stand in, is refused too.
  Tearing down your own workspace removes its worktree first: the kill ends this process.
`,
    )
    .action(async (name: string | undefined, options: { worktree?: true; force?: true }) => {
      const result = await dependencies.down({
        ...(name === undefined ? {} : { name }),
        ...(options.worktree === undefined ? {} : { worktree: true }),
        ...(options.force === undefined ? {} : { force: true }),
      });

      dependencies.writeOutput(`Killed session ${result.session}\n`);
      if (result.worktree !== undefined) {
        dependencies.writeOutput(`Removed worktree ${result.worktree}\n`);
      }
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

  program
    .command("install")
    .description("write a layout config and install the file-opening skill for your agents")
    .option(
      "-l, --layout <name>",
      `layout template: ${[...layoutTemplateIds, noLayout].join(", ")}`,
    )
    .option(
      "-p, --project",
      "write .termwire.jsonc in this repository instead of the global config",
    )
    .option("-a, --agents <list>", `comma-separated: ${agentIds.join(", ")}, or none`)
    .option("-f, --force", "replace an existing config, or a skill file you own")
    .option("-y, --yes", "never prompt: default layout, and no agents unless --agents")
    .addHelpText(
      "after",
      `
Run it before installing anything:
  npx @termwire/cli install

Interactive by default, and silent once the flags leave nothing to ask: --yes, or
--layout together with --agents. The skill teaches an agent to run ${"`termwire open`"}, which costs
no process, unlike the ${"`@termwire/mcp`"} server it replaces. It only ever adds its own file
to an agent's skills directory and never edits another tool's configuration.
`,
    )
    .action(
      async (options: {
        layout?: string;
        project?: true;
        agents?: string;
        force?: true;
        yes?: true;
      }) => {
        const result = await dependencies.install({
          ...(options.layout === undefined ? {} : { layout: options.layout }),
          ...(options.project === undefined ? {} : { project: true }),
          ...(options.agents === undefined ? {} : { agents: parseAgentIds(options.agents) }),
          ...(options.force === undefined ? {} : { force: true }),
          ...(options.yes === undefined ? {} : { yes: true }),
        });

        if (result.failures.length > 0) {
          throw new Error(`install finished with errors: ${result.failures.join("; ")}`);
        }
      },
    );

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

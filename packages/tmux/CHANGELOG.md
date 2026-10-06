# @termwire/tmux

## 0.6.0

### Minor Changes

- cfdcc19: `termwire ls` and `termwire down`: the workspaces you have, and a way to put one away.

  A tool that creates workspaces owes you a way to see them and a way to remove them.
  Until now tearing one down was `tmux kill-session` plus `git worktree remove`, typed
  by hand, and there was nothing at all that answered "what is running where".

  ```
  $ termwire ls
  SESSION          A  BRANCH        DIRECTORY                   PROCS   RSS
  termwire-dev     *  master        ~/projects/termwire             7  1.2G
  termwire-demo       demo          ~/projects/termwire-demo        4  780M
  ```

  One row per workspace, printed once and then done: `ls` is not a monitor. `A` marks an
  attached session, `BRANCH` is the Git branch of the session directory — a short sha on a
  detached `HEAD`, `-` outside a repository — and `PROCS` and `RSS` count the processes
  still carrying `TERMWIRE_SESSION=<session>`, from the same scan the reap uses, so a
  background agent job is counted as well as a pane. A session whose directory is gone is
  listed and marked `(missing)` rather than crashing the command, and no workspaces prints
  `no termwire workspaces` and exits 0. `--json` prints the same rows for machines, with
  absolute directories.

  A session counts as a workspace when its tmux session environment carries
  `TERMWIRE_SESSION`, never because its name looks like `<project>-<name>`: you pick the
  name and `up` sets the label, so a session of your own is never listed by its name alone.
  Nothing is read from disk — the list is derived from tmux and Git, so identity stays
  stateless and there is no file to go stale.

  ```bash
  termwire down dev              # kill the workspace session
  termwire down                  # kill the workspace this shell is in
  termwire down dev -w           # and remove the worktree it sits in
  termwire down dev -w --force   # even with uncommitted changes
  ```

  `down` resolves `[name]` exactly as `up` does, so `up dev` and `down dev` always mean one
  session, and it hunts no processes: the `session-closed` hook already reaps that session.

  Without a name the target is the workspace the command runs in, read from the inherited
  `TERMWIRE_SESSION` — the same environment-based identity `open` uses. Inside a worktree
  workspace that bare form is the only one that works, because there the Git root is the
  worktree, so `down feat` would look for `<worktree>-feat` and find nothing. Outside a
  workspace a bare `down` fails with `not inside a termwire workspace`.

  `-w` removes the worktree the session was created in, and refuses the main checkout, the
  directory the command is running in, and a worktree holding uncommitted changes unless
  `--force` is given. A refusal removes nothing at all, the session included. The branch is
  never deleted: a branch outlives its workspace. Ignored files are not uncommitted
  changes, so a worktree carrying only `.env` or `node_modules` counts as clean and is
  removed with them.

  Tearing down your _own_ workspace with `-w` inverts the order: the worktree is removed
  first and the session killed last, because the kill ends the process that would otherwise
  do the removal — and the command steps out of the worktree before removing it, since a
  spawn from a deleted working directory fails with ENOENT. The refusal to remove the
  directory it runs in does not apply there: the shell standing in it dies with the session
  a moment later.

  The tmux adapter gained `listSessions` and `showEnvironment` on `createTmux`, and the
  process scan now reports resident memory, so `ProcessEntry` carries `rss` in KiB and one
  walk over the process table answers for every workspace at once.

  Process scanning also became platform-agnostic above the seam. `process-scan.ts` keeps
  only the `SessionScanner` type and the contract a platform has to honour, while
  `process-scan-darwin.ts` and `process-scan-linux.ts` each take their own dependencies;
  `runtime.ts` picks one. Supporting another platform is a new module plus a branch there,
  and `reap` and `ls` do not change, because they depend on the type.

  Moving the scanner reshapes `CliRuntime`: it gained `createScanner`, a lazy factory so an
  unsupported platform fails the commands that scan instead of every command, and lost
  `exec`, `host.platform`, `host.uid` and `fs.readdir`, which existed only to feed it. It also
  gained `host.chdir`, and `ProgramDependencies` gained `ls`, `down` and `homedir` — so
  anything that builds a runtime or the command set by hand has to follow.

## 0.5.0

### Minor Changes

- 29af197: Package entries export their API instead of every internal, and `run` takes a runtime.

  Each `index.ts` had grown by reflex: a new module meant a new re-export. Counted against
  real imports, `@termwire/cli` exported 48 names of which exactly one was used, and
  `@termwire/mcp` exported twelve that nothing imported at all. The barrel was a promise
  nobody asked for, and it made every rename a breaking change.

  **`@termwire/cli` has one breaking change beyond the exports.** `run(argv)` is now
  `run(argv, runtime)`, and the runtime is required — the CLI no longer builds real
  filesystem and process bindings behind the caller's back. A caller does what
  `bin/termwire.ts` does:

  ```ts
  import { createNodeRuntime, run } from "@termwire/cli";

  process.exitCode = await run(process.argv.slice(2), createNodeRuntime());
  ```

  Calling `run(argv)` with nothing else now throws `run needs a runtime: pass
createNodeRuntime()`. The `termwire` binary itself is unaffected.

  The entries now carry the factories, the types naming their arguments and results, and
  the error classes a caller catches:

  - `@termwire/cli`: `run`, `createNodeRuntime`, `createAdapters`, and the `CliRuntime`,
    `RuntimeHost`, `RuntimeFileSystem`, `ProgramDependencies`, `Exec`, `ExecOptions`,
    `ExecResult`, `GitExec`, `ReapSignal` and `KillOutcome` types.
  - `@termwire/tmux` and `@termwire/nvim`: `createTmux` / `createNvim`, their option and
    result types, and `CommandError` / `ValidationError`.
  - `@termwire/mcp`: `createTermwireMcpServer`, `createOpenFileHandler`, and the types those
    two name.

  What is gone is the per-command functions the factories already expose as methods
  (`killSession`, `respawnPane`, `setEnvironment`, `setHook`, `showHooks`, `unsetHook`,
  `selectLayout`, `openFile`), plus three things that were never methods: `parseHooks`, the
  `tmuxLayouts` constant, and the MCP tool's Zod schemas. Those move to `@termwire/tmux`
  and `@termwire/mcp` internals; if you depended on one, open an issue and say what for.

## 0.4.1

## 0.4.0

### Minor Changes

- 7e73a29: Closing a workspace session now kills the processes started in it.

  `tmux kill-session` only sends `SIGHUP` to the foreground process group of each
  pane, so background agent jobs detached from the terminal survived it and were
  adopted by `init`. They accumulated for weeks, in one case 158 processes across
  nine abandoned sessions, five of whose worktrees no longer existed on disk.

  `up` now installs one global tmux `session-closed` hook that runs a hidden
  `termwire _reap <session>` subcommand. The reap collects the processes of the
  current user whose environment still carries `TERMWIRE_SESSION=<session>`, sends
  `SIGTERM`, then confirms the survivors still carry the label before escalating
  them to `SIGKILL`. It signals exactly that list of pids and never a pattern
  match, and never the tmux server or anything it descends from. Each run appends
  one line to `$XDG_STATE_HOME/termwire/reap.log`, because a tmux hook's output is
  shown nowhere.

  Installing the hook is idempotent. A repeated `up` updates our entry when the
  interpreter or script path changed, drops duplicates of ours, and leaves a
  `session-closed` hook of your own untouched. A tmux server that refuses the hook
  only produces a warning; the workspace still comes up.

  `@termwire/tmux` gains `showHooks`, `setHook`, and `unsetHook`. It keeps no
  knowledge of what the hooks are for.

## 0.3.0

### Minor Changes

- f57c480: Run on Node instead of requiring Bun. Every package now spawns through
  `node:child_process`, emits explicit `.js` extensions on relative imports, and
  ships a `#!/usr/bin/env node` entry point. `engines` declares `node >=22.12.0`,
  the floor set by Commander 15.

  The published CLI and MCP server previously failed under Node with
  `ERR_MODULE_NOT_FOUND` and had no test covering it. `bun run verify:node`
  executes both built artifacts under Node, and CI runs it on every push.

  This makes `npx -y @termwire/mcp` the recommended MCP registration. Unlike
  `bunx`, the `npx` cache lives under `~/.npm` and is not swept by the nightly
  macOS temporary-directory cleanup that silently broke the server.

  Emitted type declarations are now typed against `@types/node` alone and no
  longer reference Bun types.

  The repository is still developed with Bun. Only the published output changed.

- f57c480: Add the `termwire open <target>` command, which opens a file in the workspace
  Neovim and focuses the editor pane. A trailing `:<line>` selects a line, and
  `--line` keeps the target verbatim for filenames that end in a colon and
  digits. This gives any agent that can run a shell command the same capability
  as the MCP server and the OpenCode plugin, with nothing to configure.

  Correct the OpenCode plugin's out-of-workspace error to `not inside a termwire
workspace`, matching the CLI and the MCP server.

## 0.2.2

### Patch Changes

- f65db71: Use valid plain session targets for tmux session-title options, preventing `termwire up` from failing.

## 0.2.1

### Patch Changes

- eec1451: Termwire new sessions now set the outer terminal title from the tmux session name, and the tmux adapter exposes built-in layout selection.

## 0.2.0

### Minor Changes

- 6f485f3: Add configurable tmux window and pane layouts for new workspaces.

  Support optional global and project JSONC configuration, strict Zod validation,
  explicit editor pane selection, and deferred pane command startup with complete
  workspace environment variables.

## 0.1.2

## 0.1.1

## 0.1.0

### Minor Changes

- 5d73919: Initial public release with compiled Bun packages and npm-ready metadata.

# @termwire/cli

## 0.5.0

### Minor Changes

- 4d655c7: `termwire install` sets up a layout and teaches your agents to open files.

  Two things were documentation-only before. A layout meant copying JSONC out of the
  cookbook by hand, and only Claude Code had a documented line for letting an agent put a
  file in front of you.

  `termwire install`, reachable as `npx @termwire/cli install` before anything is installed,
  picks one of the four cookbook layouts and writes it globally or into the repository, then
  installs a `termwire-open` skill for the agents you select. It is interactive by default,
  with the window layout drawn beside the list as you move through it, and silent once the
  flags leave nothing to ask: `--yes`, or `--layout` together with `--agents`.

  The skill teaches an agent to run `termwire open <path>:<line>`, which costs no process.
  That is the point: the `@termwire/mcp` server does the same job but lives as one process
  per agent session for as long as the session does — on a machine running a dozen agents,
  a dozen idle processes. The server is still published for agents that may not run shell
  commands; `install` no longer registers it.

  Skills go where each agent reads them — `~/.claude/skills/termwire-open/SKILL.md` and
  `$XDG_CONFIG_HOME/opencode/skills/termwire-open/SKILL.md`. The file is shipped as Markdown
  in the package, so you can read exactly what your agent was told. Codex has no skills, so
  it gets the one line to add to `~/.codex/AGENTS.md` printed for you; its own files are
  never edited, and neither is any other agent's configuration.

  `CliRuntime` gained the members the command needs — `fs.writeFile`, `fs.rename`,
  `host.randomId`, `host.isTerminal` and `createPrompter` — so anything that builds a runtime
  by hand has to supply them. `fs.isExecutable` is gone with the agent-binary probe it served.

  Re-running changes nothing that is already in place. A skill this command wrote carries a
  marker line and is upgraded silently; delete the line and the file is yours, kept until
  `--force` says otherwise. An
  existing Termwire config is likewise kept unless you name a layout, and every question is
  asked before the plan is confirmed.

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

### Patch Changes

- Updated dependencies [29af197]
  - @termwire/tmux@0.5.0
  - @termwire/nvim@0.5.0

## 0.4.1

### Patch Changes

- `termwire --version` prints the installed release.

  There was no way to tell which version was installed: both `--version` and `-V`
  failed with `unknown option`, leaving `npm ls -g @termwire/cli` as the only
  answer. The number is read from the package manifest at runtime, the way
  `@termwire/mcp` already reports its own version, so no build step has to inject
  it and a checkout reports the same way an install does.

  - @termwire/tmux@0.4.1
  - @termwire/nvim@0.4.1

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

### Patch Changes

- Updated dependencies [7e73a29]
  - @termwire/tmux@0.4.0
  - @termwire/nvim@0.4.0

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

### Patch Changes

- Updated dependencies [f57c480]
- Updated dependencies [f57c480]
  - @termwire/nvim@0.3.0
  - @termwire/tmux@0.3.0

## 0.2.2

### Patch Changes

- Updated dependencies [f65db71]
  - @termwire/tmux@0.2.2
  - @termwire/nvim@0.2.2

## 0.2.1

### Patch Changes

- eec1451: Termwire new sessions now set the outer terminal title from the tmux session name, and the tmux adapter exposes built-in layout selection.
- Updated dependencies [eec1451]
  - @termwire/tmux@0.2.1
  - @termwire/nvim@0.2.1

## 0.2.0

### Minor Changes

- 6f485f3: Add configurable tmux window and pane layouts for new workspaces.

  Support optional global and project JSONC configuration, strict Zod validation,
  explicit editor pane selection, and deferred pane command startup with complete
  workspace environment variables.

### Patch Changes

- Updated dependencies [6f485f3]
  - @termwire/tmux@0.2.0
  - @termwire/nvim@0.2.0

## 0.1.2

### Patch Changes

- Add explicit Git branch selection to `termwire up`, preserve slashes in branch names, and document
  the default branch and worktree derivation rules.
  - @termwire/tmux@0.1.2
  - @termwire/nvim@0.1.2

## 0.1.1

### Patch Changes

- Correct published internal dependency ranges so external Bun installs resolve Termwire packages.
  - @termwire/tmux@0.1.1
  - @termwire/nvim@0.1.1

## 0.1.0

### Minor Changes

- 5d73919: Initial public release with compiled Bun packages and npm-ready metadata.

### Patch Changes

- Updated dependencies [5d73919]
  - @termwire/tmux@0.1.0
  - @termwire/nvim@0.1.0

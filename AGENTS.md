# AGENTS.md

## Commands

- Install with `bun install`; this is a Bun workspace repo, not npm/pnpm/yarn.
- Root checks: `bun run lint` (`biome check .`), `bun run lint:fix`, `bun run format`, and
  `bun test`.
- Run one test file with `bun test <path>`; tests use Bun's native runner.
- There is no root typecheck script. Use `bunx tsc --noEmit` for an explicit type check.
- `bun run build` compiles every package, and `bun run verify:node` runs the built CLI and MCP
  server under Node. Run both before claiming a change is finished.
- Run the CLI directly with `bun packages/cli/bin/termwire.ts`; the root README's
  `bun run index.ts` command is stale.

## Runtime

- The repository is developed with Bun, but every published package must run on **Node >=22.12**.
- Never use a `Bun.*` API in `packages/*/src`. Spawn through `node:child_process`.
- Every relative import needs an explicit `.js` extension, including in tests. Node's ESM loader
  rejects extensionless specifiers, and the build configs use `NodeNext` so `tsc` catches it.
- Published bin files use `#!/usr/bin/env node`. The `packages/*/bin/*.ts` development entries
  keep `#!/usr/bin/env bun` because Bun runs them as TypeScript.
- Tests run on `bun test` and may use Bun APIs; they are never published.
- The build configs pin `types: ["node"]`, so emitted declarations never depend on Bun types.
  The root config adds `bun` for the test files.
- TypeScript 7 does not auto-discover `@types/*`; the root config lists them in `types`
  explicitly. Adding a new type package means adding it there too.

## Package boundaries

- Workspaces live under `packages/*`.
- `@termwire/cli` owns orchestration and file opening, and may depend on the tmux and Neovim
  adapters.
- `@termwire/tmux` and `@termwire/nvim` are thin adapters; keep them unaware of OpenCode and
  workspace orchestration.
- `@termwire/opencode-plugin` owns explicit `termwire_open({ path, line? })` execution and may
  depend on the tmux and Neovim adapters; it does not invoke a CLI executable.

## Public surface

- A package's `src/index.ts` exports only what something outside that package actually imports.
  Adding a module is not a reason to re-export it; a barrel of internals is a promise nobody
  asked for, and it blocks refactoring because every rename becomes a breaking change. Before
  adding an export, name the consumer.
- `@termwire/cli` is a binary, so its entry exports `run`, `createNodeRuntime`, and `CliRuntime`
  — what `bin/termwire.ts` needs to compose the program. `@termwire/tmux` and `@termwire/nvim`
  are libraries: their entry is the `createTmux` / `createNvim` factory plus the types in its
  signature and the error classes a caller catches, never the per-command functions those
  factories already expose.
- Tests reach internals through relative module paths, never through the package entry. A test
  that needs a new export is a test importing from the wrong place.

## Current scope and gotchas

- Treat package READMEs, `PDR.md`, and `ROADMAP.md` as design intent, not implemented behavior.
- The CLI owns `up <name>` (`-w/--worktree`, `-b/--branch`) and `open <target>` (`-l/--line`).
  File opening also ships as the OpenCode plugin tool and the `@termwire/mcp` server; all three
  share the same behavior and read the same environment. `doctor`, `status`, `files`, `open-last`,
  and persistent workspace state are not implemented. Optional global/project JSONC files
  configure only the windows and panes created for a new session.
- Workspace identity is stateless and environment-based:
  `TERMWIRE_SESSION`, `TERMWIRE_SOCKET`, and `TERMWIRE_EDITOR_PANE`.
- `up` installs one global tmux `session-closed` hook that runs the hidden
  `termwire _reap <session>` subcommand, so closing a session kills every process
  still labeled with its `TERMWIRE_SESSION`. The hook must stay a foreground
  `run-shell` whose command ends in `&`: `run-shell -b` is skipped when the last
  session closes and the server shuts down. The session name must stay unquoted as
  `#{q:hook_session_name}`; the hook is global, so it fires for session names
  Termwire never sanitized, and `#{q:}` is what escapes them for `sh`. Reap logs go
  to `$XDG_STATE_HOME/termwire/reap.log`, as the tmux server's environment sees it.
- Keep adapters testable through injectable `exec`; tests must not require real tmux or Neovim
  binaries.
- `packages/cli/src/runtime.ts` is where the CLI binds the filesystem, child processes, and
  process state into one `CliRuntime`. Commands take it and destructure what they use in the
  parameter list. Production code carries no `dependencies.x ?? realThing` defaults: `run`
  receives a runtime, `bin/termwire.ts` builds the real one, and tests build a fake one through a
  single helper. `node:path` is pure string work and stays allowed anywhere; two files still reach
  past the seam and are worth folding in when touched — `worktree.ts` calls `realpath` and
  `program.ts` reads its own `package.json` for `--version`.
- Neovim integration must use built-in remote RPC (`nvim --server <socket> --remote*`); do not add
  a Neovim plugin or `nvr`.
- Biome uses 2 spaces, double quotes, semicolons, trailing commas, and a 100-column width.

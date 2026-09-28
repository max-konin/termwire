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

## Current scope and gotchas

- Treat package READMEs, `PDR.md`, and `ROADMAP.md` as design intent, not implemented behavior.
- The CLI owns `up <name>` (`-w/--worktree`, `-b/--branch`) and `open <target>` (`-l/--line`).
  File opening also ships as the OpenCode plugin tool and the `@termwire/mcp` server; all three
  share the same behavior and read the same environment. `doctor`, `status`, `files`, `open-last`,
  and persistent workspace state are not implemented. Optional global/project JSONC files
  configure only the windows and panes created for a new session.
- Workspace identity is stateless and environment-based:
  `TERMWIRE_SESSION`, `TERMWIRE_SOCKET`, and `TERMWIRE_EDITOR_PANE`.
- Keep adapters testable through injectable `exec`; tests must not require real tmux or Neovim
  binaries.
- Neovim integration must use built-in remote RPC (`nvim --server <socket> --remote*`); do not add
  a Neovim plugin or `nvr`.
- Biome uses 2 spaces, double quotes, semicolons, trailing commas, and a 100-column width.

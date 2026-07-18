# AGENTS.md

## Commands

- Install with `bun install`; this is a Bun workspace repo, not npm/pnpm/yarn.
- Root checks: `bun run lint` (`biome check .`), `bun run lint:fix`, `bun run format`, and
  `bun test`.
- Run one test file with `bun test <path>`. No tests exist yet; keep new tests on Bun's native
  runner.
- There is no root build or typecheck script. Use `bunx tsc --noEmit` for an explicit type check.

## Package boundaries

- Workspaces live under `packages/*`; every current `src/index.ts` is still an `export {}` stub.
- `@openbridge/cli` owns orchestration and may depend on the tmux and Neovim adapters.
- `@openbridge/tmux` and `@openbridge/nvim` are thin adapters; keep them unaware of OpenCode and
  workspace orchestration.
- `@openbridge/opencode-plugin` is intended to stay autonomous and invoke the `openbridge open
  <path>` CLI contract; do not add persisted CLI state or a plugin-to-CLI library dependency.

## Current scope and gotchas

- Treat package READMEs, `PDR.md`, and `ROADMAP.md` as design intent, not implemented behavior.
- The current MVP commands are `up` and `open`; `doctor`, `status`, `files`, `open-last`, config
  files, and persistence are future scope.
- Planned workspace identity is stateless and environment-based:
  `OPENBRIDGE_SESSION`, `OPENBRIDGE_SOCKET`, and `OPENBRIDGE_EDITOR_PANE`.
- The CLI manifest references a missing `bin/openbridge.ts`; do not assume the binary exists. The
  root README's `bun run index.ts` command is also stale.
- Keep adapters testable through injectable `exec`; tests must not require real tmux or Neovim
  binaries.
- Neovim integration must use built-in remote RPC (`nvim --server <socket> --remote*`); do not add
  a Neovim plugin or `nvr`.
- Biome uses 2 spaces, double quotes, semicolons, trailing commas, and a 100-column width.

# AGENTS.md

## Commands

- Install with `bun install`; this is a Bun workspace repo, not npm/pnpm/yarn.
- Root checks: `bun run lint` (`biome check .`), `bun run lint:fix`, `bun run format`, and
  `bun test`.
- Run one test file with `bun test <path>`; tests use Bun's native runner.
- There is no root build or typecheck script. Use `bunx tsc --noEmit` for an explicit type check.
- Run the CLI directly with `bun packages/cli/bin/openbridge.ts`; the root README's
  `bun run index.ts` command is stale.

## Package boundaries

- Workspaces live under `packages/*`.
- `@openbridge/cli` owns orchestration and may depend on the tmux and Neovim adapters.
- `@openbridge/tmux` and `@openbridge/nvim` are thin adapters; keep them unaware of OpenCode and
  workspace orchestration.
- `@openbridge/opencode-plugin` is still an `export {}` stub; do not treat its README or planned
  `openbridge open <path>` contract as implemented.

## Current scope and gotchas

- Treat package READMEs, `PDR.md`, and `ROADMAP.md` as design intent, not implemented behavior.
- The CLI currently registers only `up <name>` (`-w/--worktree`); `open`, `doctor`, `status`,
  `files`, `open-last`, config files, and persistence are not implemented.
- Workspace identity is stateless and environment-based:
  `OPENBRIDGE_SESSION`, `OPENBRIDGE_SOCKET`, and `OPENBRIDGE_EDITOR_PANE`.
- Keep adapters testable through injectable `exec`; tests must not require real tmux or Neovim
  binaries.
- Neovim integration must use built-in remote RPC (`nvim --server <socket> --remote*`); do not add
  a Neovim plugin or `nvr`.
- Biome uses 2 spaces, double quotes, semicolons, trailing commas, and a 100-column width.

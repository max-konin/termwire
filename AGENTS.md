# AGENTS.md

## Commands

- Install with `bun install`; this is a Bun workspace repo, not npm/pnpm/yarn.
- Root scripts: `bun run lint` (`biome check .`), `bun run lint:fix`, `bun run format`, `bun run test` (`bun test`).
- There are no root `build`, `dev`, or `typecheck` scripts. For an explicit type check, use `bunx tsc --noEmit`.
- No tests exist yet. When adding them, keep Bun's native runner so `bun test <path>` remains the focused-test command.

## Workspace shape

- Workspaces live under `packages/*`.
- `@openbridge/cli` owns orchestration/config/state and depends on the tmux and nvim adapters.
- `@openbridge/tmux` and `@openbridge/nvim` are thin adapter packages with `src/index.ts` exports.
- `@openbridge/opencode-plugin` depends on `@openbridge/cli`; it should record touched files through `@openbridge/cli/state`, not shell out to the CLI.

## Current implementation status

- Every current `src/index.ts` is an `export {}` stub; there are no tests or implemented commands yet. Treat package READMEs, `PDR.md`, and `ROADMAP.md` as design intent, not current behavior.
- `packages/cli/package.json` declares `bin/openbridge.ts` and `src/state.ts`, but neither file exists yet. The root README's `bun run index.ts` command is also stale because no root `index.ts` exists.
- The planned CLI binary is `openbridge`; its documented commands are `up`, `open`, `open-last`, `files`, `status`, and `doctor`.

## Repo-specific conventions and gotchas

- Biome owns lint/format: 2-space indent, double quotes, semicolons, trailing commas, 100-column line width.
- Keep the adapter packages testable through injectable `exec`; docs say tmux/nvim tests should not require real tmux or Neovim binaries.
- The nvim adapter should use built-in remote RPC (`nvim --server <socket> --remote*`); do not introduce a Neovim plugin or `nvr` dependency.
- The OpenCode plugin state path is intended to be `/tmp/openbridge/<session>.json`, via `@openbridge/cli/state`.
- No `bridge.yaml` implementation or config file exists yet.

# AGENTS.md

## Commands

- Install with `bun install`; this is a Bun workspace repo, not npm/pnpm/yarn.
- Root checks: `bun run lint` (`biome check .`), `bun run lint:fix`, `bun run format`, and
  `bun test`.
- Run one test file with `bun test <path>`; tests use Bun's native runner.
- There is no root build or typecheck script. Use `bunx tsc --noEmit` for an explicit type check.
- Run the CLI directly with `bun packages/cli/bin/termwire.ts`; the root README's
  `bun run index.ts` command is stale.

## Package boundaries

- Workspaces live under `packages/*`.
- `@termwire/cli` owns orchestration and may depend on the tmux and Neovim adapters.
- `@termwire/tmux` and `@termwire/nvim` are thin adapters; keep them unaware of OpenCode and
  workspace orchestration.
- `@termwire/opencode-plugin` owns explicit `termwire_open({ path, line? })` execution and may
  depend on the tmux and Neovim adapters; it does not invoke a CLI executable.

## Current scope and gotchas

- Treat package READMEs, `PDR.md`, and `ROADMAP.md` as design intent, not implemented behavior.
- The CLI currently owns only `up <name>` (`-w/--worktree`); there is no shell-facing `open`
  command. File opening is the explicit OpenCode plugin tool; `doctor`, `status`, `files`,
  `open-last`, and persistent workspace state are not implemented. Optional global/project JSONC
  files configure only the windows and panes created for a new session.
- Workspace identity is stateless and environment-based:
  `TERMWIRE_SESSION`, `TERMWIRE_SOCKET`, and `TERMWIRE_EDITOR_PANE`.
- Keep adapters testable through injectable `exec`; tests must not require real tmux or Neovim
  binaries.
- Neovim integration must use built-in remote RPC (`nvim --server <socket> --remote*`); do not add
  a Neovim plugin or `nvr`.
- Biome uses 2 spaces, double quotes, semicolons, trailing commas, and a 100-column width.

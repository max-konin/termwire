# @termwire/nvim

## 0.6.0

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

## 0.2.1

## 0.2.0

## 0.1.2

## 0.1.1

## 0.1.0

### Minor Changes

- 5d73919: Initial public release with compiled Bun packages and npm-ready metadata.

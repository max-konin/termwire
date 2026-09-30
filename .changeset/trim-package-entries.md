---
"@termwire/cli": minor
"@termwire/tmux": minor
"@termwire/nvim": minor
"@termwire/mcp": minor
---

Package entries export their API instead of every internal, and `run` takes a runtime.

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

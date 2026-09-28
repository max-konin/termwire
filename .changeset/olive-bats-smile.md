---
"@termwire/opencode-plugin": minor
"@termwire/cli": minor
"@termwire/mcp": minor
"@termwire/nvim": minor
"@termwire/tmux": minor
---

Run on Node instead of requiring Bun. Every package now spawns through
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

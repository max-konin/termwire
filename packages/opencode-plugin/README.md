# @termwire/opencode-plugin

A native OpenCode plugin that opens a file in the current workspace's Neovim
and focuses the editor pane.

It runs inside the OpenCode process and calls the Neovim and tmux adapters
directly, so it needs no separate server process and no `termwire` executable
in `PATH`.

Two alternatives do the same job: `termwire open <path>:<line>` from
[`@termwire/cli`](../cli/README.md), which works in any agent that can run a
shell command, and [`@termwire/mcp`](../mcp/README.md), which works in any MCP
client. Configure one of the three. Two of them means two identical tools
competing in the model's context.

## Tool

```text
termwire_open({ path, line? })
```

`path` is required and resolves from the OpenCode tool-call directory. `line`
is an optional positive 1-based integer. Opening is always an explicit tool
call; files never open on their own.

The plugin reads `TERMWIRE_SOCKET` and `TERMWIRE_EDITOR_PANE` from the
environment it inherits, so OpenCode must be started in a shell created by
`termwire up`. Outside a workspace the tool fails with `not inside a termwire
workspace`.

## Install

```bash
bun add @termwire/opencode-plugin
```

```json
{ "plugin": ["@termwire/opencode-plugin"] }
```

For source development in this repository, load the local entry instead:

```json
{ "plugin": ["./packages/opencode-plugin/src/index.ts"] }
```

## Boundary

The plugin keeps workspace routing and nothing else. Its direct dependencies
are `@opencode-ai/plugin`, `@termwire/nvim`, and `@termwire/tmux`. Workspace
creation belongs to the CLI.

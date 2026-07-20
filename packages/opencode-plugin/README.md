# @termwire/opencode-plugin

A lightweight OpenCode plugin that explicitly opens a requested file in the
current workspace's Neovim and focuses the editor pane.

## Why it exists

It gives OpenCode a workspace-aware file-opening tool without requiring an
`termwire` executable in `PATH`.

## Responsibilities

- expose `termwire_open({ path, line? })`, where `path` is required and
  `line` is an optional positive 1-based integer
- resolve paths from the OpenCode tool-call directory
- read inherited `TERMWIRE_SOCKET` and `TERMWIRE_EDITOR_PANE`
- compose `@termwire/nvim` and `@termwire/tmux` directly to open and focus

## How it opens files

The plugin runs inside the OpenCode process and uses its inherited workspace
environment. It calls the nvim and tmux adapters directly, so it has no CLI or
`PATH` requirement. Opening is always an explicit tool invocation; files are
never opened automatically.

Phase 5 will add only in-memory changed/read-file tracking and selection; it is
not implemented yet.

## Install

```bash
bun add @termwire/opencode-plugin
```

Configure OpenCode with the published package:

```json
{ "plugin": ["@termwire/opencode-plugin"] }
```

## Development

Load the local TypeScript entry only for source development:

```json
{ "plugin": ["./packages/opencode-plugin/src/index.ts"] }
```

## Design principle

Keep workspace routing in the plugin and adapters. Its direct dependencies are
`@opencode-ai/plugin`, `@termwire/nvim`, and `@termwire/tmux`; the CLI
owns `termwire up` only.

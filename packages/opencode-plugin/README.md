# @openbridge/opencode-plugin

A lightweight OpenCode plugin that explicitly opens a requested file in the
current workspace's Neovim and focuses the editor pane.

## Why it exists

It gives OpenCode a workspace-aware file-opening tool without requiring an
`openbridge` executable in `PATH`.

## Responsibilities

- expose `openbridge_open({ path, line? })`, where `path` is required and
  `line` is an optional positive 1-based integer
- resolve paths from the OpenCode tool-call directory
- read inherited `OPENBRIDGE_SOCKET` and `OPENBRIDGE_EDITOR_PANE`
- compose `@openbridge/nvim` and `@openbridge/tmux` directly to open and focus

## How it opens files

The plugin runs inside the OpenCode process and uses its inherited workspace
environment. It calls the nvim and tmux adapters directly, so it has no CLI or
`PATH` requirement. Opening is always an explicit tool invocation; files are
never opened automatically.

Phase 5 will add only in-memory changed/read-file tracking and selection; it is
not implemented yet.

## Local configuration

Load the local TypeScript entry in `opencode.json`:

```json
{ "plugin": ["./packages/opencode-plugin/src/index.ts"] }
```

## Design principle

Keep workspace routing in the plugin and adapters. Its direct dependencies are
`@opencode-ai/plugin`, `@openbridge/nvim`, and `@openbridge/tmux`; the CLI
owns `openbridge up` only.

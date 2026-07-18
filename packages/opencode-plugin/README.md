# @openbridge/opencode-plugin

A lightweight OpenCode plugin. Its job is to track the files OpenCode touches
during the current session and let the user open them in the workspace's
Neovim with one action.

## Why it exists

Without it, the user would have to manually hunt for the files the agent
edited. The plugin listens to OpenCode events and remembers touched files —
**in memory only**, for the lifetime of the session.

## Responsibilities

- observe when OpenCode edits and reads files
- keep the set of touched files in memory (nothing is written to disk)
- expose a command to OpenCode that opens a tracked file

## How it opens files

By spawning `openbridge open <path>`. The plugin runs inside the OpenCode
process, which inherits the workspace environment (`OPENBRIDGE_SOCKET`, …)
from its tmux pane — so the spawned command always reaches the Neovim of the
same session. Opening is always an explicit user action; files are never
opened automatically.

## Design principle

Keep as little logic as possible in the plugin. It depends only on the
OpenCode plugin API — not on any other openbridge package. The only contract
with the CLI is the `openbridge open` command in `PATH`.

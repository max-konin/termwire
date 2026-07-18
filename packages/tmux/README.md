# @openbridge/tmux

A thin wrapper around the `tmux` binary. Responsible **only** for tmux
operations — it knows nothing about OpenCode, Neovim, or workspace logic.

## Why it exists

`openbridge up` needs to programmatically spin up a tmux session with a ready
layout (panes for Neovim, OpenCode, and a shell). This package encapsulates
every `tmux ...` invocation so the rest of the code works against a typed API
instead of hand-building command strings.

## Responsibilities

- create sessions
- create windows and panes
- send commands to panes (`send-keys`)
- switch focus between panes
- detect existing sessions
- attach to a session (`attach-session` outside tmux / `switch-client` inside)

## Design principle

All calls go through an injectable `exec` function. The real implementation
uses `Bun.spawn`; tests inject a fake — so the package is testable without
`tmux` installed.

> No OpenCode logic belongs here.

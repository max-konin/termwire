# @openbridge/nvim

A package for interacting with an **already running** Neovim instance.
Responsible only for talking to the editor — with no Neovim-side plugins.

## Why it exists

When `openbridge open` targets a file, this package opens it in the Neovim
running in the workspace pane. It encapsulates communication with that editor
over its socket.

## Responsibilities

- open a file in the running Neovim
- jump to a given line
- detect whether the instance is alive and responding

tmux owns editor focus; this package only talks to Neovim.

## API

`createNvim({ exec? })` returns an adapter with:

- `isRunning(socket)`: reports whether the server responds to a remote RPC probe.
- `openFile(socket, file, line?)`: opens a file and optionally jumps to a positive line number.

## Design principle

Communication uses Neovim's built-in RPC: `nvim --server <socket> --remote*`
(Neovim ≥ 0.9). No external tools like `nvr` and no plugins — this is a PDR
requirement. All calls go through an injectable `exec` function, so the package
is testable without Neovim installed.

> Implementation details (socket, `--remote` flags) stay internal; only a
> typed API is exposed.

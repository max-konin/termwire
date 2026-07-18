# @openbridge/nvim

A package for interacting with an **already running** Neovim instance.
Responsible only for talking to the editor — with no Neovim-side plugins.

## Why it exists

When OpenCode touches a file, `openbridge open` must open it in the very same
Neovim running in the workspace pane and move focus there. This package
encapsulates communication with the running Neovim over its socket.

## Responsibilities

- open a file in the running Neovim
- jump to a given line
- focus the editor
- detect whether the instance is alive and responding

## Design principle

Communication uses Neovim's built-in RPC: `nvim --server <socket> --remote*`
(Neovim ≥ 0.9). No external tools like `nvr` and no plugins — this is a PDR
requirement. As in `@openbridge/tmux`, all calls go through an injectable
`exec` function, so the package is testable without Neovim installed.

> Implementation details (socket, `--remote` flags) stay internal; only a
> typed API is exposed.

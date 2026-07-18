# @openbridge/cli

The project's main entry point — the `openbridge` command. Orchestrates the
other packages. Fully **stateless**: no config files, no state files —
workspace identity lives in environment variables set by `openbridge up`.

## Why it exists

This is the tool that removes the manual setup described in the PDR: bring up
a tmux workspace with a single command, then open files in the running editor
from anywhere inside the workspace.

## Commands

| Command                       | What it does                                       |
| ----------------------------- | -------------------------------------------------- |
| `openbridge up`               | create (or attach to) a session in the current dir |
| `openbridge up -w <name>`     | create a git worktree and a session inside it      |
| `openbridge open <f[:line]>`  | open a file in this workspace's Neovim             |

## How it works

- `up` generates a unique session id, starts the tmux layout (Neovim,
  OpenCode, shell), and creates every pane with `OPENBRIDGE_SESSION`,
  `OPENBRIDGE_SOCKET`, and `OPENBRIDGE_EDITOR_PANE` in the environment.
- `open` reads those variables (inherited by every process inside the
  workspace), opens the file via `@openbridge/nvim`, and focuses the editor
  pane via `@openbridge/tmux`. Outside a workspace it fails with a clear
  error.
- Multiple sessions of one project (via worktrees) never interfere: each has
  its own socket and session name.

## Dependencies

`@openbridge/tmux` and `@openbridge/nvim` — thin adapters over the binaries.
Nothing else.

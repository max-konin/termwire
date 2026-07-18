# @openbridge/cli

The project's main entry point — the `bridge` command. Orchestrates the other
packages and owns the workspace configuration and state.

## Why it exists

This is the tool that removes the manual setup described in the PDR: bring up
a tmux workspace with a single command, then open the files OpenCode touched
directly in the editor.

## Commands

| Command            | What it does                                       |
| ------------------ | -------------------------------------------------- |
| `openbridge up`        | create (or attach to) the workspace                |
| `openbridge open`      | open a tracked file in Neovim (interactive picker) |
| `openbridge open <f>`  | open a specific file, supports `file:line`         |
| `openbridge open-last` | open the most recently touched file                |
| `openbridge files`     | list files touched by OpenCode                     |
| `openbridge status`    | show workspace status                              |
| `openbridge doctor`    | check the environment (tmux / nvim / opencode)     |

## Responsibilities

- create and inspect workspaces
- open files
- load configuration (`bridge.yaml`)
- own the workspace state file and coordinate `@openbridge/tmux` and
  `@openbridge/nvim`

## How it fits together

- depends on `@openbridge/tmux` and `@openbridge/nvim` (adapters to the
  binaries) and on `yaml` (config parsing)
- the workspace state module is exported as `@openbridge/cli/state` and reused
  by `@openbridge/opencode-plugin` to append touched files to the shared state
  file

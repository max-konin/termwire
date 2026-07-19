# @openbridge/cli

The project's main entry point — the `openbridge` command. Orchestrates the
other packages. Fully **stateless**: no config files, no state files —
workspace identity lives in environment variables set by `openbridge up <name>`.

## Why it exists

This is the tool that removes manual tmux/editor setup: bring up a stateless
workspace with a single command. File opening is planned for a later phase and
is not currently implemented.

## Commands

| Command                                      | What it does |
| -------------------------------------------- | ------------ |
| `openbridge up <name>`                       | create or attach to `<project>-<name>` in the current directory |
| `openbridge up <name> -w`                    | create or reuse sibling worktree `<project>-<name>` on branch `<name>` |
| `openbridge up <name> --worktree <wt-name>`  | create or reuse the explicit sibling worktree while retaining session `<project>-<name>` |

## How it works

- `up <name>` creates `editor` (`nvim --listen <socket>`) and free `shell`
  windows. Final processes receive `OPENBRIDGE_SESSION`, `OPENBRIDGE_SOCKET`,
  and `OPENBRIDGE_EDITOR_PANE`.
- OpenCode is not started automatically. Users may start it in the shell and
  reshape the workspace with tmux.
- Existing sessions attach immediately without worktree mutation. Bare
  `-w` uses the workspace name; an explicit worktree value selects its branch
  and sibling directory while the session name stays `<project>-<name>`.
- There are no config files or persistent state.

## Dependencies

Commander 15 is the CLI runtime dependency for parsing `up`. `@openbridge/tmux`
and `@openbridge/nvim` are thin adapters over their binaries; the CLI owns
workspace policy and orchestration.

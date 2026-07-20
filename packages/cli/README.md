# @termwire/cli

Requires Bun >=1.3.14, tmux >=3.2, and Neovim >=0.9.

```bash
bun add --global @termwire/cli
termwire --help
termwire up dev
```

The project's main entry point — the `termwire` command. Orchestrates the
other packages. Fully **stateless**: no config files, no state files —
workspace identity lives in environment variables set by `termwire up <name>`.

## Why it exists

This is the tool that removes manual tmux/editor setup: bring up a stateless
workspace with a single command. The CLI owns `up <name>` only; file opening is
the explicit `termwire_open({ path, line? })` OpenCode plugin tool.

## Commands

| Command                                      | What it does |
| -------------------------------------------- | ------------ |
| `termwire up <name>`                       | create or attach to `<project>-<name>` in the current directory |
| `termwire up <name> -w`                    | create or reuse sibling worktree `<project>-<name>` on branch `<name>` |
| `termwire up <name> --worktree <wt-name>`  | create or reuse the explicit sibling worktree while retaining session `<project>-<name>` |

## How it works

- `up <name>` creates `editor` (`nvim --listen <socket>`) and free `shell`
  windows. Final processes receive `TERMWIRE_SESSION`, `TERMWIRE_SOCKET`,
  and `TERMWIRE_EDITOR_PANE`.
- OpenCode is not started automatically. Users may start it in the shell and
  reshape the workspace with tmux.
- Existing sessions attach immediately without worktree mutation. Bare
  `-w` uses the workspace name; an explicit worktree value selects its branch
  and sibling directory while the session name stays `<project>-<name>`.
- There are no config files or persistent state.
- The CLI has no shell-facing `open` command and does not need to be in `PATH`
  for the plugin: the plugin composes the nvim and tmux adapters directly.

## Dependencies

Commander 15 is the CLI runtime dependency for parsing `up`. `@termwire/tmux`
and `@termwire/nvim` are thin adapters over their binaries; the CLI owns
workspace policy and orchestration.

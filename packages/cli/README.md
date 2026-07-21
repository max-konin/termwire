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

| Command | Workspace | Branch |
| --- | --- | --- |
| `termwire up chore/improve` | current directory | unchanged |
| `termwire up chore/improve -w` | sibling `<project>-chore-improve` | `chore/improve` |
| `termwire up session -w -b feature/api` | sibling `<project>-session` | `feature/api` |
| `termwire up session -b feature/api` | current directory | switch to it, or create it from current `HEAD` |
| `termwire up session -w legacy-name` | sibling `<project>-legacy-name` | `legacy-name` |
| `termwire up session -w legacy-name -b feature/api` | sibling `<project>-legacy-name` | `feature/api` |

`<name>` always determines the tmux identity. With `-w`, an explicit optional worktree value
selects the directory key; otherwise `<name>` does. `--branch` selects the exact Git branch when
present; otherwise the worktree directory key is also the branch name. Slashes are preserved in
Git branch names and replaced only in filesystem-safe worktree directory names. Without `-w`, Git
is changed only when `--branch` is present. Existing tmux sessions attach without Git mutations.

## How it works

- `up <name>` creates `editor` (`nvim --listen <socket>`) and free `shell`
  windows. Final processes receive `TERMWIRE_SESSION`, `TERMWIRE_SOCKET`,
  and `TERMWIRE_EDITOR_PANE`.
- OpenCode is not started automatically. Users may start it in the shell and
  reshape the workspace with tmux.
- Existing sessions attach immediately without branch or worktree mutation.
- There are no config files or persistent state.
- The CLI has no shell-facing `open` command and does not need to be in `PATH`
  for the plugin: the plugin composes the nvim and tmux adapters directly.

## Dependencies

Commander 15 is the CLI runtime dependency for parsing `up`. `@termwire/tmux`
and `@termwire/nvim` are thin adapters over their binaries; the CLI owns
workspace policy and orchestration.

# Termwire — Product Design Record

**Status:** implemented through the `open` command and the Node runtime move.

## Vision

Termwire is a small CLI that creates a tmux workspace in which a coding agent
and Neovim run side by side, and lets the agent put a file in front of the user
in that editor.

It targets tmux and Neovim specifically. It is agent-agnostic: any agent that
can run a shell command works, and OpenCode and MCP clients get native tools for
the same operation.

The goal is a seamless workflow without a Neovim plugin and without manual tmux
setup.

## Problem

Running a coding agent next to an editor normally requires the developer to
manually create a tmux session, split windows and panes, start Neovim,
configure an RPC socket, launch the agent, switch between the two, and then
find the files the agent touched.

This is repetitive, easy to get wrong, and hard to standardize across projects.
Termwire automates it.

## Non goals

Termwire is not an AI agent, an editor plugin, a tmux replacement, a session
persistence framework, or a generic automation platform.

It does not track which files an agent changed. Git already answers that
question, and a tracking layer would duplicate it for no gain.

## Runtime

Every published package runs on **Node 22.12 or newer**, the floor set by
Commander 15. No published code may use a `Bun.*` API, and every relative
import carries an explicit `.js` extension, because Node's ESM loader rejects
extensionless specifiers.

The repository is developed with Bun: install, test, lint, and build. That is a
toolchain choice and never a requirement on users. `bun run verify:node`
executes the built CLI and MCP server under Node, and CI runs it on every push
so the two cannot drift apart again.

Workspaces additionally need tmux 3.2 or newer, for pane environment variables,
and Neovim 0.9 or newer, for remote RPC.

## Repository structure

```text
packages/
    cli/                # the termwire command: up and open
    mcp/                # MCP server exposing termwire_open
    opencode-plugin/    # native OpenCode tool
    tmux/               # typed tmux adapter
    nvim/               # typed Neovim RPC adapter
```

The repository uses Bun workspaces, TypeScript, and Biome. TurboRepo is
intentionally omitted.

All five packages version and publish together as one fixed Changesets group,
because the CLI and the two agent integrations depend on the adapters and must
never be installed at mismatched versions.

## Components

### cli

The main entry point. Workspace identity is **stateless**: it is derived at `up`
time and carried in environment variables, never written to disk. Optional JSONC
files declare a layout, and only when a new session is created.

It owns the workspace lifecycle and file opening.

```bash
termwire up <name>                       # create or attach to <project>-<name>
termwire up <name> -w [wt-name]          # use a Git worktree
termwire up <name> -b <branch>           # select the exact branch
termwire ls                              # list the workspaces on this machine
termwire ls --json                       # the same rows for machines
termwire down [name]                     # kill that workspace's session, or this one
termwire down [name] -w [--force]        # and remove its worktree
termwire open <path>[:line]              # open a file in the workspace editor
termwire open <path> --line <number>     # same, keeping the path verbatim
```

`open` exists so that any agent with shell access can show the user a file,
with nothing to install or register beyond the CLI itself.

### tmux

Owns tmux commands only: sessions, windows, panes with environment variables,
key sending, focus, and existing-session detection. No agent logic and no
Neovim logic belong here.

### nvim

Owns talking to an already running Neovim: open a file, jump to a line, detect
whether the instance responds. Communication uses built-in remote RPC,
`nvim --server <socket> --remote*`. No `nvr` and no Neovim-side plugin, which is
a requirement rather than an implementation detail.

### mcp

A stdio MCP server exposing `termwire_open({ path, line? })`, for agents that
should not run shell commands. It composes the nvim and tmux adapters directly
and needs no `termwire` executable in `PATH`.

### opencode-plugin

A native OpenCode plugin exposing the same tool inside the OpenCode process, so
no separate server is needed. It composes the adapters directly and holds as
little logic as possible.

## Workspace

`termwire up dev` creates or attaches to the tmux session `<project>-dev`.
Without a selected layout a new workspace gets two windows:

```text
session
├── editor: nvim --listen <socket>
└── shell:  user's default shell
```

Each session gets a unique name and a unique Neovim socket at
`/tmp/termwire/<session>.sock`. Every final workspace process receives the
workspace environment:

| Variable | Meaning |
| --- | --- |
| `TERMWIRE_SESSION` | tmux session name |
| `TERMWIRE_SOCKET` | Neovim RPC socket path |
| `TERMWIRE_EDITOR_PANE` | tmux pane id of the editor pane |

Those three variables are the whole of Termwire's state. There is no state file
to go stale: `ls` derives the list of workspaces from tmux and Git, and `down` is
`tmux kill-session` plus, on request, `git worktree remove`.

No agent starts automatically. The user starts one in a shell pane, declares it
as a pane command in a layout, or reshapes the workspace with ordinary tmux
commands afterwards.

## Features

### Workspace creation

`termwire up <name>` works in the current directory and always addresses
`<project>-<name>`. Running it again attaches immediately, without validating or
mutating Git state.

With bare `-w` or `--worktree`, the worktree name is `<name>`; an explicit value
chooses it instead. Worktrees are siblings named `../<project>-<worktree-name>`.
A matching registered worktree is safely reused and conflicts fail clearly.
`--branch` selects the exact Git branch; otherwise the worktree directory key is
also the branch name. Slashes survive in branch names and are replaced only in
directory names. Without `-w`, Git changes only when `--branch` is present.

### Workspace listing and teardown

`termwire ls` lists the workspaces on this machine, one row each: the session, an
attached marker, the Git branch and directory, and the processes and resident
memory still labeled with the session. A session counts as a workspace when its
tmux session environment carries `TERMWIRE_SESSION`, never because its name looks
like `<project>-<name>`: the user picks the name and `up` sets the label. Identity
therefore stays stateless, with no file to go stale. A workspace whose directory
is gone is listed and marked. No workspaces is not an error.

`termwire down <name>` resolves the name exactly as `up` does and kills that tmux
session; the `session-closed` hook reaps what ran in it. Without a name the target
is the workspace the command runs in, named by the inherited `TERMWIRE_SESSION` —
the same environment-based identity `open` relies on, and the only form that works
inside a worktree workspace, where the Git root is the worktree.

With `-w` it also removes the worktree the session sits in, refusing the main
checkout, uncommitted changes unless `--force` is given, and the directory it is
running in — unless that directory belongs to the workspace being torn down, whose
shell dies with the session a moment later. Its own workspace also inverts the
order: the worktree goes first and the kill last, because the kill ends this
process. The branch is never deleted: a branch outlives its workspace.

### Opening a file

Three surfaces expose one behavior: the `termwire open` command, the MCP tool,
and the OpenCode plugin tool. Each resolves the path, reads the inherited
`TERMWIRE_SOCKET`, checks that Neovim answers, opens through the nvim adapter,
then focuses the editor pane through the tmux adapter when
`TERMWIRE_EDITOR_PANE` is known.

Without a socket, each fails with `not inside a termwire workspace`. A file
never opens automatically; opening is always an explicit action.

Users configure one surface, not several. Two of them put two identical tools in
the same model's context.

## Configuration

Optional JSONC layout sources are global
`$XDG_CONFIG_HOME/termwire/config.jsonc`, falling back to
`~/.config/termwire/config.jsonc`, and project
`<resolved-workspace-git-root>/.termwire.jsonc`. A worktree invocation reads the
target worktree's file. Both present sources are validated. Project `windows`
replace global `windows` rather than merging. Version-only files fall through,
and no selected `windows` uses the editor-then-shell default.

The root requires `version: 1`. Window names and pane ids are unique and
nonempty. Panes are ordered: the first has no split fields, while each later
pane names an earlier same-window `splitFrom` and sets `direction` to
`horizontal` or `vertical`, with an optional integer `sizePercent` from 1
through 99. Commands are argv arrays, not shell strings. Exactly one pane has
`role: "editor"` and it carries no command.

There is no interpolation, custom pane cwd, custom pane environment, or
configuration persistence. Existing sessions attach without rereading
configuration.

Parse diagnostics name the source and a one-based location; validation
diagnostics name the source and a JSON path. Configuration resolves before any
socket or tmux side effect. Once a new session exists, a layout or attach
failure triggers best-effort cleanup that preserves the original error.

## Design principles

- Explicit over automatic.
- Stateless over persisted.
- Small packages with clear responsibilities.
- No editor plugin required.
- Published output runs on the mainstream runtime, whatever the repository is
  built with.
- Build only what the current use case requires.

## Future ideas

Not planned, and not allowed to shape the current architecture.

- `termwire doctor` and `termwire status`
- Additional configuration sources or options
- Telescope and fzf integration
- Session history and workspace persistence
- Support for additional editors, such as VS Code, Zed, or Helix
- Support for additional agents beyond a shell command

## Success criteria

A developer installs Termwire, runs `termwire up <name>`, and starts working.

Concretely:

- Without a layout, a new workspace provides the default editor and shell
  windows. With one, it creates the declared windows and panes and contains
  exactly one editor-role pane.
- Every final process receives the three workspace variables.
- Optional worktree reuse is safe, and a repeat `up` attaches without Termwire
  state on disk.
- A requested file opens at its line in the Neovim of that same session, and
  never opens on its own.
- The published CLI and MCP server start under plain Node, with no Bun
  installed.

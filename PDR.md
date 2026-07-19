# Workspace Agent

**Status:** Draft v0.2

## Vision

Workspace Bridge is a lightweight CLI that creates and manages an AI-powered development workspace.

The initial version is focused exclusively on **OpenCode**, **tmux**, and **Neovim**.

The goal is to provide a seamless development experience without requiring Neovim plugins or manual tmux setup.

---

# Problem

Today an OpenCode workflow typically requires developers to manually:

- create tmux sessions
- split windows and panes
- start Neovim
- configure an RPC socket
- launch OpenCode
- switch between the agent and the editor
- manually locate files modified by the agent

This setup is repetitive and difficult to standardize.

Workspace Bridge automates the entire workflow.

---

# Goals

## Primary Goals

- Create a ready-to-use tmux workspace with a single command.
- Support multiple parallel sessions per project via git worktrees.
- Provide an explicit OpenCode tool to open files in the running editor.
- Keep OpenBridge workspace identity stateless: no OpenBridge-owned workspace config or state files.
- Keep the implementation small and modular.
- Avoid any Neovim plugin.

---

# Non Goals

The project is **not**:

- an AI agent
- an editor plugin
- a tmux replacement
- a session persistence framework
- a generic automation platform

Future support for other agents or editors is intentionally out of scope for the MVP.

---

# Repository Structure

```text
packages/
    cli/
    opencode-plugin/
    tmux/
    nvim/
```

The repository uses:

- Bun
- Bun Workspaces
- TypeScript
- Biome

TurboRepo is intentionally omitted.

---

# Components

## CLI

The CLI is the main entry point. It is fully **stateless**: workspace identity
is discovered from environment variables, never from files on disk.

Responsibilities:

- create workspaces (optionally in a new git worktree)
- coordinate other packages

The CLI owns `openbridge up <name>` only. File opening is an OpenCode plugin tool, not a shell command.

Commands:

```bash
openbridge up <name>                         # create or attach to <project>-<name>
openbridge up <name> -w                       # use worktree name <name>
openbridge up <name> --worktree <wt-name>     # use explicit worktree name <wt-name>
```

---

## tmux

Responsible only for tmux operations.

Responsibilities:

- create sessions
- create windows
- create panes (with environment variables)
- send commands
- detect existing sessions

No OpenCode logic belongs here.

---

## nvim

Responsible only for interacting with Neovim.

Responsibilities:

- open files
- jump to line
- detect running instance

Implementation details (RPC via `nvim --server`) are internal.

---

## opencode-plugin

A lightweight OpenCode plugin. It depends on the OpenCode plugin API and directly
composes `@openbridge/nvim` and `@openbridge/tmux` adapters.

Responsibilities:

- expose explicit `openbridge_open({ path, line? })` execution
- read inherited workspace environment and open through the nvim/tmux adapters
- add in-memory changed/read-file tracking and selection only in Phase 5

The plugin should contain as little logic as possible.

---

# Workspace

Running

```bash
openbridge up dev
```

creates or attaches to the tmux session `<project>-dev`. A newly created
workspace has two default tmux windows:

```text
session
├── editor: nvim --listen <socket>
└── shell:  user's default shell
```

Each session gets a unique name and a unique Neovim socket
(`/tmp/openbridge/<session>.sock`). Every final workspace process receives the
workspace environment:

| Variable                 | Meaning                         |
| ------------------------ | ------------------------------- |
| `OPENBRIDGE_SESSION`     | tmux session name               |
| `OPENBRIDGE_SOCKET`      | Neovim RPC socket path          |
| `OPENBRIDGE_EDITOR_PANE` | tmux pane id of the editor pane |

OpenCode is not started automatically. The user may start it from the shell
and reshape windows and panes with ordinary tmux commands. OpenBridge only
requires the recorded Neovim editor pane; it owns no layout configuration or
persistent workspace state.

---

# MVP Features

## Workspace Creation

Create a fully configured workspace.

Includes:

- tmux session
- `editor` window running `nvim --listen <socket>`
- free `shell` window

`openbridge up <name>` works in the current directory and always addresses
`<project>-<name>`; running it again attaches immediately to an existing
session without worktree validation or mutation. With bare `-w` or
`--worktree`, the worktree name is `<name>`; an explicit optional value chooses
the worktree name. A matching registered worktree is safely reused; conflicts
fail clearly. Worktrees are siblings named `../<project>-<worktree-name>` on
the matching branch. Removing a worktree is manual (`git worktree remove`) in
the MVP.

---

## File Tracking (Phase 5)

The OpenCode plugin keeps the current session state **in memory**:

- edited files
- mentioned/read files

This information lives only inside the plugin process and only for the active
session. Nothing is written to disk.

---

## Open File (Phase 4)

OpenCode explicitly invokes `openbridge_open({ path, line? })`. The tool resolves
the path from the tool-call directory, reads inherited `OPENBRIDGE_SOCKET` and
`OPENBRIDGE_EDITOR_PANE`, opens through `@openbridge/nvim`, then focuses through
`@openbridge/tmux`. It requires no `openbridge` executable in `PATH`.

Outside a workspace (without `OPENBRIDGE_SOCKET` or `OPENBRIDGE_EDITOR_PANE`)
the tool fails with a clear error. It does not track or select files; Phase 5
adds only in-memory changed/read-file tracking and selection.

Files are **never opened automatically**.

---

# Configuration

OpenBridge owns no workspace or state configuration files; workspace identity
is derived at `up` time and carried by environment variables. OpenCode loads the
local plugin through the repository's `opencode.json` registration.

---

# Design Principles

- Explicit over automatic.
- Stateless over persisted.
- Small packages with clear responsibilities.
- No editor plugin required.
- No unnecessary abstractions.
- Build only what the current use case requires.

---

# Future Ideas

Not part of the MVP.

- `openbridge doctor` / `openbridge status`
- `openbridge down` and worktree cleanup
- `openbridge files` / `openbridge open-last` in the shell
- OpenBridge-owned configuration file
- Telescope integration
- fzf integration
- Session history
- Workspace persistence
- Support for additional editors
- Support for additional AI agents

These features should not influence the initial architecture.

---

# Success Criteria

A developer should be able to:

1. Install Workspace Bridge.
2. Run:

```bash
openbridge up <name>
```

1. Start coding immediately.

The workspace must provide the editor and shell windows, final-process
workspace environment, safe optional worktree reuse, and repeat attach behavior
without OpenBridge-owned workspace configuration or persistent state. OpenCode
must explicitly open a requested file with `openbridge_open({ path, line? })`
through the nvim/tmux adapters, without routing through an `openbridge`
executable in `PATH`; files never open automatically. Phase 5 changed/read-file
tracking and selection remain later work.

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
- Provide a simple way to open files in the running editor — from the shell or from OpenCode.
- Keep the CLI stateless: no config files, no state files.
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

`openbridge open` is planned for a later phase; it is not currently implemented.

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

A lightweight OpenCode plugin. It depends only on the OpenCode plugin API —
not on any other openbridge package.

Responsibilities:

- collect files edited/read during the current session — **in memory only**
- expose a command to OpenCode to open a tracked file
- open files by spawning `openbridge open <path>` (the workspace environment
  is inherited from the OpenCode process)

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

## File Tracking

The OpenCode plugin keeps the current session state **in memory**:

- edited files
- mentioned/read files

This information lives only inside the plugin process and only for the active
session. Nothing is written to disk.

---

## Open File

Users can explicitly request opening a file.

From any workspace pane:

```bash
openbridge open app.ts
openbridge open app.ts:145
```

From OpenCode: the plugin exposes a command that opens a tracked file by
spawning `openbridge open <path>`.

Outside a workspace (no `OPENBRIDGE_*` environment) the command fails with a
clear error.

Files are **never opened automatically**.

---

# Configuration

None. The MVP has no configuration files; workspace identity is derived at
`up` time and carried by environment variables.

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
- configuration file
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
without configuration or persistent state. File opening and OpenCode plugin
behavior remain later-phase work.

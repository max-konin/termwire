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
- open files in the running editor
- coordinate other packages

Commands:

```bash
openbridge up               # create (or attach to) a session in the current directory
openbridge up -w <name>     # create a git worktree <name> and a session inside it
openbridge open <file[:line]>
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
openbridge up
```

creates a tmux session similar to:

```text
┌──────────────────────┬──────────────────────┐
│                      │                      │
│       Neovim         │       OpenCode       │
│                      │                      │
├──────────────────────┴──────────────────────┤
│                 Shell                       │
└─────────────────────────────────────────────┘
```

Each session gets a unique name and a unique Neovim socket
(`/tmp/openbridge/<session>.sock`). Every pane is created with the workspace
environment:

| Variable                 | Meaning                         |
| ------------------------ | ------------------------------- |
| `OPENBRIDGE_SESSION`     | tmux session name               |
| `OPENBRIDGE_SOCKET`      | Neovim RPC socket path          |
| `OPENBRIDGE_EDITOR_PANE` | tmux pane id of the editor pane |

Everything running inside the workspace (shell, OpenCode, the plugin)
inherits these variables — that is how `openbridge open` always reaches the
right editor, even with multiple sessions of the same project.

---

# MVP Features

## Workspace Creation

Create a fully configured workspace.

Includes:

- tmux session
- editor pane
- OpenCode pane
- shell pane

`openbridge up` works in the current directory; running it again attaches to
the existing session. `openbridge up -w <name>` creates a git worktree
(directory `../<project>-<name>`, branch `<name>`) and starts an independent
session inside it — this is how several agents can work on one project in
parallel. Removing a worktree is manual (`git worktree remove`) in the MVP.

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
openbridge up
```

1. Start coding immediately.

Opening files modified by OpenCode should require no manual searching or
editor switching, and several sessions of the same project must not interfere
with each other.

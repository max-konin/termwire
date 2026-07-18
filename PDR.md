# Workspace Agent

**Status:** Draft v0.1

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
- Configure Neovim for communication with OpenCode.
- Provide a simple way to open files from OpenCode in the running editor.
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

The CLI is the main entry point.

Responsibilities:

- create workspaces
- inspect workspaces
- open files
- discover configuration
- coordinate other packages

Example commands:

```bash
bridge up
bridge open
bridge files
bridge status
bridge doctor
```

---

## tmux

Responsible only for tmux operations.

Responsibilities:

- create sessions
- create windows
- create panes
- send commands
- detect existing sessions

No OpenCode logic belongs here.

---

## nvim

Responsible only for interacting with Neovim.

Responsibilities:

- open files
- jump to line
- focus editor
- detect running instance

Implementation details (RPC, tmux, nvr, etc.) are internal.

---

## opencode-plugin

A lightweight OpenCode plugin.

Responsibilities:

- expose commands to OpenCode
- collect files referenced during the current session
- request opening files in the editor

The plugin should contain as little logic as possible.

---

# Workspace

Running

```bash
bridge up
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

Neovim is started with a unique socket.

The OpenCode plugin automatically discovers the active workspace.

---

# MVP Features

## Workspace Creation

Create a fully configured workspace.

Includes:

- tmux session
- editor pane
- OpenCode pane
- shell pane

---

## File Tracking

The OpenCode plugin maintains the current session state.

Initially only:

- edited files
- mentioned/read files

This information is kept only for the active session.

---

## Open File

Users can explicitly request opening a file.

Examples:

```bash
bridge open
bridge open app.ts
bridge open app.ts:145
bridge open-last
```

Files are **never opened automatically**.

---

## Health Check

```bash
bridge doctor
```

Checks:

- tmux installed
- Neovim installed
- OpenCode installed
- active socket
- workspace configuration

---

# Configuration

Configuration file (proposed):

```yaml
editor:
  socket: /tmp/nvim.sock

tmux:
  session: workspace
```

The first version intentionally keeps configuration minimal.

---

# Design Principles

- Explicit over automatic.
- Small packages with clear responsibilities.
- No editor plugin required.
- No unnecessary abstractions.
- Build only what the current use case requires.

---

# Future Ideas

Not part of the MVP.

- Telescope integration
- fzf integration
- Multiple workspaces
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
bridge up
```

1. Start coding immediately.

Opening files modified by OpenCode should require no manual searching or editor switching.

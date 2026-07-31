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
- Keep TermWire workspace identity stateless: no TermWire-owned persistent workspace state files.
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

The CLI is the main entry point. Runtime workspace identity is fully
**stateless**: it is discovered from environment variables, never from
persistent state on disk. Optional JSONC files declare a layout only when a new
session is created.

Responsibilities:

- create workspaces (optionally in a new git worktree)
- coordinate other packages

The CLI owns `termwire up <name>` only. File opening is an OpenCode plugin tool, not a shell command.

Commands:

```bash
termwire up <name>                         # create or attach to <project>-<name>
termwire up <name> -w                       # use worktree name <name>
termwire up <name> --worktree <wt-name>     # use explicit worktree name <wt-name>
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
composes `@termwire/nvim` and `@termwire/tmux` adapters.

Responsibilities:

- expose explicit `termwire_open({ path, line? })` execution
- read inherited workspace environment and open through the nvim/tmux adapters
- add in-memory changed/read-file tracking and selection only in Phase 5

The plugin should contain as little logic as possible.

---

# Workspace

Running

```bash
termwire up dev
```

creates or attaches to the tmux session `<project>-dev`. Without a selected
layout, a newly created workspace has the two-window default layout:

```text
session
├── editor: nvim --listen <socket>
└── shell:  user's default shell
```

Each session gets a unique name and a unique Neovim socket
(`/tmp/termwire/<session>.sock`). Every final workspace process receives the
workspace environment:

| Variable                 | Meaning                         |
| ------------------------ | ------------------------------- |
| `TERMWIRE_SESSION`     | tmux session name               |
| `TERMWIRE_SOCKET`      | Neovim RPC socket path          |
| `TERMWIRE_EDITOR_PANE` | tmux pane id of the editor pane |

OpenCode is not started automatically. The user may start it from the shell
and reshape windows and panes with ordinary tmux commands. TermWire records no
persistent workspace state. A configured new session instead creates its
declared windows and panes; each effective layout contains exactly one
editor-role pane, as described below.

---

# MVP Features

## Workspace Creation

Create a fully configured workspace.

Includes:

- tmux session
- default `editor` window running `nvim --listen <socket>`
- default free `shell` window

`termwire up <name>` works in the current directory and always addresses
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

OpenCode explicitly invokes `termwire_open({ path, line? })`. The tool resolves
the path from the tool-call directory, reads inherited `TERMWIRE_SOCKET` and
`TERMWIRE_EDITOR_PANE`, opens through `@termwire/nvim`, then focuses through
`@termwire/tmux`. It requires no `termwire` executable in `PATH`.

Outside a workspace (without `TERMWIRE_SOCKET` or `TERMWIRE_EDITOR_PANE`)
the tool fails with a clear error. It does not track or select files; Phase 5
adds only in-memory changed/read-file tracking and selection.

Files are **never opened automatically**.

---

# Configuration

Workspace identity is derived at `up` time and carried by environment variables;
it is not persistent state. Optional JSONC layout sources are global
`$XDG_CONFIG_HOME/termwire/config.jsonc` (falling back to
`~/.config/termwire/config.jsonc`) and project
`<resolved-workspace-git-root>/.termwire.jsonc`. A worktree invocation reads the
target worktree file. Both present sources are validated; project `windows`
replace, rather than merge with, global `windows`. Version-only files fall
through, and no selected `windows` uses the editor-then-shell default.

The root requires `version: 1`; window names and pane ids are unique and
nonempty. Panes are ordered: the first has no split fields, while each later
pane names an earlier same-window `splitFrom` and uses `horizontal` or
`vertical`, with optional integer `sizePercent` 1..99. Commands are argv arrays,
not shell strings; there is exactly one `role: "editor"` and it has no command.
There is no interpolation, custom cwd/environment, or configuration/state
persistence. Existing sessions attach without rereading configuration.

Parse diagnostics include source and one-based location; validation diagnostics
include source and JSON path. Configuration is resolved before tmux side effects,
and post-session setup failures clean up best-effort without replacing the
original error. OpenCode loads the local plugin through the repository's
`opencode.json` registration.

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

- `termwire doctor` / `termwire status`
- `termwire down` and worktree cleanup
- `termwire files` / `termwire open-last` in the shell
- Additional configuration sources or options
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
termwire up <name>
```

1. Start coding immediately.

Without a selected layout, the workspace must provide the default editor and
shell windows. A configured new session must create its declared windows and
panes and contain exactly one editor-role pane. Every workspace must provide
the final-process workspace environment, safe optional worktree reuse, and
repeat attach behavior without TermWire-owned persistent state. OpenCode
must explicitly open a requested file with `termwire_open({ path, line? })`
through the nvim/tmux adapters, without routing through an `termwire`
executable in `PATH`; files never open automatically. Phase 5 changed/read-file
tracking and selection remain later work.

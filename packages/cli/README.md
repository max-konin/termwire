# @termwire/cli

The `termwire` command. It creates tmux workspaces with a Neovim RPC socket and
opens files in the workspace editor.

Requires Node >=22.12, tmux >=3.2, and Neovim >=0.9. It runs on Bun as well.

```bash
npm install -g @termwire/cli
termwire --help
termwire --version
termwire up dev
termwire open src/app.ts:42
```

Workspace identity is stateless. It lives in the environment variables that
`termwire up <name>` exports into every pane, never in a file on disk. Layout
configuration is optional JSONC read when a session is created; it is not
workspace state.

## `install`

```bash
npx @termwire/cli install          # before anything is installed
termwire install                   # after
```

Writes a layout configuration and installs a `termwire-open` skill for the agents
you pick. Interactive by default, with each layout's windows drawn beside the list
as you move through it, and silent once the flags leave nothing to ask: `--yes`, or
`--layout` together with `--agents`. A script wants the silent form, because a
half-specified run still stops for the confirmation.

| Option | Meaning |
| --- | --- |
| `-l, --layout <name>` | `default`, `three-window`, `focused`, `full-stack`, or `none` |
| `-p, --project` | write `.termwire.jsonc` in the Git root instead of the global config |
| `-a, --agents <list>` | comma-separated `claude`, `codex`, `opencode`, or `none` |
| `-f, --force` | replace an existing config, or a skill file you own |
| `-y, --yes` | never prompt: default layout, and no agents unless `--agents` says so |

### The layout

The templates are the layouts from the cookbook below, comments included, so what
you get is what is documented. A config that is already there is kept unless you
name a layout: a run meant for the agents does not fail over a file nobody asked to
replace. `--agents` without `--layout` leaves the configuration out of the run
entirely, so such a run never creates one either. Naming one and passing `--force` replaces it through a temporary file
and a single rename, so a crash cannot leave `up` reading half a config.

### The skill

The skill teaches the agent one command, `termwire open <path>:<line>`. It costs
no process, which is the whole reason it replaced registering `@termwire/mcp`: an
MCP server lives for as long as the agent session, so a machine running a dozen
agents carried a dozen of them. The server is still published for an agent that
may not run shell commands; this command no longer registers it.

| Agent | Where the skill goes |
| --- | --- |
| Claude Code | `~/.claude/skills/termwire-open/SKILL.md` |
| OpenCode | `$XDG_CONFIG_HOME/opencode/skills/termwire-open/SKILL.md` |
| Codex | no skills — the line to add to `~/.codex/AGENTS.md` is printed |

An agent is offered only when its own directory exists, which is what proves it is
set up here; a name on `PATH` is not, because a version manager's shim outlives the
binary behind it. Nothing is ever written into an agent's configuration — the skill
is our own file in a directory the agent reads, and Codex's instructions stay yours
to edit.

The file ships as Markdown in this package, so you can read exactly what your agent
was told, and it ends with a marker line. A skill carrying that marker is ours and
gets upgraded silently when this package changes it — including a copy you edited but
left the marker in. Delete the line and the file becomes yours: `install` keeps it and
says so, and only `--force` replaces it.

### What it will not do

It cannot install the CLI itself, because `npx` runs from a cache it does not own,
and it does not touch the tmux cleanup hook, which `up` installs from a stable
path. Every question is asked before the plan is confirmed, and nothing is written
until then. Re-running changes only what has actually changed.

## `up`

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
is changed only when `--branch` is present. Existing tmux sessions attach without Git mutations or
rereading/reconciling configuration.

## Session cleanup

`up` installs one global tmux hook, `session-closed`, that runs a hidden
`termwire _reap <session>` for the session that just closed. Without it,
processes started in a workspace outlive `tmux kill-session`: tmux only sends
`SIGHUP` to the foreground process group of each pane, so a background agent job
detached from the terminal is adopted by `init` and keeps running for weeks.

The reap finds every process of the current user whose environment still carries
`TERMWIRE_SESSION=<session>` (from `ps -E` on macOS, from `/proc` on Linux),
sends `SIGTERM`, waits two seconds, confirms the survivors still carry the label,
then escalates them to `SIGKILL`. It signals that list of pids and nothing else,
never a pattern match. The tmux server and everything it descends from are never
signalled, even when the server's own environment carries the label.

Each run appends one line to `$XDG_STATE_HOME/termwire/reap.log`, defaulting to
`~/.local/state/termwire/reap.log`, because a tmux hook's output is not shown
anywhere. The reap inherits the tmux server's environment, so `XDG_STATE_HOME`
is read as the server saw it when it started, not as your current shell exports
it. The log is never rotated; it gains one line per session close.

Installing the hook is idempotent: a repeated `up` updates our entry when the
interpreter or script path changed, drops duplicates of ours, and leaves any
`session-closed` hook you configured yourself in place. When the tmux server
refuses the hook, `up` warns and still brings the workspace up.

Two things escape the reap. A process that clears or rewrites its own
environment no longer carries the label, and on macOS the kernel hides the
environment of Apple's own signed binaries, so a bare `sleep` started in a pane
is invisible to `ps -E` while a `node` or `pnpm` process is not. Everything that
does carry the label is killed, including processes you started in the session
yourself; for a session you are closing, that is the point.

One false positive is possible on macOS, where `ps -E` flattens the environment
into a single line: a process holding `TERMWIRE_SESSION=<session>` inside the
*value* of another variable, a captured command line for instance, is
indistinguishable from one that carries the label itself. Linux reads `/proc`
and matches exactly.

The hook records the absolute path of the interpreter and script that installed
it, and the next `up` rewrites it when either moved. A path that disappears
without a further `up`, after `npx` prunes its cache for example, leaves a hook
that silently does nothing. Remove it by index:

```bash
tmux show-hooks -g | grep TERMWIRE_REAP_HOOK   # e.g. session-closed[1]
tmux set-hook -gu 'session-closed[1]'
```

## `open`

```bash
termwire open <target>
termwire open <target> --line <number>
```

Opens a file in the Neovim of the current workspace and focuses the editor
pane. A trailing `:<line>` in the target selects a line, so `src/app.ts:42`
opens line 42. With `--line`, the target is used verbatim, which is the way to
open a file whose name ends in a colon and digits. Relative paths resolve from
the current directory. On success the command prints the absolute path it
opened.

| Invocation | Opens |
| --- | --- |
| `termwire open src/app.ts` | `src/app.ts`, no line jump |
| `termwire open src/app.ts:42` | `src/app.ts` at line 42 |
| `termwire open src/app.ts -l 42` | `src/app.ts` at line 42 |
| `termwire open weird:42 -l 7` | the file named `weird:42`, at line 7 |

The command reads `TERMWIRE_SOCKET` and `TERMWIRE_EDITOR_PANE` from its
environment, so it works only in a shell created by `termwire up`. Errors are
reported without a stack trace:

- `not inside a termwire workspace`: `TERMWIRE_SOCKET` is missing.
- `nvim is not responding on socket ...`: the workspace Neovim is gone.
- `line must be a positive integer`, `path must not be empty`: bad target.

Pane focus is skipped when `TERMWIRE_EDITOR_PANE` is absent; opening still
succeeds. This is what makes the command useful to a coding agent: it needs no
integration beyond permission to run a shell command.

## Layout configuration

TermWire discovers optional JSONC files in this order:

1. Global: `$XDG_CONFIG_HOME/termwire/config.jsonc`, or
   `~/.config/termwire/config.jsonc` when `XDG_CONFIG_HOME` is unset.
2. Project: `<resolved-workspace-git-root>/.termwire.jsonc`. For `up -w`, this
   is the resolved target worktree's file, not the invoking checkout's file.

Both present files are validated. Project `windows` fully replace global
`windows`; they are never merged. A version-only project file falls through to
global windows, and a version-only global file falls through to the exact
default layout:

```json
{
  "windows": [
    { "name": "editor", "panes": [{ "id": "editor", "role": "editor" }] },
    { "name": "shell", "panes": [{ "id": "shell" }] }
  ]
}
```

When neither source provides `windows`, that same editor-then-shell two-window
default is used.

### Schema

Each configuration root is an object with required numeric `"version": 1`,
optional nonempty-string `"$schema"` for future compatibility, and optional
`windows`; unknown keys are rejected at every level. `windows`, when provided,
is a nonempty array of uniquely named window objects. Each window has only
`name` and a nonempty `panes` array. Pane ids are nonempty and unique within
their window.

A pane may contain only `id`, `role`, `command`, `splitFrom`, `direction`, and
`sizePercent`:

- `role`, when present, is only `"editor"`. Exactly one editor exists across
  the effective layout, and it cannot have a `command`.
- `command`, when present, is a nonempty argv array of nonempty strings. Shell
  command strings are not supported.
- The first pane of a window has no split fields. Every later pane must name an
  earlier pane in the same window with `splitFrom` and set `direction` to
  `"horizontal"` or `"vertical"`. An optional `sizePercent` is an integer from
  1 through 99.

This release provides no official JSON Schema file or URL, generation command,
publishing, autocomplete, or editor integration. `$schema` is accepted for
future compatibility only; it does not point to a TermWire-provided artifact.

Panes are created in declaration order. This valid multi-window example has one
editor and demonstrates argv commands and ordered splits:

```jsonc
// ~/.config/termwire/config.jsonc or .termwire.jsonc
{
  "version": 1,
  "windows": [
    {
      "name": "editor",
      "panes": [
        { "id": "editor", "role": "editor" },
        {
          "id": "watch",
          "splitFrom": "editor",
          "direction": "vertical",
          "sizePercent": 35,
          "command": ["bun", "run", "dev"],
        },
      ],
    },
    {
      "name": "shell",
      "panes": [
        { "id": "shell", "command": ["zsh", "-l"] },
        {
          "id": "tests",
          "splitFrom": "shell",
          "direction": "horizontal",
          "sizePercent": 40,
          "command": ["bun", "test"],
        },
      ],
    },
  ],
}
```

JSONC comments and trailing commas are accepted. There is no interpolation,
custom pane cwd, custom pane environment, shell-string command syntax, or
configuration/state persistence beyond reading these optional files for a new
session.

### Layout cookbook

#### Default: editor and shell

Use two simple windows when you want the editor and an ordinary shell kept separate.

```text
[editor]              [shell]
┌──────────────────┐  ┌──────────────────┐
│ editor           │  │ shell            │
└──────────────────┘  └──────────────────┘
```

```jsonc
{
  "version": 1,
  "windows": [
    {
      "name": "editor",
      "panes": [{ "id": "editor", "role": "editor" }],
    },
    {
      "name": "shell",
      "panes": [{ "id": "shell" }],
    },
  ],
}
```

#### Three-window workflow

Use independent windows when you want to move between editing, AI work, and a shell.
The `ai` window is an ordinary shell and does not start a command automatically.

```text
[editor]              [ai]                  [shell]
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ editor           │  │ ai (shell)       │  │ shell            │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

```jsonc
{
  "version": 1,
  "windows": [
    {
      "name": "editor",
      "panes": [{ "id": "editor", "role": "editor" }],
    },
    {
      "name": "ai",
      "panes": [{ "id": "ai" }],
    },
    {
      "name": "shell",
      "panes": [{ "id": "shell" }],
    },
  ],
}
```

#### Focused coding

Keep editing, OpenCode, and watched tests visible together in one `work` window.

```text
[work]
┌───────────────────────────┬──────────────────┐
│ editor                    │ ai               │
│                           │ opencode         │
│                           │                  │
│                           ├──────────────────┤
│                           │ tests (new: 40%) │
│                           │ bun test --watch │
└───────────────────────────┴──────────────────┘
                            right side: 40%
```

```jsonc
{
  "version": 1,
  "windows": [
    {
      "name": "work",
      "panes": [
        { "id": "editor", "role": "editor" },
        {
          "id": "ai",
          "splitFrom": "editor",
          "direction": "horizontal",
          "sizePercent": 40,
          "command": ["opencode"],
        },
        {
          "id": "tests",
          "splitFrom": "ai",
          "direction": "vertical",
          "sizePercent": 40,
          "command": ["bun", "test", "--watch"],
        },
      ],
    },
  ],
}
```

#### Full-stack

Separate code, the development server, and a spare shell while keeping watched tests under the
editor.

```text
[code]                 [server]               [shell]
┌──────────────────┐  ┌────────────────────┐  ┌──────────────────┐
│ editor           │  │ server             │  │ shell            │
│                  │  │ bun run dev        │  │                  │
│                  │  │                    │  │                  │
│                  │  │                    │  │                  │
│                  │  │                    │  │                  │
├──────────────────┤  │                    │  │                  │
│ tests (new: 35%) │  │                    │  │                  │
│ bun test --watch │  │                    │  │                  │
│                  │  │                    │  │                  │
└──────────────────┘  └────────────────────┘  └──────────────────┘
```

```jsonc
{
  "version": 1,
  "windows": [
    {
      "name": "code",
      "panes": [
        { "id": "editor", "role": "editor" },
        {
          "id": "tests",
          "splitFrom": "editor",
          "direction": "vertical",
          "sizePercent": 35,
          "command": ["bun", "test", "--watch"],
        },
      ],
    },
    {
      "name": "server",
      "panes": [{ "id": "server", "command": ["bun", "run", "dev"] }],
    },
    {
      "name": "shell",
      "panes": [{ "id": "shell" }],
    },
  ],
}
```

`horizontal` means left/right, `vertical` means top/bottom, and `sizePercent` applies to the new
pane. Layouts affect only newly created sessions; attaches are unchanged. The OpenCode and Bun
commands are replaceable examples.

### Errors and session behavior

JSONC parse errors identify the source and one-based line and column. Schema
errors identify the source and JSON path; unreadable existing files retain their
original error as the cause. After workspace/worktree resolution, configuration
is loaded and validated before socket or tmux session side effects. Once a new
session exists, layout or attach failure triggers best-effort session cleanup
while preserving the original failure.

## Runtime behavior

- `up <name>` starts the editor as `nvim --listen <socket>` and uses a pane's
  argv command, or tmux's default shell when an ordinary pane has no command.
  Final processes receive `TERMWIRE_SESSION`, `TERMWIRE_SOCKET`, and
  `TERMWIRE_EDITOR_PANE`.
- The default layout does not start OpenCode automatically. Users may start it manually in an
  ordinary shell pane, or configure `["opencode"]` as a pane command. They may also reshape the
  workspace with tmux after creation.
- Closing a workspace session kills the processes it started, through the global
  tmux `session-closed` hook that `up` installs.
- `open <target>` resolves the path, checks that Neovim answers on the socket,
  opens the file, then focuses the editor pane when one is known.
- `install` writes files and reads directories; it starts no process of its own and
  runs no other tool's CLI.
- The CLI does not need to be in `PATH` for the MCP server or the OpenCode plugin,
  which compose the nvim and tmux adapters directly. The skill is the opposite case:
  it tells the agent to run `termwire open`, so there the CLI does have to be on
  `PATH`.

## Dependencies

Commander 15 parses the commands; `jsonc-parser` handles JSONC parsing and diagnostics;
Zod 4 provides strict structural config validation; `@clack/prompts` and
`@clack/core` draw the `install` prompts, loaded only when there is a terminal to
draw on. All of them are direct runtime dependencies.
`@termwire/tmux` and `@termwire/nvim` are thin adapters over their binaries;
the CLI owns workspace policy and orchestration.

## Alternatives for opening files

The skill `install` writes is the cheap path: the agent runs one shell command and
nothing stays resident. `@termwire/mcp` exposes the same operation as an MCP tool
and `@termwire/opencode-plugin` as a native OpenCode tool; both remain published
for an agent that may not run shell commands. The MCP server is the only one that
costs a process per agent session. Configure exactly one of the three — two means
the agent sees the same tool twice.

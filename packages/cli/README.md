# @termwire/cli

Requires Bun >=1.3.14, tmux >=3.2, and Neovim >=0.9.

```bash
bun add --global @termwire/cli
termwire --help
termwire up dev
```

The project's main entry point — the `termwire` command. It orchestrates the
other packages. Runtime workspace identity is stateless and lives in the
environment variables set by `termwire up <name>`; layout configuration is
optional JSONC, not persistent workspace state.

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
is changed only when `--branch` is present. Existing tmux sessions attach without Git mutations or
rereading/reconciling configuration.

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
- The CLI has no shell-facing `open` command and does not need to be in `PATH`
  for the plugin: the plugin composes the nvim and tmux adapters directly.

## Dependencies

Commander 15 parses `up`; `jsonc-parser` handles JSONC parsing and diagnostics;
Zod 4 provides strict structural config validation. All three are direct runtime
dependencies.
`@termwire/tmux` and `@termwire/nvim` are thin adapters over their binaries;
the CLI owns workspace policy and orchestration.

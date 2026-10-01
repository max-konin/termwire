# Termwire

Run a coding agent and your editor side by side in tmux, and let the agent show
you the file it is talking about.

`termwire up` creates a tmux workspace with Neovim already listening on an RPC
socket. Every process in that workspace inherits the socket address, so a
coding agent running in one pane can open a file at a line in the Neovim
running in another pane. Add `-w` and the workspace gets its own Git worktree,
so several agents work on several branches at once without fighting over one
checkout.

No Neovim plugin is involved. Termwire talks to Neovim over its built-in remote
RPC.

```bash
npm install -g @termwire/cli

termwire up dev                 # workspace in the current directory
termwire up fix/login -w        # workspace in a sibling worktree on that branch
termwire open src/app.ts:42     # jump the editor to that line
```

## Requirements

- Node 22.12 or newer
- tmux 3.2 or newer
- Neovim 0.9 or newer

Bun works too and is what the repository is developed with, but nothing
published here requires it.

## Setup

```bash
npx @termwire/cli install
```

Picks a layout — the window arrangement is drawn beside the list as you move
through it — writes it to `~/.config/termwire/config.jsonc` or the repository's
`.termwire.jsonc`, and installs a `termwire-open` skill for the agents you
select. Everything it does is also a flag, and a run whose flags
leave nothing to ask never prompts: `termwire install --layout focused --agents claude`. See
[the CLI README](packages/cli/README.md#install) for what it will not do.

## The workspace

`termwire up <name>` creates or attaches to the tmux session
`<project>-<name>`. A new session gets two windows: `editor`, running
`nvim --listen /tmp/termwire/<session>.sock`, and `shell`. Running the same
command again attaches to the existing session and changes nothing else.

Every process in the workspace inherits three variables:

| Variable | Meaning |
| --- | --- |
| `TERMWIRE_SESSION` | tmux session name |
| `TERMWIRE_SOCKET` | Neovim RPC socket path |
| `TERMWIRE_EDITOR_PANE` | tmux pane id of the editor pane |

This is the whole of Termwire's state. Nothing is written to disk, so there is
no state file to go stale and no cleanup step beyond `tmux kill-session` and
`git worktree remove`.

`up` also installs one global tmux `session-closed` hook, so closing a session
kills everything started in it, including background agent jobs that outlive
`kill-session` on their own. Installing it again never duplicates it and never
removes a `session-closed` hook of your own. See
[the CLI README](packages/cli/README.md#session-cleanup) for what is killed and
what escapes.

Termwire does not start an agent for you. Start one in the `shell` window, or
declare it as a pane command in a layout file.

## Worktrees

| Command | Workspace directory | Git branch |
| --- | --- | --- |
| `termwire up dev` | current directory | unchanged |
| `termwire up dev -b feature/api` | current directory | switch to it, or create it from `HEAD` |
| `termwire up chore/improve -w` | sibling `<project>-chore-improve` | `chore/improve` |
| `termwire up dev -w legacy` | sibling `<project>-legacy` | `legacy` |
| `termwire up dev -w -b feature/api` | sibling `<project>-dev` | `feature/api` |

The session name always decides the tmux identity. A bare `-w` derives the
worktree directory and the branch from the session name. Slashes survive in Git
branch names and are replaced only in directory names. Attaching to an existing
session never touches Git.

## Opening files from an agent

`termwire open <path>[:line]` opens the file in the workspace Neovim and
focuses the editor pane. A trailing `:42` selects the line; `--line 42` does
the same and leaves the path untouched, which matters for a filename that ends
in a colon and digits.

The command needs `TERMWIRE_SOCKET`, so the agent must run in a shell created
by `termwire up`. Outside a workspace it fails with `not inside a termwire
workspace`.

Any agent that can run a shell command can use it, and `termwire install` is
what tells yours how. It writes a `termwire-open` skill where the agent looks for
skills — `~/.claude/skills/termwire-open/SKILL.md` for Claude Code,
`$XDG_CONFIG_HOME/opencode/skills/` for OpenCode. Codex has no skills, so the
command prints the one line to add to `~/.codex/AGENTS.md` instead:

```markdown
To show the user a file, run `termwire open <path>:<line>`.
```

A skill costs nothing to keep: the agent runs one command when it has a file
worth showing. Allow it once, with a rule like `Bash(termwire open:*)`, and the
approval prompt stops too.

For an agent that may not run shell commands at all, `@termwire/mcp` exposes the
same operation as an MCP tool and `@termwire/opencode-plugin` as a native OpenCode
tool. Both are still published, and the MCP server is the one thing here that costs
a process: it lives for as long as the agent session does, so a machine running a
dozen agents carries a dozen of them. Prefer the skill, and configure exactly one
of the three — two means the agent sees the same tool twice.

```bash
npm install -g @termwire/mcp
claude mcp add termwire -- termwire-mcp
```

Register it from inside a Termwire shell, so the server inherits the socket, and
point it at the installed binary rather than `npx -y @termwire/mcp`: a package
runner stays alive beside every server it launched.

## Layouts

A new session uses the default editor-and-shell layout unless a JSONC file says
otherwise. Termwire reads `$XDG_CONFIG_HOME/termwire/config.jsonc` (or
`~/.config/termwire/config.jsonc`) and `.termwire.jsonc` in the workspace Git
root. A project file's `windows` replace the global ones rather than merging.

```jsonc
{
  "version": 1,
  "windows": [
    {
      "name": "work",
      "panes": [
        { "id": "editor", "role": "editor" },
        {
          "id": "agent",
          "splitFrom": "editor",
          "direction": "horizontal",
          "sizePercent": 40,
          "command": ["opencode"],
        },
      ],
    },
  ],
}
```

Exactly one pane carries `role: "editor"`, and that pane runs Neovim. Layouts
apply only when a session is created. The [CLI
reference](packages/cli/README.md#layout-configuration) has the full schema and
a layout cookbook.

## Packages

| Package | What it is |
| --- | --- |
| [`@termwire/cli`](packages/cli/README.md) | the `termwire` command: `up` and `open` |
| [`@termwire/mcp`](packages/mcp/README.md) | MCP server exposing `termwire_open` |
| [`@termwire/opencode-plugin`](packages/opencode-plugin/README.md) | native OpenCode tool |
| [`@termwire/tmux`](packages/tmux/README.md) | typed tmux adapter |
| [`@termwire/nvim`](packages/nvim/README.md) | typed Neovim RPC adapter |

## Development

```bash
bun install
bun run lint
bun test
bunx tsc --noEmit
bun run build
bun run verify:node
bun packages/cli/bin/termwire.ts up dev
```

The repository is developed with Bun, but every published package must run on
Node. `bun run verify:node` executes the built CLI and MCP server under Node
and fails on a Bun-only API or an extensionless relative import. CI runs it on
every push.

Run `bun run hooks:install` once to opt into the local pre-commit hook. It
formats staged files, applies safe Biome fixes, then runs lint and tests.
Partial staging is rejected, because a staged file with unstaged changes cannot
be checked honestly. Hooks are bypassable, so CI stays authoritative. See
[releasing](RELEASING.md) for the publish flow.

[`PDR.md`](PDR.md) and [`ROADMAP.md`](ROADMAP.md) record design intent and are
not a description of what ships today.

## License

MIT

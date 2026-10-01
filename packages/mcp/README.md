# @termwire/mcp

An MCP server that opens a file in the current Termwire workspace's Neovim and
focuses the tmux editor pane.

It exists for agents that should not run shell commands. If your agent can run
a shell command, `termwire open <path>:<line>` from
[`@termwire/cli`](../cli/README.md) does the same thing with nothing to
configure. Use one of them, not both, or the agent sees two identical tools.

## Requirements

- Node 22.12 or newer
- tmux 3.2 or newer, for editor-pane focus
- Neovim 0.9 or newer
- a shell created by `termwire up <name>`

The server reads `TERMWIRE_SOCKET` from its own environment, so the MCP client
must be started inside that Termwire shell. When `TERMWIRE_EDITOR_PANE` is also
present, the server focuses that pane after opening; without it, opening still
succeeds.

## When to use this

`@termwire/cli` installs a `termwire-open` skill that teaches an agent to run
`termwire open` directly, and that costs no process at all. Prefer it. This server
exists for an agent that may not run shell commands: it is one process per agent
session, alive for as long as the session is.

## Install

Install it and register the binary. `npx -y @termwire/mcp` works, but a package
runner does not exec away: it stays as a parent process for as long as the server
runs, so every agent that registers the runner pays for an extra idle process.

Install it, then register `termwire-mcp` as the command:

```bash
npm install -g @termwire/mcp
```

Or register `npx -y @termwire/mcp` and skip the install, at the cost of one extra
process beside every server. Do not run either line by hand to "test" it: the server
speaks MCP over stdio and will sit there waiting.

Do not register `bunx @termwire/mcp` as the command. `bunx` caches into
`$TMPDIR`, and on macOS the `com.apple.bsd.dirhelper` job runs nightly at 03:35
and deletes anything there unread for three days. It removes the files and
leaves the directories, so `bunx` sees an install that looks present, skips
re-downloading, and the server dies at startup with `Cannot find module
'@modelcontextprotocol/sdk/server/stdio.js'`. The `npx` cache lives under
`~/.npm` and is never swept.

This applies to any long-lived registration, not just this server. Point MCP
configs, launch agents, and cron jobs at a durable install, never at a package
runner that caches into a temporary directory.

## Tool

```text
termwire_open({ path: string, line?: positive integer })
```

`path` is required, trimmed, and may be relative or absolute. Relative paths
resolve from the MCP process working directory. Opening is always explicit. The
server does not track files and never opens one on its own.

## Claude Code

```bash
claude mcp add termwire -- termwire-mcp
```

Run this from a Termwire shell, then confirm with `claude mcp list` or `/mcp`.

For source development in this repository:

```bash
claude mcp add termwire -- bun packages/mcp/bin/termwire-mcp.ts
```

## OpenCode

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "termwire": {
      "type": "local",
      "command": ["npx", "-y", "@termwire/mcp"],
      "enabled": true
    }
  }
}
```

OpenCode can also use the native
[`@termwire/opencode-plugin`](../opencode-plugin/README.md), which needs no
separate process. Configure one or the other.

## Errors

- `not inside a termwire workspace`: `TERMWIRE_SOCKET` is missing, which
  usually means the client was not started from a Termwire shell.
- `nvim is not responding on socket ...`: the workspace Neovim is gone.
- Neovim and tmux command failures are returned unchanged as MCP tool errors.

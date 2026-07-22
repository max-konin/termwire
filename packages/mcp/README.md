# @termwire/mcp

A local stdio MCP server that explicitly opens a requested file in the current
Termwire workspace's Neovim and, when available, focuses its tmux editor pane.

## Requirements

- Bun 1.3.14 or newer
- tmux 3.2 or newer for editor-pane focus
- Neovim 0.9 or newer
- a shell created by `termwire up <name>`

Start the MCP client inside that Termwire shell so the server inherits the
required `TERMWIRE_SOCKET`. When `TERMWIRE_EDITOR_PANE` is also present, the
server focuses that tmux pane after opening the file; without it, opening still
succeeds without tmux focus.

## Tool

```text
termwire_open({ path: string, line?: positive integer })
```

`path` is required, trimmed, and may be relative or absolute. Relative paths
resolve from the MCP process working directory. Opening is always explicit; the
server does not track files or open them automatically.

## Claude Code

```bash
claude mcp add termwire -- bunx @termwire/mcp
```

Use `claude mcp list` or `/mcp` to confirm the connection.

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
      "command": ["bunx", "@termwire/mcp"],
      "enabled": true
    }
  }
}
```

The native `@termwire/opencode-plugin` remains available. Configure either the
native plugin or this MCP server to avoid duplicate file-opening tools.

## Errors

- `not inside a termwire workspace`: the required `TERMWIRE_SOCKET` is missing.
- `nvim is not responding on socket ...`: workspace Neovim is unavailable.
- Neovim and tmux command errors are returned unchanged as MCP tool errors.

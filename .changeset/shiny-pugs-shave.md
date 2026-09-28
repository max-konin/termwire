---
"@termwire/opencode-plugin": minor
"@termwire/cli": minor
"@termwire/mcp": minor
"@termwire/nvim": minor
"@termwire/tmux": minor
---

Add the `termwire open <target>` command, which opens a file in the workspace
Neovim and focuses the editor pane. A trailing `:<line>` selects a line, and
`--line` keeps the target verbatim for filenames that end in a colon and
digits. This gives any agent that can run a shell command the same capability
as the MCP server and the OpenCode plugin, with nothing to configure.

Correct the OpenCode plugin's out-of-workspace error to `not inside a termwire
workspace`, matching the CLI and the MCP server.

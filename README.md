# Termwire

Termwire requires Bun >=1.3.14, tmux >=3.2, and Neovim >=0.9. OpenCode is
required for the plugin.

```bash
bun add --global @termwire/cli
termwire --help
termwire up dev
```

The CLI currently owns only `up <name>` and its worktree and branch options.
File opening is the explicit `termwire_open({ path, line? })` OpenCode plugin
tool.

## `up` command

| Command | Workspace | Git branch |
| --- | --- | --- |
| `termwire up dev` | Current directory | Unchanged |
| `termwire up chore/improve -w` | Sibling `<project>-chore-improve` | `chore/improve` |
| `termwire up dev -b feature/api` | Current directory | Switch to it, or create it from the current `HEAD` |
| `termwire up dev -w -b feature/api` | Sibling `<project>-dev` | `feature/api` |
| `termwire up dev -w legacy` | Sibling `<project>-legacy` | `legacy` |
| `termwire up dev -w legacy -b feature/api` | Sibling `<project>-legacy` | `feature/api` |

The session name always determines the tmux identity. A bare `-w` derives the
worktree directory and branch from the session name. Slashes are preserved in
Git branch names but sanitized in worktree directory names. `--branch` changes
only the branch, while the optional `-w <name>` value changes the worktree
directory key. Attaching to an existing tmux session never changes Git state.

## Optional layout setup

For a new session, place a JSONC layout in
`$XDG_CONFIG_HOME/termwire/config.jsonc` (or
`~/.config/termwire/config.jsonc`) or in the resolved workspace Git root as
`.termwire.jsonc`. Project windows replace global windows. See the
[CLI configuration reference](packages/cli/README.md#layout-configuration) for
the strict `version: 1` schema and examples.

See [CLI](packages/cli/README.md), [tmux](packages/tmux/README.md),
[Neovim](packages/nvim/README.md), [plugin](packages/opencode-plugin/README.md),
and [releasing](RELEASING.md).

## Development

```bash
bun ci
bun run lint
bun test
bunx tsc --noEmit
bun run build
```

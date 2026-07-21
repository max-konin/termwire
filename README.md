# Termwire

Termwire requires Bun >=1.3.14, tmux >=3.2, and Neovim >=0.9. OpenCode is
required for the plugin.

```bash
bun add --global @termwire/cli
termwire --help
termwire up dev
```

The CLI currently owns only `up <name>` and its worktree option. File opening
is the explicit `termwire_open({ path, line? })` OpenCode plugin tool.

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

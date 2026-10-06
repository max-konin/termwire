# @termwire/opencode-plugin

## 0.6.0

### Patch Changes

- Updated dependencies [cfdcc19]
  - @termwire/tmux@0.6.0
  - @termwire/nvim@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [29af197]
  - @termwire/tmux@0.5.0
  - @termwire/nvim@0.5.0

## 0.4.1

### Patch Changes

- @termwire/tmux@0.4.1
- @termwire/nvim@0.4.1

## 0.4.0

### Patch Changes

- Updated dependencies [7e73a29]
  - @termwire/tmux@0.4.0
  - @termwire/nvim@0.4.0

## 0.3.0

### Minor Changes

- f57c480: Run on Node instead of requiring Bun. Every package now spawns through
  `node:child_process`, emits explicit `.js` extensions on relative imports, and
  ships a `#!/usr/bin/env node` entry point. `engines` declares `node >=22.12.0`,
  the floor set by Commander 15.

  The published CLI and MCP server previously failed under Node with
  `ERR_MODULE_NOT_FOUND` and had no test covering it. `bun run verify:node`
  executes both built artifacts under Node, and CI runs it on every push.

  This makes `npx -y @termwire/mcp` the recommended MCP registration. Unlike
  `bunx`, the `npx` cache lives under `~/.npm` and is not swept by the nightly
  macOS temporary-directory cleanup that silently broke the server.

  Emitted type declarations are now typed against `@types/node` alone and no
  longer reference Bun types.

  The repository is still developed with Bun. Only the published output changed.

- f57c480: Add the `termwire open <target>` command, which opens a file in the workspace
  Neovim and focuses the editor pane. A trailing `:<line>` selects a line, and
  `--line` keeps the target verbatim for filenames that end in a colon and
  digits. This gives any agent that can run a shell command the same capability
  as the MCP server and the OpenCode plugin, with nothing to configure.

  Correct the OpenCode plugin's out-of-workspace error to `not inside a termwire
workspace`, matching the CLI and the MCP server.

### Patch Changes

- Updated dependencies [f57c480]
- Updated dependencies [f57c480]
  - @termwire/nvim@0.3.0
  - @termwire/tmux@0.3.0

## 0.2.2

### Patch Changes

- Updated dependencies [f65db71]
  - @termwire/tmux@0.2.2
  - @termwire/nvim@0.2.2

## 0.2.1

### Patch Changes

- Updated dependencies [eec1451]
  - @termwire/tmux@0.2.1
  - @termwire/nvim@0.2.1

## 0.2.0

### Patch Changes

- Updated dependencies [6f485f3]
  - @termwire/tmux@0.2.0
  - @termwire/nvim@0.2.0

## 0.1.2

### Patch Changes

- @termwire/tmux@0.1.2
- @termwire/nvim@0.1.2

## 0.1.1

### Patch Changes

- Correct published internal dependency ranges so external Bun installs resolve Termwire packages.
  - @termwire/tmux@0.1.1
  - @termwire/nvim@0.1.1

## 0.1.0

### Minor Changes

- 5d73919: Initial public release with compiled Bun packages and npm-ready metadata.

### Patch Changes

- Updated dependencies [5d73919]
  - @termwire/tmux@0.1.0
  - @termwire/nvim@0.1.0

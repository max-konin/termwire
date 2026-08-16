# @termwire/cli

## 0.2.1

### Patch Changes

- eec1451: Termwire new sessions now set the outer terminal title from the tmux session name, and the tmux adapter exposes built-in layout selection.
- Updated dependencies [eec1451]
  - @termwire/tmux@0.2.1
  - @termwire/nvim@0.2.1

## 0.2.0

### Minor Changes

- 6f485f3: Add configurable tmux window and pane layouts for new workspaces.

  Support optional global and project JSONC configuration, strict Zod validation,
  explicit editor pane selection, and deferred pane command startup with complete
  workspace environment variables.

### Patch Changes

- Updated dependencies [6f485f3]
  - @termwire/tmux@0.2.0
  - @termwire/nvim@0.2.0

## 0.1.2

### Patch Changes

- Add explicit Git branch selection to `termwire up`, preserve slashes in branch names, and document
  the default branch and worktree derivation rules.
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

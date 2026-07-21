# Preserve Worktree Branch Slashes

## Goal

`termwire up <session-name> -w` must continue deriving the worktree from the session name
without requiring a separate worktree name. When the name contains a slash, such as
`chore/improve`, the Git branch must preserve that slash exactly.

## CLI Contract

The existing CLI syntax remains unchanged:

```sh
termwire up chore/improve -w
```

This command creates or reuses:

- Git branch `chore/improve`;
- a filesystem-safe sibling worktree directory such as `../project-chore-improve`;
- the existing sanitized tmux session identity.

Explicit worktree names supported by the current optional-value flag remain compatible.

## Design

`prepareWorktree` will treat the requested name as two related values:

1. The original name is the Git branch name and is passed unchanged to Git and branch conflict
   checks.
2. A sanitized component is used only when constructing the worktree directory path.

Names without slashes retain their current behavior and paths. Existing worktree registration,
repository identity, detached-head, locked, prunable, and occupied-path checks remain unchanged.

## Error Handling

Git remains the authority for branch-name validity. If the unchanged name is not a valid Git
branch, worktree creation fails with the existing Git command error rather than silently changing
the requested branch.

## Verification

Focused tests will verify that `chore/improve`:

- creates branch `chore/improve` at the safe path `../project-chore-improve`;
- reuses a matching registered worktree;
- detects when that exact branch is checked out elsewhere;
- does not regress existing worktree names without slashes.

The CLI README will document that `-w` derives the branch from the session name while sanitizing
only the worktree directory path.

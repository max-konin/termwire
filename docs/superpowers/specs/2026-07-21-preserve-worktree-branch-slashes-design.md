# Worktree and Branch Selection

## Goal

`termwire up` must derive sensible worktree and branch defaults from the session name while also
allowing an explicit Git branch override. Git branch names preserve slashes exactly; only
filesystem path components are sanitized.

## CLI Contract

The existing CLI syntax remains compatible and gains a required-value branch option:

```sh
termwire up chore/improve -w
termwire up session -w --branch feature/api
termwire up session --branch feature/api
```

The option is exposed as `-b, --branch <name>`. It changes only the Git branch and never changes
the tmux session identity or the derived worktree directory.

Existing optional worktree names remain supported for compatibility.

## Selection Algorithm

| Command | Workspace directory | Git branch behavior |
| --- | --- | --- |
| `up chore/improve` | Current directory | Keep the current branch unchanged |
| `up chore/improve -w` | `../project-chore-improve` | Create or reuse `chore/improve` |
| `up session -w -b feature/api` | `../project-session` | Create or reuse `feature/api` |
| `up session -b feature/api` | Current directory | Switch to `feature/api`, creating it when absent |
| `up session -w legacy-name` | `../project-legacy-name` | Create or reuse `legacy-name` |
| `up session -w legacy-name -b feature/api` | `../project-legacy-name` | Create or reuse `feature/api` |

The effective worktree directory key is the explicit optional value passed to `-w`, or otherwise
the session name. The effective branch is `--branch` when supplied, otherwise the worktree
directory key. Without `-w`, no branch operation occurs unless `--branch` is supplied.

## Design

The request model gains an optional `branch` value. Worktree preparation receives the directory
key and effective branch as distinct values:

1. The directory key is sanitized only when constructing the sibling worktree path.
2. The effective branch is passed unchanged to Git and all registration, reuse, and conflict
   checks.

Names without slashes retain their current behavior and paths. Existing worktree registration,
repository identity, detached-head, locked, prunable, and occupied-path checks remain unchanged.

Without `-w`, branch preparation runs in the current directory before tmux session creation. It
checks whether the branch exists, switches to it when present, and otherwise creates and switches
to it from the current `HEAD`.

The existing-session fast path remains first: attaching to an existing tmux session performs no
Git mutation and no worktree preparation.

## Error Handling

Git remains the authority for branch-name validity and checkout safety. Invalid names, dirty-tree
checkout failures, and branches already checked out in another worktree fail with the Git error
rather than silently changing the requested branch or path.

## Verification

Focused tests will verify:

- parser support for `-b` and `--branch`, including missing-value errors and combinations with
  `-w`;
- creation and reuse of branch `chore/improve` at the safe path `../project-chore-improve`;
- independent worktree directory and branch overrides;
- creation or switching of an explicit branch in the current directory without `-w`;
- branch conflict detection using the exact slash-preserving name;
- no Git mutation when attaching to an existing tmux session;
- compatibility with explicit optional worktree names and names without slashes.

The CLI README and command help will document the option and the complete default selection
algorithm above.

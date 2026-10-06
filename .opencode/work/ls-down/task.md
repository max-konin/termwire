# Task: `termwire ls` and `termwire down`

## Why

The README sells several agents working on several branches at once, and the
demo shows a worktree being created. Tearing one down is still `tmux
kill-session` plus `git worktree remove`, typed by hand. A tool that creates
workspaces owes the user a way to list them and a way to remove them.

`PDR.md` currently lists both under *Future ideas*, a section that says those
ideas must not shape the architecture. They now do, so that entry moves out as
part of this work.

## Scope

In: two CLI commands, the tmux adapter calls they need, and optionally resident
memory in the process scanner.

Out: `doctor`, `status`, anything persisted to disk, a TUI, live refresh. `ls`
prints a table once and exits; it is not `htop`.

## `termwire ls`

Lists the workspaces on this machine.

A session counts as a workspace when its tmux session environment carries
`TERMWIRE_SESSION`, never because its name matches `<project>-<name>`. The user
chooses the name; `up` sets the label. Deriving the list from tmux and Git keeps
identity stateless, with no file to go stale.

```
SESSION          A  BRANCH        DIRECTORY                   PROCS   RSS
termwire-dev     *  master        ~/projects/termwire             7  1.2G
termwire-demo       demo          ~/projects/termwire-demo        4  780M
```

- `A` marks an attached session (`#{session_attached}`).
- `DIRECTORY` is `#{session_path}`, with `$HOME` shortened to `~`.
- `BRANCH` is `git -C <dir> branch --show-current`; a short sha on a detached
  HEAD, a dash outside a repository.
- No workspaces prints `no termwire workspaces` and exits 0. Empty is not an
  error.
- A labeled session whose directory is gone is listed and marked, never a crash.
- `--json` prints the same rows for machines.
- `PROCS` and `RSS` cost a walk over every process, so they are gathered only
  when they are going to be shown. See Phases.

## `termwire down <name>`

- Takes the same `<name>` as `up` and resolves it through `createIdentity`, so
  `up foo` and `down foo` always mean the same session.
- Kills the tmux session. It does not hunt processes: the global
  `session-closed` hook already runs `_reap` for exactly that.
- `-w, --worktree` also removes that workspace's worktree.
- Removing a worktree is refused when it holds uncommitted changes, unless
  `--force`. The branch is never deleted: a branch outlives its workspace.
- Refuses to remove the directory it is running in, and the main checkout.
- An unknown session fails with the same plain message style as the other
  commands, no stack trace.

## Code to touch

| File | What |
| --- | --- |
| `packages/tmux/src/session.ts` | add `listSessions` (`list-sessions -F` with a separator) and `showEnvironment` (`show-environment -t =<s>`), both on the injected `exec` |
| `packages/tmux/src/create-tmux.ts` | expose both on the factory. Do **not** add them to `index.ts`: the package entry stays `createTmux` plus its types |
| `packages/cli/src/workspaces.ts` (new) | collect and filter the list from tmux and Git, no side effects |
| `packages/cli/src/down.ts` (new) | the teardown, shaped like `up.ts` |
| `packages/cli/src/program.ts` | register the commands; `createLs` / `createDown` beside `createUp` |
| `PDR.md` | drop `down` and `ls` from Future ideas |

## House rules that apply

Dependencies are destructured in the parameter list, not in a first-line const.
No `dependencies.x ?? realThing` in production code: everything arrives through
`CliRuntime`, and tests build a fake one. Tests use fakes rather than a real
tmux or Git, and a `test.each` row per case rather than a loop inside one test.
More than one `try`/`catch` in a function means splitting it. Relative imports
carry `.js`, and nothing under `packages/*/src` touches a `Bun.*` API. Tests
reach internals by relative path, never through a package entry.

## Phases

1. **`ls` without `PROCS`/`RSS`, and `down`.** Most of the value for little
   cost: listing and teardown work, four columns.
2. **`PROCS` and `RSS`.** `process-scan.ts` finds labeled pids but collects no
   memory today. macOS runs `ps -E -o pid=,ppid=,command=`, so `rss=` has to
   join the format and `parseDarwinProcesses` and `DarwinProcessRow` follow;
   Linux reads `/proc/<pid>/stat` and `environ`, so resident pages come from
   `/proc/<pid>/statm`. `ProcessEntry` and both platforms' tests change with it.

## Acceptance

- `termwire up dev` then `termwire ls` shows `dev` with the right branch and
  directory; after `termwire down dev` it is gone.
- A session created by a plain `tmux new-session` with a similar name is **not**
  listed.
- `down -w` on a dirty worktree refuses and removes nothing; with `--force` it
  removes the worktree and leaves the branch.
- `bun run lint`, `bun test`, `bunx tsc --noEmit`, `bun run build` and
  `bun run verify:node` all pass.

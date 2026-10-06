---
"@termwire/cli": minor
"@termwire/tmux": minor
---

`termwire ls` and `termwire down`: the workspaces you have, and a way to put one away.

A tool that creates workspaces owes you a way to see them and a way to remove them.
Until now tearing one down was `tmux kill-session` plus `git worktree remove`, typed
by hand, and there was nothing at all that answered "what is running where".

```
$ termwire ls
SESSION          A  BRANCH        DIRECTORY                   PROCS   RSS
termwire-dev     *  master        ~/projects/termwire             7  1.2G
termwire-demo       demo          ~/projects/termwire-demo        4  780M
```

One row per workspace, printed once and then done: `ls` is not a monitor. `A` marks an
attached session, `BRANCH` is the Git branch of the session directory — a short sha on a
detached `HEAD`, `-` outside a repository — and `PROCS` and `RSS` count the processes
still carrying `TERMWIRE_SESSION=<session>`, from the same scan the reap uses, so a
background agent job is counted as well as a pane. A session whose directory is gone is
listed and marked `(missing)` rather than crashing the command, and no workspaces prints
`no termwire workspaces` and exits 0. `--json` prints the same rows for machines, with
absolute directories.

A session counts as a workspace when its tmux session environment carries
`TERMWIRE_SESSION`, never because its name looks like `<project>-<name>`: you pick the
name and `up` sets the label, so a session of your own is never listed by its name alone.
Nothing is read from disk — the list is derived from tmux and Git, so identity stays
stateless and there is no file to go stale.

```bash
termwire down dev              # kill the workspace session
termwire down                  # kill the workspace this shell is in
termwire down dev -w           # and remove the worktree it sits in
termwire down dev -w --force   # even with uncommitted changes
```

`down` resolves `[name]` exactly as `up` does, so `up dev` and `down dev` always mean one
session, and it hunts no processes: the `session-closed` hook already reaps that session.

Without a name the target is the workspace the command runs in, read from the inherited
`TERMWIRE_SESSION` — the same environment-based identity `open` uses. Inside a worktree
workspace that bare form is the only one that works, because there the Git root is the
worktree, so `down feat` would look for `<worktree>-feat` and find nothing. Outside a
workspace a bare `down` fails with `not inside a termwire workspace`.

`-w` removes the worktree the session was created in, and refuses the main checkout, the
directory the command is running in, and a worktree holding uncommitted changes unless
`--force` is given. A refusal removes nothing at all, the session included. The branch is
never deleted: a branch outlives its workspace. Ignored files are not uncommitted
changes, so a worktree carrying only `.env` or `node_modules` counts as clean and is
removed with them.

Tearing down your *own* workspace with `-w` inverts the order: the worktree is removed
first and the session killed last, because the kill ends the process that would otherwise
do the removal — and the command steps out of the worktree before removing it, since a
spawn from a deleted working directory fails with ENOENT. The refusal to remove the
directory it runs in does not apply there: the shell standing in it dies with the session
a moment later.

The tmux adapter gained `listSessions` and `showEnvironment` on `createTmux`, and the
process scan now reports resident memory, so `ProcessEntry` carries `rss` in KiB and one
walk over the process table answers for every workspace at once.

Process scanning also became platform-agnostic above the seam. `process-scan.ts` keeps
only the `SessionScanner` type and the contract a platform has to honour, while
`process-scan-darwin.ts` and `process-scan-linux.ts` each take their own dependencies;
`runtime.ts` picks one. Supporting another platform is a new module plus a branch there,
and `reap` and `ls` do not change, because they depend on the type.

Moving the scanner reshapes `CliRuntime`: it gained `createScanner`, a lazy factory so an
unsupported platform fails the commands that scan instead of every command, and lost
`exec`, `host.platform`, `host.uid` and `fs.readdir`, which existed only to feed it. It also
gained `host.chdir`, and `ProgramDependencies` gained `ls`, `down` and `homedir` — so
anything that builds a runtime or the command set by hand has to follow.

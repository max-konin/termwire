---
"@termwire/tmux": minor
"@termwire/cli": minor
---

Closing a workspace session now kills the processes started in it.

`tmux kill-session` only sends `SIGHUP` to the foreground process group of each
pane, so background agent jobs detached from the terminal survived it and were
adopted by `init`. They accumulated for weeks, in one case 158 processes across
nine abandoned sessions, five of whose worktrees no longer existed on disk.

`up` now installs one global tmux `session-closed` hook that runs a hidden
`termwire _reap <session>` subcommand. The reap collects the processes of the
current user whose environment still carries `TERMWIRE_SESSION=<session>`, sends
`SIGTERM`, then confirms the survivors still carry the label before escalating
them to `SIGKILL`. It signals exactly that list of pids and never a pattern
match, and never the tmux server or anything it descends from. Each run appends
one line to `$XDG_STATE_HOME/termwire/reap.log`, because a tmux hook's output is
shown nowhere.

Installing the hook is idempotent. A repeated `up` updates our entry when the
interpreter or script path changed, drops duplicates of ours, and leaves a
`session-closed` hook of your own untouched. A tmux server that refuses the hook
only produces a warning; the workspace still comes up.

`@termwire/tmux` gains `showHooks`, `setHook`, and `unsetHook`. It keeps no
knowledge of what the hooks are for.

# @termwire/tmux

A thin, typed adapter for tmux 3.2 or newer.

```bash
bun add @termwire/tmux
```

```ts
import { createTmux } from "@termwire/tmux";

const tmux = createTmux();

if (!(await tmux.hasSession("repo-dev"))) {
  await tmux.newSession({ session: "repo-dev", name: "editor", cwd: "/repo" });
}
```

`createTmux({ exec, env })` spawns through `node:child_process` in production,
so it runs on Node and on Bun alike. Tests inject a fake `exec` and need no
tmux binary.

## API

- Sessions: `hasSession`, `newSession`, `killSession`, `setSessionTitle`,
  `setEnvironment`, `attach`.
- Windows: `newWindow`, `selectWindow`, `selectLayout`.
- Panes: `splitPane`, `respawnPane`, `selectPane`, `sendKeys`.

`attach` uses `attach-session` outside tmux and `switch-client` when `TMUX` is
set, so attaching works the same from a plain terminal and from inside another
session.

`newSession` and `newWindow` return the created window and pane ids. Termwire
uses those ids to place panes and to record the editor pane in
`TERMWIRE_EDITOR_PANE`.

## Boundary

This package owns tmux commands only. Layout interpretation, editor roles,
Neovim, and workspace orchestration belong to the CLI.

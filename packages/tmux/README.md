# @termwire/tmux

```bash
bun add @termwire/tmux
```

```ts
import { createTmux } from "@termwire/tmux";

const tmux = createTmux();
```

A thin, typed adapter for tmux 3.2. Create it with `createTmux({ exec, env })`; production uses
`Bun.spawn`, while tests can inject a fake `exec` without requiring a tmux binary.

## API

The factory exposes `hasSession`, `newSession`, `newWindow`, `splitPane`, `sendKeys`,
`selectWindow`, `selectPane`, and `attach`. Attach uses `attach-session` outside tmux and
`switch-client` when `TMUX` is set.

## Boundary

This package owns tmux commands only. The CLI owns runtime layout interpretation and editor roles;
no OpenCode, workspace orchestration, or Neovim logic belongs here.

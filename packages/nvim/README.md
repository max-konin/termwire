# @termwire/nvim

A typed adapter for talking to an **already running** Neovim instance over its
RPC socket.

```bash
bun add @termwire/nvim
```

```ts
import { createNvim } from "@termwire/nvim";

const nvim = createNvim();

if (await nvim.isRunning(socket)) {
  await nvim.openFile(socket, "/repo/src/app.ts", 42);
}
```

## Why it exists

`termwire open`, the MCP server, and the OpenCode plugin all need to put a file
in front of the user in the Neovim running in the workspace editor pane. This
package is the one place that knows how to ask Neovim to do it.

## API

`createNvim({ exec? })` returns:

- `isRunning(socket)`: whether the server answers a remote RPC probe.
- `openFile(socket, file, line?)`: opens a file, then jumps to a positive line
  number when one is given.

## Design

Communication uses Neovim's built-in remote RPC, `nvim --server <socket>
--remote*`, on Neovim 0.9 or newer. No `nvr`, and no Neovim-side plugin. That
is a project requirement, not an implementation detail that might change.

Every call goes through an injectable `exec`, so this package is testable
without Neovim installed. The default `exec` uses `node:child_process`, so the
package runs on Node and on Bun alike. Socket handling and `--remote` flags stay internal;
only the typed API is exported.

## Boundary

This package talks to Neovim and nothing else. Editor focus belongs to tmux,
and workspace policy belongs to the CLI.

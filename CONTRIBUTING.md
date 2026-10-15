# Contributing to Termwire

## Before you write code

Open an issue first for anything beyond a fix. Termwire deliberately does a small
number of things, and [`PDR.md`](PDR.md) lists what it will not do under
*Non goals* and *Future ideas* — a pull request that lands there is a conversation,
not a merge.

For a bug, the issue form asks for your tmux, Neovim and Node versions. Termwire
drives tmux and Neovim through their own interfaces, so their versions usually
decide the behavior more than Termwire's code does.

## Setup

```bash
bun install
bun run hooks:install   # pre-commit: format, lint, tests
```

Bun 1.3.14 or newer, and this is a Bun workspace repo — not npm, pnpm or yarn.

## Checks

```bash
bun test
bun run lint            # biome check .
bunx tsc --noEmit       # there is no root typecheck script
bun run build && bun run verify:node
```

Run all four before you open a pull request. `verify:node` matters most: the
repository is developed with Bun, but every published package has to run on plain
**Node >=22.12**, so `packages/*/src` uses no `Bun.*` API and every relative
import carries an explicit `.js` extension. CI runs the same four.

## Conventions

[`AGENTS.md`](AGENTS.md) is the real style guide — package boundaries, what an
`index.ts` may export, how the CLI's `CliRuntime` seam works, and why process
scanning is split per platform. It is written for coding agents, which makes it
the most explicit description of how this code is meant to look. Read the part
that covers the file you are touching.

In short: Biome formats everything (2 spaces, double quotes, 100 columns), adapters
stay testable through an injectable `exec` so no test needs a real tmux or Neovim,
and production code carries no `dependencies.x ?? realThing` defaults.

## Changesets

A change that users can notice needs a changeset:

```bash
bun run changeset
```

The five packages version together as one fixed group, so pick the bump for the
change itself and let it apply to all of them. Say what changed and why in the
changeset body — it becomes the changelog people read. Internal refactors and test
or documentation work need no changeset.

Releases are cut from `master` by a maintainer; [`RELEASING.md`](RELEASING.md)
has the procedure.

## Pull requests

Describe the behavior that changes and how you verified it. "Tests pass" is not
verification for anything that touches tmux, Git worktrees or process signals —
run the real thing and say what you saw. A fake-only test once missed that
tearing down your own workspace kills the process that was about to remove its
worktree.

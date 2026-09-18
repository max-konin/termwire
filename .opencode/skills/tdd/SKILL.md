---
name: tdd
description: Apply red-green-refactor to termwire behavior changes and bug fixes with Bun tests. Use for package behavior, shell/RPC logic, validation, and adapter changes before production code is written.
---

# TDD

One behavior per cycle. Read `AGENTS.md`, the plan task, and the nearest analogous `*.test.ts` first.

## Red

1. Pick one acceptance line.
2. Add the smallest focused Bun test that pins it.
3. Run `bun test <test-path>` from the repository root.
4. Confirm it fails because the intended behavior is missing, not from test setup, typing, or syntax.

## Green

Implement only what makes that test pass, then rerun the same focused test.

## Refactor

Improve names or remove duplication only while the focused test remains green. Rerun it after each meaningful cleanup.

For tmux and Neovim adapters, use injectable `exec` fakes; do not require installed binaries. For CLI and plugin behavior, test package boundaries and errors instead of reaching through adapters. Do not add a Neovim plugin or `nvr`; use built-in remote RPC.

Before marking a task complete, run its focused test and the scope-appropriate package/root checks from the plan. A test that passed before the production change did not establish red and must be corrected before continuing.

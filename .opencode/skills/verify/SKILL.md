---
name: verify
description: Run scope-appropriate termwire verification with Bun, TypeScript, and Biome. Use after implementation, before completion claims, or through /verify-style requests.
---

# Verify

Run the narrowest meaningful check first, then broaden based on scope and risk. Report command output truthfully; do not infer success from a diff or another agent.

- `quick`: changed focused `bun test <path>` checks, then `bun run lint`.
- `lint`: `bun run lint`.
- `types`: `bunx tsc --noEmit`.
- `tests`: `bun test`.
- no mode: focused test(s), then relevant combinations of lint, types, and full tests.

`bun run build` exists but is broader than ordinary verification; run it for distribution, entrypoint, or package-build changes when the task warrants it. There is no separate root typecheck script.

For configuration and Markdown workflow work, use structural checks: OpenCode discovery, file inventory, forbidden-reference scans, `bun run lint`, and `git diff --check`. Do not invent behavior tests. If any required check fails, use `debug` or fix the failure before claiming completion.

Report each selected check as passed, failed, or not run with the reason.

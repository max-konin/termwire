---
name: review
description: Review termwire branch changes with a confidence threshold and consolidate focused read-only reviewer reports. Use for /review, the develop review phase, or judging review findings.
---

# Review

A finding must be true, introduced or worsened by the change, and worth action. Trace callers and tests before reporting. Score confidence from 0 to 100 and report only findings at 80 or above.

## Axes

1. **Correctness:** broken behavior, unhandled errors, races, invalid assumptions, or broken tests.
2. **Simplicity:** needless abstraction, duplication, dead code, or speculative generality; name the simpler shape.
3. **Conventions:** violations of `AGENTS.md`, package scripts, and established local patterns.
4. **Boundaries:** unsafe shell arguments, invalid paths or RPC input, leaked environment identity, incorrect tmux/Neovim adapter ownership, errors hidden at a package edge, tests requiring real external binaries, or forbidden Neovim integration.

Use:

```text
### <Critical|Important> - <one-line claim> (confidence NN)
`path:line`
Why: <failure scenario or repository rule>
Fix: <concrete change>
```

Critical means incorrect behavior, security/safety exposure, or broken checks. Important is any other finding clearing the threshold. Do not report pre-existing issues or unrequested style preferences.

The primary agent merges duplicates, drops out-of-scope or low-confidence reports, orders Critical before Important, and asks the user whether to fix, defer, or accept each. Never auto-apply review findings.

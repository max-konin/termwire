---
name: walkthrough-apply
description: Apply FIX comments and answer Q comments in a termwire workflow walkthrough without reprocessing terminal comments. Use when a reviewer asks to apply walkthrough feedback.
---

# Walkthrough Apply

Read `.opencode/work/<slug>/walkthrough.md` and collect actionable `> **FIX:**` and `> **Q:**` blocks in order. Ignore terminal `DONE:`, `ANSWERED:`, and `BLOCKED:` markers so reruns are idempotent.

Resolve each comment to the nearest `path:line` anchor above it, then confirm the current code with the anchor's essence snippet; line numbers are hints, not authority.

- For a `FIX:`, use `tdd` first if behavior changes; otherwise run existing covering checks. On success replace only that comment block with `> **DONE:** <what changed>`. If ambiguous or unsafe, replace it with `> **BLOCKED:** <specific question or reason>`.
- For a `Q:`, answer from actual code and replace only that block with `> **ANSWERED:** <answer>`. Do not make code changes unless the requested change is unambiguous.

Read `AGENTS.md` and applicable package rules before edits. Preserve the walkthrough narrative, anchors, and unresolved comments. Report counts of done, answered, blocked, and checks run. If the file does not exist or has no actionable markers, say so and stop.

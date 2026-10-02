---
name: interview
description: Confirm the user intent before design, planning, or code. Use when a request or issue leaves success criteria, scope, edge cases, or compatibility unclear.
---

# Interview

Read first and ask only what code, `AGENTS.md`, tests, and the agreed scope cannot answer. Never run this in a non-interactive session.

State an honest hypothesis before questions:

```text
HYPOTHESIS: <outcome and why>
CONFIDENCE: ~<number>% - missing: <unknowns>
```

Below 70%, name what is missing. Ask exactly one focused question per turn with a best guess, then wait:

```text
Q: <question>
GUESS: <likely answer and evidence>
```

Cover observable success, error paths, API/RPC/shell/path integration points, backwards compatibility, package ownership, and out-of-scope work. Stop when you can predict the next three answers. If confidence is already about 90%, skip questions but still request explicit confirmation:

```text
Here is what I think you want:
- Outcome: <one line>
- User: <one line>
- Why now: <one line>
- Success: <observable one line>
- Constraint: <binding limit>
- Out of scope: <one line>

Yes / no / refine?
```

Only an explicit yes closes the interview. Design and plan from the confirmed restatement, not the original wording.

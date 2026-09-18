---
name: debug
description: Diagnose bugs, failing tests, and regressions through reproduce, localize, reduce, fix, and guard. Use before patching unexpected behavior or CI failures.
---

# Debug

Find the cause before editing the fix.

1. **Reproduce:** obtain a deterministic failing `bun test <path>`, a minimal CLI invocation, or a precise error and inputs. If this is unavailable, the task is making the problem reproducible.
2. **Localize:** read the complete error, stack, nearby code, and tests. Rank 2-3 hypotheses with an observation that confirms or rejects each. Test one hypothesis at a time using the cheapest observation and record what it rules out.
3. **Reduce:** shrink to the smallest input and call path that still fails; this becomes the regression test.
4. **Fix:** change the cause, not a symptom. Keep the diff scoped. For a structural redesign, stop and obtain approval.
5. **Guard:** add or retain the reduced regression test, then run the affected checks.

Common areas to inspect here: shell argument construction, tmux session/pane targets, inherited `TERMWIRE_*` identity, socket availability and RPC escaping, relative paths, adapter error propagation, and CLI/plugin package ownership.

After three failed hypotheses or two ineffective fixes, stop. Summarize known evidence and rejected hypotheses, and ask the user rather than stacking guesses. Report cause, evidence, fix, and guard.

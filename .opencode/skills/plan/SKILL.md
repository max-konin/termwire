---
name: plan
description: Turn confirmed intent and a chosen design into a persistent, dependency-ordered termwire implementation plan. Use after design selection and before production changes or when revising a plan during implementation.
---

# Plan

Planning is read-only. Start with `## Intent` (outcome, user, success, constraint, out of scope) and `## Design` (chosen blueprint, accepted trade-offs, and rejected alternatives). Name analogous code and tests, exact files, package-boundary rules, task dependencies, risks, and verification checkpoints.

Save plans in `.opencode/work/<slug>/plan.md`. Derive `<slug>` from an explicit request slug or the current branch name with `/` replaced by `-`. If an incomplete plan exists for different work, ask before overwriting. The plan is live: check task boxes only after verification and record deviations under the affected task. Never commit it automatically.

Each task must include:

```markdown
## Task N: <title>
Description: <one focused responsibility>
Acceptance:
- [ ] <observable behavior>
Verify:
- [ ] `<exact focused command>` passes
Depends on: <task numbers or none>
Files: <exact paths>
```

Order by dependency and put high-risk work early. Behavior changes explicitly require red, green, and refactor steps using `tdd`. Use `bun test <path>` for focused tests; select `bun run lint`, `bunx tsc --noEmit`, `bun test`, and `bun run build` only when scope warrants them. Configuration or documentation tasks use structural validation, not invented unit tests. Present the persisted plan and wait for approval before implementation.

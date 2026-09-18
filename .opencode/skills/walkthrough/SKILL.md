---
name: walkthrough
description: Create a reviewer-friendly, story-ordered walkthrough of the current termwire branch diff. Use after implementation or when a reviewer needs narrative context rather than a raw diff.
---

# Walkthrough

Write `.opencode/work/<slug>/walkthrough.md` after implementation. Derive `<slug>` as in `plan`. Facts come from actual files and the diff; rationale may use the adjacent plan and commit messages, but code wins conflicts.

Use an explicit base ref if provided, otherwise use the merge-base with `origin/main`, then `main`, then `master`. Include committed, staged, unstaged, and untracked files. Every changed file must appear in the final completeness checklist.

Group the story by dependency, not file order: tests, shared adapters, CLI orchestration, OpenCode plugin/MCP, then configuration and docs. Within a slice, show the test before the production change. Include only essence snippets and `path:line` anchors, with why and what a reviewer should verify.

Start with the branch, base, scope, and this comment contract:

```markdown
> **FIX:** <actionable change request>
> **Q:** <question requiring an answer>
```

End with a checklist mapping every changed file to its section. Do not commit the walkthrough automatically.

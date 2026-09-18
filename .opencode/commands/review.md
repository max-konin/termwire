---
description: Review the branch diff with four parallel read-only reviewers and consolidate high-confidence findings.
agent: build
---

Review branch changes. Optional argument: a base git ref. Include uncommitted and untracked files.

Load `review`. Launch `code-reviewer` helpers for `correctness`, `simplicity`, `conventions`, and `boundaries`, passing the base ref when provided. Consolidate their reports, present findings, and wait for the user to choose; do not change code before that choice.

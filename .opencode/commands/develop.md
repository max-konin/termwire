---
description: Develop a roadmap stage or request end to end: explore, interview, design, plan, implement with TDD, verify, review, and walkthrough.
agent: build
---

Develop: $ARGUMENTS

You are the primary writer for the complete flow. Read-only `explore`, `code-architect`, and `code-reviewer` helpers may investigate, compare designs, and review, but never write code.

## Ground rules

- Human gates are hard stops after intent restatement, design selection, plan approval, and review findings.
- Do not write production behavior before the plan is approved or before its focused failing test exists.
- Never commit or push unless explicitly asked. Do not change unrelated problems.
- Track phases and plan-task checkboxes with the todo tool.
- Read `AGENTS.md`, relevant package configuration, and current code before asking questions.

## Resume

If the argument is a path to `.opencode/work/<slug>/plan.md`, read it in full and resume implementation from the first unchecked task, retaining verification, review, and walkthrough phases.

## 1. Resolve scope

Read `ROADMAP.md` if it exists. Treat input as a roadmap selector only when it is an explicit stage number, `stage N`, `этап N`, an exact stage title, or one unique title match. Resolve a matching stage from unchecked items and acceptance criteria; ask one focused question when ambiguous. Otherwise treat all input as a free-form request.

## 2. Explore

Launch 2-3 independent `explore` helpers covering analogous features, affected package boundaries/call flow, and relevant tests. Read every key file they identify. Summarize evidence concisely.

## 3. Interview

Load `interview`. Run it when code and roadmap evidence leave material scope, error, compatibility, or success questions open. Obtain an explicit yes to the restatement.

## 4. Design

Launch `code-architect` helpers for `minimal`, `clean`, and `pragmatic` blueprints. Compare their concrete differences, trade-offs, and recommendation; wait for the user to choose.

## 5. Plan

Load `plan`, persist `.opencode/work/<slug>/plan.md`, present it, and wait for approval.

## 6. Implement

Load `tdd` for each behavior-changing task. Execute tasks in order, keep the plan current, and run its checkpoints. Surface an uncovered design fork instead of silently choosing it. For a non-trivial decision made during implementation, request a focused `code-reviewer` correctness pass on the touched files.

## 7. Verify

Load `verify`, run the checks selected by scope, and fix failures before proceeding.

## 8. Review

Launch four `code-reviewer` helpers in parallel with `correctness`, `simplicity`, `conventions`, and `boundaries` focus. Consolidate per `review`, present findings, and wait for the user to choose which to address. Re-run affected verification after selected fixes.

## 9. Walkthrough

Load `walkthrough` and create `.opencode/work/<slug>/walkthrough.md`. Finish with completed scope, verification evidence, review disposition, and remaining uncertainty.

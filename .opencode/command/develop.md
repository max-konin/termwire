---
description: Develop a roadmap stage or free-form request through spec, plan, TDD, and verification
---

Develop the following input completely: `$ARGUMENTS`

## Non-negotiable workflow

Follow every phase in order. Do not skip approval gates, implementation evidence, or verification.

### 1. Resolve the request

1. Read `AGENTS.md` and relevant executable repository configuration before planning work.
2. If the trimmed input is empty, ask the user for a roadmap stage or free-form request and stop.
3. Read `ROADMAP.md` when it exists.
4. Treat the input as a roadmap selector only when it is an explicit stage number, `stage N`,
   `этап N`, an exact stage title, or one unique stage-title match.
5. If multiple stages match, ask one focused question and stop. If no stage matches unambiguously,
   treat the entire input as a free-form request.
6. For a roadmap stage, use its unchecked items and acceptance criteria as scope. Verify all claims
   against current code and configuration; roadmap prose is design intent, not runtime truth.

### 2. Investigate with OMO-slim specialists

Delegate only through the OMO-slim `explorer`, `librarian`, `oracle`, `designer`, and `fixer`
agents:

- `explorer`: repository discovery and compressed code maps.
- `librarian`: external documentation and version-specific library research.
- `oracle`: high-risk architecture, persistent debugging, or materially useful review.
- `designer`: all user-visible layout, styling, interaction, responsive, or visual work.
- `fixer`: bounded, non-visual implementation tasks with clear requirements.

Reuse matching specialist sessions when their context remains relevant. Parallel OMO-slim tasks are
allowed only for independent scopes; writer tasks must have non-overlapping file ownership.

Never delegate through a Superpowers agent runtime. Never invoke Superpowers
`dispatching-parallel-agents`, `subagent-driven-development`, or `executing-plans`. Do not invoke
`council`, `councillor-alpha`, or `councillor-beta` for this command.

### 3. Produce and approve the spec

1. Invoke the Superpowers `brainstorming` skill and follow its discovery, alternatives, design, and
   user-approval gates.
2. Write the approved spec to
   `docs/superpowers/specs/YYYY-MM-DD-<request-slug>-design.md`.
3. Self-review it for placeholders, contradictions, scope gaps, and ambiguous requirements.
4. Ask the user to review the written spec and wait for approval before planning.
5. Never commit or force-add the spec. This rule overrides any skill instruction to commit it.

### 4. Produce and approve the plan

1. After spec approval, invoke Superpowers `writing-plans`.
2. Write the implementation plan to
   `docs/superpowers/plans/YYYY-MM-DD-<request-slug>.md`.
3. Make tasks small, dependency-ordered, and explicit about OMO-slim agent ownership, exact files,
   exact commands, and expected results.
4. Every behavior-changing task must contain an explicit red-green-refactor cycle.
5. Self-review the plan against the approved spec and remove placeholders or missing requirements.
6. Ask the user to approve the written plan before implementation.
7. Never commit or force-add the plan. This rule overrides any skill instruction to commit it.
8. Do not offer or invoke Superpowers execution modes. Continue using OMO-slim agents after plan
   approval.

### 5. Execute with TDD through OMO-slim

1. Track the plan tasks and execute them in dependency order.
2. For each behavior change, invoke Superpowers `test-driven-development` for process discipline,
   then assign bounded implementation to the appropriate OMO-slim specialist.
3. RED: add one focused test, run it, and confirm it fails for the expected missing behavior—not
   because of syntax, setup, or environment errors.
4. GREEN: implement the minimum production change and rerun the focused test until it passes.
5. REFACTOR: improve clarity only while the focused test stays green.
6. Do not write production behavior before its failing test. If a test cannot be made to fail for
   the expected reason, stop and diagnose.
7. For non-executable documentation or configuration-only tasks, define and run a focused
   structural validation instead of inventing a meaningless unit test.
8. Preserve designer decisions for visual work. Route visual follow-up back to `designer`; use
   `fixer` only for mechanical changes that preserve the approved design.
9. Update roadmap checkboxes only after the corresponding behavior and acceptance criteria are
   verified.

### 6. Verify and report

1. Invoke Superpowers `verification-before-completion` before any completion claim.
2. Run the narrowest meaningful focused checks first. Broaden verification only when scope, risk,
   uncertainty, or a focused failure justifies it.
3. Use the repository's documented commands and prerequisites. Do not claim success from agent
   reports without independently checking changed files and command output.
4. Report completed scope, exact verification evidence, blockers, remaining uncertainty, and any
   roadmap items left unchecked.
5. Do not commit, push, create a pull request, or force-add ignored files unless the user explicitly
   requests that exact Git action.

## Allowed Superpowers skills

Superpowers may provide process discipline through `brainstorming`, `writing-plans`,
`test-driven-development`, `systematic-debugging`, `verification-planning`,
`verification-before-completion` and `receiving-code-review`. They must not provide the agent
execution runtime.

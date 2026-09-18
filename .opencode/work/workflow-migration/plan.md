# Project-local OpenCode Workflow Implementation Plan

**Goal:** Replace the OMO-slim and project-Superpowers workflow with the reference-style, project-local OpenCode development system adapted to termwire.

**Architecture:** `build` owns all writes while read-only `explore`, `code-architect`, and `code-reviewer` subagents provide discovery, competing blueprints, and focused review. Commands orchestrate the process by loading eight local skills, and `.opencode/work/<slug>/` is the only persistent task state. The project config only registers the existing termwire plugin and the local workflow assets.

**Tech Stack:** OpenCode JSON configuration and Markdown agents, commands, and skills; Bun workspace checks; Biome.

---

## Intent

- Outcome: termwire uses the same local OpenCode workflow model as the reference project, without OMO-slim or project-level Superpowers.
- User: a developer using OpenCode inside this repository.
- Success: commands, skills, and read-only support agents load from the project and direct work through the documented gates and termwire-specific checks.
- Constraint: preserve `termwire_open` registration and the repository's package boundaries, Bun tooling, and no-auto-commit policy.
- Out of scope: changing global OpenCode configuration, application runtime behavior, or unrelated documentation.

## Design

Use `.opencode/commands`, `.opencode/agents`, and `.opencode/skills` in the layouts OpenCode discovers automatically. Keep a single primary writer (`build`) and create three explicit read-only helpers. Port the reference project's workflow content, replacing Linear/Nx/Postgres/web-app assumptions with evidence-oriented discovery, Bun commands, package-boundary guidance, and CLI/tmux/Neovim/plugin concerns documented by this repository.

The prior `/develop` roadmap-selection behavior remains at the beginning of the new end-to-end flow. Plans and walkthroughs use `.opencode/work/<slug>/` and never require a commit.

## Files

- Modify: `opencode.json` — remove Superpowers plugin; retain the local termwire plugin and point skills at `.opencode/skills` if explicit registration is required.
- Delete: `.opencode/oh-my-opencode-slim.jsonc` — remove OMO-slim project preset.
- Delete: `.opencode/command/develop.md` — eliminate the duplicate legacy command.
- Create: `.opencode/agents/explore.md` — read-only termwire codebase analyst.
- Create: `.opencode/agents/code-architect.md` — read-only blueprint author.
- Create: `.opencode/agents/code-reviewer.md` — read-only focused reviewer.
- Create: `.opencode/commands/develop.md` — complete gated workflow.
- Create: `.opencode/commands/plan.md` — phases 1–5 only.
- Create: `.opencode/commands/debug.md` — structured bug diagnosis entry point.
- Create: `.opencode/commands/review.md` — parallel focused review entry point.
- Create: `.opencode/commands/walkthrough.md` — reviewer narrative entry point.
- Create: `.opencode/commands/walkthrough-apply.md` — walkthrough comment resolution entry point.
- Create: `.opencode/skills/interview/SKILL.md` — interactive intent confirmation.
- Create: `.opencode/skills/plan/SKILL.md` — project plan format and persistence rules.
- Create: `.opencode/skills/tdd/SKILL.md` — Bun-native red-green-refactor guidance.
- Create: `.opencode/skills/debug/SKILL.md` — reproduce-localize-reduce-fix-guard process.
- Create: `.opencode/skills/verify/SKILL.md` — focused and broad Bun verification matrix.
- Create: `.opencode/skills/review/SKILL.md` — review rubric and consolidation rules.
- Create: `.opencode/skills/walkthrough/SKILL.md` — branch story document format.
- Create: `.opencode/skills/walkthrough-apply/SKILL.md` — idempotent FIX/Q application rules.
- Modify: `.gitignore` — stop ignoring `.opencode/work/` if the workflow artifacts are intended to be project-local and inspected; otherwise retain it and document the artifacts as intentionally local.

## Analogous code

- `<reference>/.opencode/commands/develop.md` — phase ordering, gates, and primary-agent ownership.
- `<reference>/.opencode/agents/code-architect.md` — read-only architecture-helper format.
- `<reference>/.opencode/agents/code-reviewer.md` — focused review-helper format.
- `<reference>/.opencode/prompts/explore.md` — repository exploration output contract.
- `<reference>/.claude/skills/{interview,plan,tdd,debug,verify,review,walkthrough,walkthrough-apply}/SKILL.md` — workflows to adapt.
- `AGENTS.md` — authoritative termwire commands, boundaries, and test constraints.

## Task 1: [x] Validate config surface and decide artifact tracking

Description: confirm the installed OpenCode schema and CLI behavior before changing strict configuration, then settle whether work artifacts remain local. The existing `.gitignore` ignores `docs/superpowers`, but not `.opencode/work`; the plan must determine and preserve the actual desired behavior.

Acceptance:
- [ ] Every config field and agent/command/skill directory used in the implementation is valid for the installed OpenCode version.
- [ ] The plan records whether `.opencode/work/` artifacts are tracked or ignored, without changing unrelated ignore rules.

Verify:
- [ ] `opencode --help` completes successfully.
- [ ] The authoritative OpenCode schema has been consulted for any field not covered by the local customization instructions.

Depends on: none

Files: `opencode.json`, `.gitignore`, `AGENTS.md`, installed OpenCode configuration/schema information.

- [ ] **Step 1: Inspect OpenCode version and supported config discovery commands.**

Run: `opencode --help`

Expected: exit code 0 and enough command information to choose a configuration/discovery check.

- [ ] **Step 2: Inspect the installed configuration schema or fetch `https://opencode.ai/config.json`.**

Expected: confirm `plugin`, `skills.paths`, agent frontmatter, and command frontmatter shapes before editing.

- [ ] **Step 3: Decide artifact visibility from the accepted design.**

Expected: retain `.opencode/work/` as project-local workflow state unless the user explicitly asks to commit task artifacts; do not add it to `.gitignore` in this migration.

## Task 2: [x] Replace project configuration and define read-only helpers

Description: remove OMO-slim and Superpowers wiring, retain the local plugin, and provide the three read-only roles the new `/develop` workflow invokes.

Acceptance:
- [ ] `opencode.json` has exactly the termwire plugin in its explicit `plugin` array and preserves `$schema`.
- [ ] No project workflow configuration references OMO-slim or Superpowers.
- [ ] `explore`, `code-architect`, and `code-reviewer` deny edits and general shell execution, allowing only Git inspection commands necessary to their role.
- [ ] Agent prompts name termwire's actual package boundaries and Bun test patterns.

Verify:
- [ ] OpenCode discovers all three agents without config errors.
- [ ] `rg -n -i 'omo-slim|oh-my-opencode|superpowers' opencode.json .opencode` returns no active-workflow matches.

Depends on: Task 1

Files: `opencode.json`, `.opencode/oh-my-opencode-slim.jsonc`, `.opencode/agents/explore.md`, `.opencode/agents/code-architect.md`, `.opencode/agents/code-reviewer.md`.

- [ ] **Step 1: Remove the project Superpowers plugin while preserving the local plugin.**

Change `opencode.json` to:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["./packages/opencode-plugin/src/index.ts"],
  "skills": { "paths": [".opencode/skills"] }
}
```

- [ ] **Step 2: Delete `.opencode/oh-my-opencode-slim.jsonc`.**

Expected: no project config selects an OMO-slim preset or agents.

- [ ] **Step 3: Add `.opencode/agents/explore.md`.**

Include frontmatter with `mode: subagent`, `edit: deny`, `webfetch: deny`, and a `bash` allowlist for `git -C * log*`, `show*`, `diff*`, and `blame*`. Its body follows entry points through `packages/cli`, `packages/tmux`, `packages/nvim`, `packages/opencode-plugin`, and `packages/mcp`; outputs 5–10 key files with `path:line`, relevant tests, package-boundary implications, and real commands to validate the area.

- [ ] **Step 4: Add `.opencode/agents/code-architect.md`.**

Use the same read-only frontmatter and Git inspection allowlist. Its body accepts a confirmed intent, key files, and exactly one focus (`minimal`, `clean`, or `pragmatic`); it returns patterns, per-file components, flow, tests, risks, and a chosen design. It requires preserving the CLI/orchestration versus thin-adapter versus explicit-plugin-tool boundaries.

- [ ] **Step 5: Add `.opencode/agents/code-reviewer.md`.**

Use read-only frontmatter and allow only `git -C *` status, diff, log, show, merge-base, and rev-parse. Its body loads the local `review` skill, scopes to a passed base ref or the merge-base fallback, traces actual calls and tests, and reports only findings at confidence 80 or above.

- [ ] **Step 6: Run structural discovery and inspect configuration errors.**

Run the installed command found in Task 1, then inspect the output.

Expected: configuration parses and all three helper names are discoverable.

## Task 3: [x] Add commands and migrate the end-to-end orchestration

Description: replace the legacy OMO-slim command with the reference-style command set. Commands are thin orchestration contracts that name only local agents and local skills.

Acceptance:
- [ ] There is one `/develop` definition in `.opencode/commands/` and no legacy duplicate.
- [ ] `/develop` retains roadmap resolution and implements discovery through walkthrough with the four human gates.
- [ ] `/plan` runs the shared pre-implementation phases and stops after plan approval.
- [ ] `/debug`, `/review`, `/walkthrough`, and `/walkthrough-apply` load the matching local skill.
- [ ] Commands neither direct commits nor mention OMO-slim, Superpowers, Nx, pnpm, Linear, Storybook, or the reference project directories.

Verify:
- [ ] OpenCode discovers six commands.
- [ ] `rg -n -i 'omo-slim|oh-my-opencode|superpowers|pnpm|nx|linear|storybook' .opencode/commands` has no matches.

Depends on: Task 2

Files: `.opencode/command/develop.md`, `.opencode/commands/develop.md`, `.opencode/commands/plan.md`, `.opencode/commands/debug.md`, `.opencode/commands/review.md`, `.opencode/commands/walkthrough.md`, `.opencode/commands/walkthrough-apply.md`.

- [ ] **Step 1: Delete `.opencode/command/develop.md` and create `.opencode/commands/develop.md`.**

Set `agent: build`. Require: read `AGENTS.md`; resolve a roadmap selector using the previous explicit/unique-match rules; launch 2–3 independent `explore` helpers; load `interview`; launch three `code-architect` helpers under minimal/clean/pragmatic focus; load `plan`; load `tdd` per behavior change; load `verify`; launch four `code-reviewer` helpers by focus; load `walkthrough`. Require gates after restatement, design selection, plan, and review findings. Resume a supplied `.opencode/work/<slug>/plan.md` from its first unchecked implementation task.

- [ ] **Step 2: Create `.opencode/commands/plan.md`.**

Set `agent: build`, direct it to read `develop.md`, execute its ground rules and discovery through planning phases exactly, then stop after the user approves the persisted plan.

- [ ] **Step 3: Create the four focused command entry points.**

Set each to `agent: build`. `debug.md` loads `debug`; `review.md` loads `review`, launches four `code-reviewer` helpers by focus, consolidates, and waits; `walkthrough.md` loads `walkthrough`; `walkthrough-apply.md` loads `walkthrough-apply`.

- [ ] **Step 4: Run command discovery and forbidden-reference scan.**

Expected: six command names load; scans are empty.

## Task 4: [x] Port intent, planning, testing, debugging, and verification skills

Description: provide local, self-contained process skills for all behavior changes and failures. Each skill replaces reference-repository commands and assumptions with termwire's actual files and Bun commands.

Acceptance:
- [ ] All five skills have valid name-matching directories and trigger descriptions.
- [ ] Interview requires one question per turn and explicit confirmation of outcome, success, constraints, and out-of-scope work.
- [ ] Plan persists to `.opencode/work/<slug>/plan.md`, records intent/design/tasks/verification/deviations, and never instructs a commit.
- [ ] TDD uses focused `bun test <path>` cycles and preserves injectable `exec` requirements for adapter tests.
- [ ] Debug follows reproduce-localize-reduce-fix-guard and stops after three failed hypotheses.
- [ ] Verify selects checks based on scope: focused `bun test`, `bun run lint`, `bunx tsc --noEmit`, and `bun test`, without claiming a root build is absent.

Verify:
- [ ] Every skill has a `SKILL.md` with matching `name` frontmatter.
- [ ] `rg -n -i 'pnpm|vitest|postgres|linear|nx|storybook' .opencode/skills/{interview,plan,tdd,debug,verify}` returns no matches.

Depends on: Task 3

Files: `.opencode/skills/interview/SKILL.md`, `.opencode/skills/plan/SKILL.md`, `.opencode/skills/tdd/SKILL.md`, `.opencode/skills/debug/SKILL.md`, `.opencode/skills/verify/SKILL.md`.

- [ ] **Step 1: Create the `interview` skill.**

Port the reference's hypothesis, confidence, single-question, and explicit-restatement rules. Keep its mandatory `Out of scope` line and make `AGENTS.md`, roadmap scope, tests, and current code the sources that must be read before asking.

- [ ] **Step 2: Create the `plan` skill.**

Require `## Intent`, `## Design`, analogous code, dependency-ordered tasks, acceptance bullets, exact verification commands, checkpoints, risks, and deviations. Slug from an explicit request-derived slug or the current branch with `/` changed to `-`; save to `.opencode/work/<slug>/plan.md`; do not overwrite a different task's incomplete plan without clarification.

- [ ] **Step 3: Create the `tdd` skill.**

Require one failing Bun test for one behavior, confirmation it fails for the intended missing behavior, minimal implementation, passing focused test, then refactor under green. Direct implementers to use the nearest existing `*.test.ts` shape and injected `exec` rather than real tmux or Neovim. At task exit, run the affected package or focused test and relevant type/lint checks.

- [ ] **Step 4: Create the `debug` skill.**

Port the reference sequence and stop rule. Replace production observability and database examples with termwire-specific likely causes: malformed shell arguments, tmux target or session naming, incorrect environment identity, RPC escaping/socket availability, path resolution, or adapter execution failures.

- [ ] **Step 5: Create the `verify` skill.**

Accept `quick`, `lint`, `types`, and `tests` modes. Define: quick runs changed focused tests plus `bun run lint`; lint runs `bun run lint`; types runs `bunx tsc --noEmit`; tests runs `bun test`; no-argument selection starts focused then uses all relevant root checks. State that `bun run build` exists but is broader and is selected only for package/distribution changes.

- [ ] **Step 6: Run skill discovery and banned-reference scan.**

Expected: five skills load and scans are empty.

## Task 5: [x] Port review and walkthrough loop

Description: add the reviewer-facing workflow and idempotent response mechanism using branch diffs and persistent local artifacts.

Acceptance:
- [ ] Review has correctness, simplicity, conventions, and boundaries ownership, with confidence threshold 80 and no automatic fixes.
- [ ] Review boundaries cover CLI argument validation, shell/RPC safety, environment/session identity, path resolution, external-binary errors, package boundaries, and test isolation.
- [ ] Walkthrough includes committed, unstaged, and untracked changes; facts come from files/diff and every changed file appears in the completeness checklist.
- [ ] Walkthrough-apply resolves only `FIX:` and `Q:` comments; marks terminal outcomes `DONE:`, `ANSWERED:`, or `BLOCKED:` without regenerating narrative.

Verify:
- [ ] All three skills load and reference only existing local workflow paths.
- [ ] `rg -n -i 'pnpm|vitest|postgres|linear|nx|storybook' .opencode/skills/{review,walkthrough,walkthrough-apply}` returns no matches.

Depends on: Task 4

Files: `.opencode/skills/review/SKILL.md`, `.opencode/skills/walkthrough/SKILL.md`, `.opencode/skills/walkthrough-apply/SKILL.md`.

- [ ] **Step 1: Create the `review` skill.**

Port confidence scoring, the Critical/Important finding format, scope rules, and primary-agent consolidation. Replace upstream-specific axes with termwire boundary checks and repository rules from `AGENTS.md`.

- [ ] **Step 2: Create the `walkthrough` skill.**

Port story ordering, tests-first slices, concise essence snippets, code-over-plan conflict resolution, full changed-file coverage, and branch base fallback (`origin/main`, then `main`, then `master`). Use `.opencode/work/<slug>/walkthrough.md`, include a complete comment marker contract, and do not require diagrams.

- [ ] **Step 3: Create the `walkthrough-apply` skill.**

Port nearest-anchor resolution, test-first behavior fixes, terminal marker transitions, ambiguity blocking, and preservation of the surrounding walkthrough narrative. Refer to `tdd` and `AGENTS.md` rather than non-existent codestyle docs.

- [ ] **Step 4: Run skill discovery and banned-reference scan.**

Expected: three skills load and scans are empty.

## Task 6: [x] Validate the migration and document reload requirements

Description: run project-appropriate structural checks, inspect the complete diff, and clearly distinguish a configuration-load check from a human-driven end-to-end workflow run.

Acceptance:
- [ ] The project config and all local workflow assets are discovered without errors after a clean OpenCode restart.
- [ ] The final active workflow has no OMO-slim, Superpowers, or reference-project dependency.
- [ ] All changed Markdown/JSON files satisfy Biome.
- [ ] The final report names verification evidence, remaining limitation, and restart requirement.

Verify:
- [ ] `bun run lint` passes.
- [ ] OpenCode discovery/config check passes after restart.
- [ ] `git diff --check` passes.
- [ ] A file and content inventory confirms three agents, six commands, and eight skills.

Depends on: Task 5

Files: all workflow migration files.

- [ ] **Step 1: Run structural scans.**

Run: `rg -n -i 'omo-slim|oh-my-opencode|superpowers|pnpm|nx|linear|storybook' opencode.json .opencode`

Expected: no matches outside the migration plan/design historical context; refine the path filter if task artifacts intentionally mention the reference.

- [ ] **Step 2: Run inventory validation.**

Expected: exactly 3 files under `.opencode/agents`, 6 under `.opencode/commands`, and 8 `SKILL.md` files under `.opencode/skills`; each skill directory equals its frontmatter name.

- [ ] **Step 3: Run formatting and whitespace checks.**

Run: `bun run lint`

Expected: exit code 0.

Run: `git diff --check`

Expected: exit code 0.

- [ ] **Step 4: Restart OpenCode and run its discovered configuration check.**

Expected: the new configuration, commands, agents, and skills are loaded. Record this separately from end-to-end workflow execution, which requires an interactive development request.

## Risks

| Risk | Mitigation |
| --- | --- |
| Strict OpenCode config rejects a guessed field | Validate against the installed schema before changing `opencode.json`. |
| Global configuration still activates external tooling | Inspect effective startup output; change only project configuration and report inherited behavior. |
| Ported skill refers to the reference project infrastructure | Use scans after each port and adapt every command/path example to `AGENTS.md`. |
| Human gates make automated end-to-end testing impractical | Validate discovery structurally; exercise a workflow only with an interactive request after restart. |

## Execution record

Completed on 2026-09-18. OpenCode schema validation, agent discovery, workflow inventory,
forbidden-reference checks, `bun run lint`, `git diff --check`, and the baseline `bun test`
all passed. End-to-end command execution requires a restarted interactive OpenCode session.

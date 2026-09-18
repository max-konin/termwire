# Project-local OpenCode workflow

## Intent

Replace termwire's OMO-slim-dependent development command and project-level
Superpowers integration with the workflow used in `/Users/max/projects/upfirst/app`,
adapted to this repository. The user approved this direction, including removing
Superpowers from the project config.

## Runtime and ownership

- `build` is the primary agent and the only implementation writer.
- Native OpenCode `explore`, `code-architect`, and `code-reviewer` agents are
  read-only helpers. Independent exploration, design alternatives, and review
  perspectives can run in parallel.
- Agent permissions enforce read-only behavior: deny edits and default shell
  execution, allow only the Git inspection commands each role needs. Account for
  this repository's absolute-path `git -C` convention in allow patterns.
- Remove `.opencode/oh-my-opencode-slim.jsonc` and the Superpowers plugin entry in
  `opencode.json`. Retain `./packages/opencode-plugin/src/index.ts`.
- Inspect effective config for inherited OMO-slim or Superpowers activation before
  reporting removal. Project changes do not authorize editing global settings.

## Commands and flow

Use `.opencode/commands/`, replacing the old singular-directory `develop.md` so
there is only one definition per command.

- `/develop`: discovery → exploration → interview → design → plan → implementation
  → verification → review → walkthrough.
- `/plan`: reuse discovery through plan from `/develop`, then stop.
- `/debug`: reproduce, localize, reduce, fix, and add a regression guard.
- `/review`: read-only review with correctness, simplicity, conventions, and
  boundaries perspectives; consolidate findings before asking what to fix.
- `/walkthrough`: produce a reviewer-oriented account of the changes.
- `/walkthrough-apply`: apply explicit FIX comments and handle Q comments using
  the reference skill's conventions.

Keep upfirst's explicit human gates after the intent restatement, design choice,
plan, and review findings. Do not commit or push without an explicit request.
When a design fork appears during implementation, surface it rather than silently
changing the approved design.

Retain termwire's roadmap selector support: an explicit stage number, stage title,
or unique title match selects that stage's unfinished scope; ambiguous selectors
require clarification. Treat roadmap claims as design intent and verify against
the code. Update checkboxes only after acceptance criteria have been verified.

## Local skills and task state

Adapt these upfirst skills into `.opencode/skills/<name>/SKILL.md`:

`interview`, `plan`, `tdd`, `debug`, `verify`, `review`, `walkthrough`, and
`walkthrough-apply`.

Read the reference skill bodies and supporting resources during implementation;
preserve their useful process details while replacing repository-specific paths,
tools, and assumptions. Every local skill reference must resolve without relying
on a sibling checkout or a global installation of the migrated skills.

Store task artifacts under `.opencode/work/<slug>/`. The plan records intent,
chosen design, ordered tasks, verification checkpoints, progress, and deviations.
`/develop <plan path>` reads the whole plan and resumes from the first unfinished
task, retaining remaining verification and review phases. Keep `walkthrough.md`
beside the plan. Artifacts are not automatically committed.

## Termwire adaptation

Use `AGENTS.md` and executable configuration as the repository rules:

- Bun workspaces under `packages/*`; Biome conventions.
- CLI orchestration, thin tmux and Neovim adapters, and explicit plugin file
  opening retain their existing package boundaries.
- Tests use injectable `exec` and do not require installed tmux or Neovim.
- Neovim integration uses built-in remote RPC.
- Verification uses focused `bun test <path>` checks, `bun run lint`, `bun test`,
  and `bunx tsc --noEmit` as warranted by scope; there is no root build script.
- Behavior changes use meaningful red/green tests. Documentation and configuration
  changes use structural checks rather than artificial behavior tests.

Replace upfirst-specific layers, pnpm commands, codestyle links, ticket discovery,
and browser/Storybook QA requirements with this project's actual interfaces and
checks. Review boundaries include shell arguments, RPC calls, paths, environment
identity, and package ownership.

## Validation and acceptance

1. OpenCode loads the resulting project config, commands, agents, and eight skills.
2. Only the termwire plugin remains in the project's explicit plugin list.
3. Active workflow files contain no OMO-slim or Superpowers dependencies and no
   unresolved upfirst-specific paths or commands.
4. Each command targets the intended primary agent, skill names match their
   directories, and all referenced local resources exist.
5. Read-only helpers have explicit edit and shell restrictions; implementation
   stays with the primary agent.
6. `/plan` and plan-path resumption share the `/develop` phase contract; review
   includes uncommitted and untracked changes and has a clear base-ref fallback.
7. Run available OpenCode discovery/config diagnostics and repository lint for
   changed supported files. Report structural evidence separately from any
   end-to-end workflow behavior not exercised in a fresh session.
8. Tell the user to restart OpenCode to load the new configuration and skills.

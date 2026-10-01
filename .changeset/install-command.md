---
"@termwire/cli": minor
---

`termwire install` sets up a layout and teaches your agents to open files.

Two things were documentation-only before. A layout meant copying JSONC out of the
cookbook by hand, and only Claude Code had a documented line for letting an agent put a
file in front of you.

`termwire install`, reachable as `npx @termwire/cli install` before anything is installed,
picks one of the four cookbook layouts and writes it globally or into the repository, then
installs a `termwire-open` skill for the agents you select. It is interactive by default,
with the window layout drawn beside the list as you move through it, and silent once the
flags leave nothing to ask: `--yes`, or `--layout` together with `--agents`.

The skill teaches an agent to run `termwire open <path>:<line>`, which costs no process.
That is the point: the `@termwire/mcp` server does the same job but lives as one process
per agent session for as long as the session does — on a machine running a dozen agents,
a dozen idle processes. The server is still published for agents that may not run shell
commands; `install` no longer registers it.

Skills go where each agent reads them — `~/.claude/skills/termwire-open/SKILL.md` and
`$XDG_CONFIG_HOME/opencode/skills/termwire-open/SKILL.md`. The file is shipped as Markdown
in the package, so you can read exactly what your agent was told. Codex has no skills, so
it gets the one line to add to `~/.codex/AGENTS.md` printed for you; its own files are
never edited, and neither is any other agent's configuration.

`CliRuntime` gained the members the command needs — `fs.writeFile`, `fs.rename`,
`host.randomId`, `host.isTerminal` and `createPrompter` — so anything that builds a runtime
by hand has to supply them. `fs.isExecutable` is gone with the agent-binary probe it served.

Re-running changes nothing that is already in place. A skill this command wrote carries a
marker line and is upgraded silently; delete the line and the file is yours, kept until
`--force` says otherwise. An
existing Termwire config is likewise kept unless you name a layout, and every question is
asked before the plan is confirmed.

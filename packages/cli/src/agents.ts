import { join } from "node:path";

export const agentIds = ["claude", "codex", "opencode"] as const;

export type AgentId = (typeof agentIds)[number];

export const skillName = "termwire-open";

export interface AgentPaths {
  home: string;
  /** `$XDG_CONFIG_HOME`, already resolved to an absolute path. */
  configHome: string;
}

export interface AgentDefinition {
  id: AgentId;
  title: string;
  /** Existing directory that proves this agent is set up here. */
  home: (paths: AgentPaths) => string;
  /**
   * Where the agent reads user skills from, or undefined when it has no skills. We only
   * ever add our own directory there; the agent's own files stay untouched.
   */
  skillPath: ((paths: AgentPaths) => string) | undefined;
  /** What to do by hand when the agent cannot take a skill. */
  manual: readonly string[];
}

const definitions: readonly AgentDefinition[] = [
  {
    id: "claude",
    title: "Claude Code",
    home: ({ home }) => join(home, ".claude"),
    skillPath: ({ home }) => join(home, ".claude", "skills", skillName, "SKILL.md"),
    manual: [],
  },
  {
    id: "codex",
    title: "Codex",
    home: ({ home }) => join(home, ".codex"),
    // Codex has no skills; its instructions live in one file that belongs to the user.
    skillPath: undefined,
    manual: [
      "Codex has no skills. Add one line to ~/.codex/AGENTS.md:",
      "",
      "  To show the user a file, run `termwire open <path>:<line>`.",
    ],
  },
  {
    id: "opencode",
    title: "OpenCode",
    home: ({ configHome }) => join(configHome, "opencode"),
    skillPath: ({ configHome }) => join(configHome, "opencode", "skills", skillName, "SKILL.md"),
    manual: [],
  },
];

export function agentDefinitions(): AgentDefinition[] {
  return definitions.map((agent) => ({ ...agent }));
}

export function findAgentDefinition(id: string): AgentDefinition | undefined {
  const agent = definitions.find((candidate) => candidate.id === id);
  return agent === undefined ? undefined : { ...agent };
}

export function parseAgentIds(value: string): AgentId[] {
  const requested = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (requested.length === 1 && requested[0] === "none") return [];
  if (requested.length === 0) {
    throw new Error(`--agents needs one of ${agentIds.join(", ")}, or none`);
  }

  const unknown = requested.filter((entry) => !agentIds.includes(entry as AgentId));
  if (unknown.length > 0) {
    throw new Error(`unknown agent: ${unknown.join(", ")} (expected ${agentIds.join(", ")})`);
  }

  return [...new Set(requested as AgentId[])];
}

import { describe, expect, test } from "bun:test";
import type { AgentId } from "./agents.js";
import {
  agentDefinitions,
  agentIds,
  findAgentDefinition,
  parseAgentIds,
  skillName,
} from "./agents.js";

const paths = { home: "/home/user", configHome: "/home/user/.config" };

describe("agentDefinitions", () => {
  test("covers every declared agent", () => {
    expect(agentDefinitions().map((agent) => agent.id)).toEqual([...agentIds]);
  });

  test.each([
    ["claude", "/home/user/.claude", `/home/user/.claude/skills/${skillName}/SKILL.md`],
    [
      "opencode",
      "/home/user/.config/opencode",
      `/home/user/.config/opencode/skills/${skillName}/SKILL.md`,
    ],
  ])("%s is found by its own directory and takes a skill file", (id, home, skillPath) => {
    const agent = findAgentDefinition(id);

    expect(agent?.home(paths)).toBe(home);
    expect(agent?.skillPath?.(paths)).toBe(skillPath);
  });

  test("Codex takes no skill and gets a line to add by hand", () => {
    const agent = findAgentDefinition("codex");

    expect(agent?.home(paths)).toBe("/home/user/.codex");
    expect(agent?.skillPath).toBeUndefined();
    expect(agent?.manual.join("\n")).toContain("termwire open");
  });

  test("every skill lands in the agent's skills directory, never in its configuration", () => {
    for (const agent of agentDefinitions()) {
      const path = agent.skillPath?.(paths);
      if (path === undefined) continue;
      expect(path).toContain(`/skills/${skillName}/`);
      expect(path.endsWith("SKILL.md")).toBe(true);
    }
  });

  test("hands out copies", () => {
    const first = agentDefinitions()[0];
    if (first === undefined) throw new Error("expected an agent");
    first.title = "mutated";

    expect(agentDefinitions()[0]?.title).not.toBe("mutated");
  });

  test("returns undefined for an unknown id", () => {
    expect(findAgentDefinition("cursor")).toBeUndefined();
  });
});

describe("parseAgentIds", () => {
  test.each([
    ["claude", ["claude"]],
    ["claude,opencode", ["claude", "opencode"]],
    [" claude , codex ", ["claude", "codex"]],
    ["claude,claude", ["claude"]],
    ["none", []],
  ] as [string, AgentId[]][])("reads %p", (value, expected) => {
    expect(parseAgentIds(value)).toEqual(expected);
  });

  test.each(["cursor", "claude,cursor", ""])("rejects %p", (value) => {
    expect(() => parseAgentIds(value)).toThrow();
  });
});

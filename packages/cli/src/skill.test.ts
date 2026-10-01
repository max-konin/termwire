import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { skillName } from "./agents.js";
import { skillMarker, skillSourcePath } from "./skill.js";

const contents = readFileSync(skillSourcePath(), "utf8");

test("ships as a Markdown file the package includes", () => {
  expect(skillSourcePath().endsWith(`/skills/${skillName}/SKILL.md`)).toBe(true);
});

test("declares the frontmatter an agent needs to index it", () => {
  const [, frontmatter] = contents.split("---\n");

  expect(contents.startsWith("---\n")).toBe(true);
  expect(frontmatter).toContain(`name: ${skillName}`);
  expect(frontmatter).toContain("description: ");
});

test("tells the agent the one command and how the line suffix works", () => {
  expect(contents).toContain("termwire open <path>[:<line>]");
  expect(contents).toContain("src/app.ts:42");
  expect(contents).toContain("--line 42");
});

test("says what to do outside a workspace, instead of leaving the agent stuck", () => {
  expect(contents).toContain("TERMWIRE_SOCKET");
  expect(contents).toContain("not inside a termwire workspace");
});

test("never mentions the MCP server, which this skill replaces", () => {
  expect(contents.toLowerCase()).not.toContain("mcp");
});

test("carries the marker that lets the next install recognise its own file", () => {
  // Without it every upgrade would ask before replacing, or keep a stale skill.
  expect(contents.trimEnd().endsWith(skillMarker)).toBe(true);
});

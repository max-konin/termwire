import { expect, mock, test } from "bun:test";
import {
  type InstallDependencies,
  type InstallPrompter,
  type InstallRequest,
  install,
} from "./install.js";
import { skillMarker } from "./skill.js";

const globalPath = "/home/user/.config/termwire/config.jsonc";
const agentPaths = { home: "/home/user", configHome: "/home/user/.config" };
const claudeSkill = "/home/user/.claude/skills/termwire-open/SKILL.md";
const skillSource = "/pkg/skills/termwire-open/SKILL.md";
const skillText = "---\nname: termwire-open\n---\n\nrun `termwire open <path>`\n";

/** Every agent is set up here; nothing is written yet. */
const everyAgentPresent = async (path: string) =>
  path === "/home/user/.claude" ||
  path === "/home/user/.codex" ||
  path === "/home/user/.config/opencode";

function createDependencies(overrides: Partial<InstallDependencies> = {}) {
  const dependencies: InstallDependencies = {
    cwd: () => "/repo",
    findGitRoot: async () => "/repo",
    globalConfigPath: () => globalPath,
    agentPaths,
    skillSource,
    pathExists: mock<InstallDependencies["pathExists"]>(everyAgentPresent),
    readFile: async (path) => (path === skillSource ? skillText : ""),
    writeConfig: mock<InstallDependencies["writeConfig"]>().mockResolvedValue(),
    write: mock<(message: string) => void>(),
    isTerminal: false,
    ...overrides,
  };
  return dependencies;
}

function createPrompter(answers: {
  layout?: Awaited<ReturnType<InstallPrompter["layout"]>>;
  agents?: Awaited<ReturnType<InstallPrompter["agents"]>>;
  replace?: Awaited<ReturnType<InstallPrompter["replace"]>>;
  confirm?: Awaited<ReturnType<InstallPrompter["confirm"]>>;
}): InstallPrompter {
  // `in` rather than `??`, so an explicit undefined can stand for a cancellation.
  return {
    layout: mock<InstallPrompter["layout"]>().mockResolvedValue(
      "layout" in answers ? answers.layout : "default",
    ),
    agents: mock<InstallPrompter["agents"]>().mockResolvedValue(
      "agents" in answers ? answers.agents : [],
    ),
    replace: mock<InstallPrompter["replace"]>().mockResolvedValue(
      "replace" in answers ? answers.replace : true,
    ),
    confirm: mock<InstallPrompter["confirm"]>().mockResolvedValue(
      "confirm" in answers ? answers.confirm : true,
    ),
  };
}

type ConfigWrite = { path: string; contents: string; force: boolean };

function writes(dependencies: InstallDependencies): ConfigWrite[] {
  const writeConfig = dependencies.writeConfig as unknown as {
    mock: { calls: [ConfigWrite][] };
  };
  return writeConfig.mock.calls.map(([options]) => options);
}

function output(dependencies: InstallDependencies): string {
  const write = dependencies.write as unknown as {
    mock: { calls: [string][] };
  };
  return write.mock.calls.map(([message]) => message).join("");
}

test("writes the requested layout to the global config", async () => {
  const dependencies = createDependencies();

  const result = await install({ layout: "focused", agents: [] }, dependencies);

  expect(result).toMatchObject({ cancelled: false, configPath: globalPath, configWritten: true });
  expect(dependencies.writeConfig).toHaveBeenCalledWith({
    path: globalPath,
    contents: expect.stringContaining('"name": "work"'),
    force: false,
  });
});

test("writes a project config in the Git root", async () => {
  const dependencies = createDependencies();

  const result = await install({ layout: "default", project: true, agents: [] }, dependencies);

  expect(result.configPath).toBe("/repo/.termwire.jsonc");
});

test("refuses a project config outside a repository", async () => {
  const dependencies = createDependencies({ findGitRoot: async () => undefined });

  await expect(install({ layout: "default", project: true }, dependencies)).rejects.toThrow(
    "--project requires a Git repository",
  );
});

test("rejects an unknown layout before touching anything", async () => {
  const dependencies = createDependencies();

  await expect(install({ layout: "fancy", agents: [] }, dependencies)).rejects.toThrow(
    "unknown layout: fancy",
  );
  expect(dependencies.writeConfig).not.toHaveBeenCalled();
});

test("leaves the configuration alone for the none layout", async () => {
  const dependencies = createDependencies();

  const result = await install({ layout: "none", agents: [] }, dependencies);

  expect(result.configWritten).toBe(false);
  expect(dependencies.writeConfig).not.toHaveBeenCalled();
});

test("passes force through and records a refusal as a failure", async () => {
  const dependencies = createDependencies({
    pathExists: async () => true,
    writeConfig: mock<InstallDependencies["writeConfig"]>().mockRejectedValue(
      new Error(`${globalPath} already exists; pass --force to replace it`),
    ),
  });

  const result = await install({ layout: "default", agents: [] }, dependencies);

  expect(result.configWritten).toBe(false);
  expect(result.failures).toEqual([`${globalPath} already exists; pass --force to replace it`]);
});

test("asks for a layout and agents when a terminal is available", async () => {
  const prompt = createPrompter({ layout: "three-window", agents: ["claude"] });
  const dependencies = createDependencies({ isTerminal: true, prompt });

  const result = await install({}, dependencies);

  expect(prompt.layout).toHaveBeenCalledWith({
    templates: expect.any(Array),
    path: globalPath,
    exists: false,
  });
  expect(prompt.agents).toHaveBeenCalled();
  expect(result.configWritten).toBe(true);
  expect(writes(dependencies).map((write) => write.path)).toContain(claudeSkill);
});

test("tells the prompter that a config is already there", async () => {
  const prompt = createPrompter({});
  const dependencies = createDependencies({
    isTerminal: true,
    prompt,
    pathExists: async () => true,
  });

  await install({ force: true }, dependencies);

  expect(prompt.layout).toHaveBeenCalledWith({
    templates: expect.any(Array),
    path: globalPath,
    exists: true,
  });
});

test("changes nothing when the user declines the plan", async () => {
  const dependencies = createDependencies({
    isTerminal: true,
    prompt: createPrompter({ confirm: false }),
  });

  const result = await install({}, dependencies);

  expect(result.cancelled).toBe(true);
  expect(dependencies.writeConfig).not.toHaveBeenCalled();
});

test("shows the plan before anything is written", async () => {
  const confirm = mock<InstallPrompter["confirm"]>().mockResolvedValue(true);
  const dependencies = createDependencies({
    isTerminal: true,
    prompt: { ...createPrompter({ layout: "default", agents: ["claude"] }), confirm },
  });

  await install({}, dependencies);

  expect(confirm.mock.calls[0]?.[0].summary).toEqual([
    `Layout: default — write ${globalPath}`,
    `Claude Code: write ${claudeSkill}`,
  ]);
});

test("--yes takes the defaults without asking", async () => {
  const prompt = createPrompter({});
  const dependencies = createDependencies({ isTerminal: true, prompt });

  const result = await install({ yes: true }, dependencies);

  expect(prompt.layout).not.toHaveBeenCalled();
  expect(prompt.confirm).not.toHaveBeenCalled();
  expect(result.configWritten).toBe(true);
  expect(result.agents).toEqual([]);
});

test("refuses to guess with no terminal and no flags", async () => {
  const dependencies = createDependencies();

  await expect(install({} as InstallRequest, dependencies)).rejects.toThrow(
    "pass --yes, --layout or --agents",
  );
});

test("writes the shipped skill into every agent that takes one", async () => {
  const dependencies = createDependencies();

  const result = await install({ layout: "none", agents: ["claude", "opencode"] }, dependencies);

  // A first write creates the file exclusively; only a replacement forces.
  expect(writes(dependencies)).toEqual([
    { path: claudeSkill, contents: skillText, force: false },
    {
      path: "/home/user/.config/opencode/skills/termwire-open/SKILL.md",
      contents: skillText,
      force: false,
    },
  ]);
  expect(result.agents).toEqual([
    { id: "claude", outcome: "installed" },
    { id: "opencode", outcome: "installed" },
  ]);
});

test("leaves an agent alone when it already has the current skill", async () => {
  const dependencies = createDependencies({
    pathExists: async () => true,
    readFile: async () => skillText,
  });

  const result = await install({ layout: "none", agents: ["claude"] }, dependencies);

  expect(result.agents).toEqual([{ id: "claude", outcome: "present" }]);
  expect(writes(dependencies)).toEqual([]);
});

test("upgrades its own older skill without asking, because it is marked as ours", async () => {
  const dependencies = createDependencies({
    pathExists: async () => true,
    readFile: async (path) =>
      path === skillSource ? skillText : `an older skill\n\n${skillMarker}\n`,
  });

  const result = await install({ layout: "none", agents: ["claude"] }, dependencies);

  expect(result.agents).toEqual([{ id: "claude", outcome: "installed" }]);
  expect(writes(dependencies)).toEqual([{ path: claudeSkill, contents: skillText, force: true }]);
});

test("gives Codex the line to add, because it has no skills", async () => {
  const dependencies = createDependencies();

  const result = await install({ layout: "none", agents: ["codex"] }, dependencies);

  expect(result.agents).toEqual([{ id: "codex", outcome: "manual" }]);
  expect(writes(dependencies)).toEqual([]);
  expect(output(dependencies)).toContain("~/.codex/AGENTS.md");
});

test("skips an agent that is not set up on this machine", async () => {
  const dependencies = createDependencies({ pathExists: async () => false });

  const result = await install({ layout: "none", agents: ["claude"] }, dependencies);

  expect(result.agents).toEqual([{ id: "claude", outcome: "unavailable" }]);
  expect(output(dependencies)).toContain("not set up here");
});

test("reports an unreadable shipped skill instead of writing nothing quietly", async () => {
  const dependencies = createDependencies({
    readFile: async () => {
      throw new Error("ENOENT");
    },
  });

  const result = await install({ layout: "none", agents: ["claude"] }, dependencies);

  expect(result.agents[0]?.outcome).toBe("failed");
  expect(result.failures[0]).toContain(`cannot read ${skillSource}`);
});

test("offers what is here and what needs a hand, each with its state", async () => {
  const prompt = createPrompter({});
  const dependencies = createDependencies({
    isTerminal: true,
    prompt,
    pathExists: async (path) => path === "/home/user/.claude" || path === "/home/user/.codex",
  });

  await install({}, dependencies);

  expect(prompt.agents).toHaveBeenCalledWith({
    candidates: [
      { id: "claude", title: "Claude Code", state: "ready", path: claudeSkill },
      { id: "codex", title: "Codex", state: "manual" },
      { id: "opencode", title: "OpenCode", state: "missing" },
    ],
  });
});

test("tells the user how to skip the approval prompt for the command", async () => {
  const dependencies = createDependencies();

  await install({ layout: "none", agents: ["claude"] }, dependencies);

  expect(output(dependencies)).toContain("Bash(termwire open:*)");
});

test.each([
  ["layout", { layout: undefined }],
  ["agents", { agents: undefined }],
  ["confirm", { confirm: undefined }],
])("changes nothing when the user cancels at the %s prompt", async (_stage, answers) => {
  const dependencies = createDependencies({ isTerminal: true, prompt: createPrompter(answers) });

  const result = await install({}, dependencies);

  expect(result.cancelled).toBe(true);
  expect(writes(dependencies)).toEqual([]);
});

test("changes nothing when the user cancels the replace question", async () => {
  const dependencies = createDependencies({
    isTerminal: true,
    prompt: createPrompter({ replace: undefined }),
    pathExists: async () => true,
  });

  const result = await install({}, dependencies);

  expect(result.cancelled).toBe(true);
  expect(writes(dependencies)).toEqual([]);
});

test("leaves the config out of it when only agents were asked for", async () => {
  // The reported bug: a run meant for the agents exited 1 over a config nobody
  // mentioned. Now the config is not even part of such a run.
  const dependencies = createDependencies({ pathExists: async () => true });

  const result = await install({ agents: [], yes: true }, dependencies);

  expect(result.configWritten).toBe(false);
  expect(result.failures).toEqual([]);
  expect(writes(dependencies)).toEqual([]);
});

test("writes no config for an agents-only run on a machine that has none", async () => {
  const dependencies = createDependencies({ pathExists: async () => false });

  const result = await install({ agents: [], yes: true }, dependencies);

  expect(result.configWritten).toBe(false);
  expect(writes(dependencies)).toEqual([]);
});

test("keeps an existing config when the layout only defaulted, and does not fail", async () => {
  const dependencies = createDependencies({ pathExists: async () => true });

  const result = await install({ yes: true }, dependencies);

  expect(result.configWritten).toBe(false);
  expect(result.failures).toEqual([]);
  expect(output(dependencies)).toContain("Keeping /home/user/.config/termwire/config.jsonc");
});

test("asks nothing at all when the flags already said everything", async () => {
  // Both READMEs recommend this shape for a script; from a terminal it must not block.
  const prompt = createPrompter({});
  const dependencies = createDependencies({ isTerminal: true, prompt });

  await install({ layout: "none", agents: ["claude"] }, dependencies);

  expect(prompt.layout).not.toHaveBeenCalled();
  expect(prompt.agents).not.toHaveBeenCalled();
  expect(prompt.confirm).not.toHaveBeenCalled();
});

test("still confirms when something was asked", async () => {
  const prompt = createPrompter({ agents: ["claude"] });
  const dependencies = createDependencies({ isTerminal: true, prompt });

  await install({ layout: "none" }, dependencies);

  expect(prompt.agents).toHaveBeenCalled();
  expect(prompt.confirm).toHaveBeenCalled();
});

test("says in the plan that a skill cannot be installed, rather than promising a write", async () => {
  const confirm = mock<InstallPrompter["confirm"]>().mockResolvedValue(true);
  const dependencies = createDependencies({
    isTerminal: true,
    prompt: { ...createPrompter({ layout: "none", agents: ["claude"] }), confirm },
    readFile: async () => {
      throw new Error("ENOENT");
    },
  });

  await install({}, dependencies);

  expect(confirm.mock.calls[0]?.[0].summary.join("\n")).toContain("cannot install:");
});

test("asks before replacing a config, and writes it when told to", async () => {
  const prompt = createPrompter({ layout: "focused", replace: true });
  const dependencies = createDependencies({
    isTerminal: true,
    prompt,
    pathExists: async () => true,
  });

  await install({}, dependencies);

  expect(prompt.replace).toHaveBeenCalledWith({ path: globalPath });
  expect(writes(dependencies)).toEqual([
    { path: globalPath, contents: expect.stringContaining('"name": "work"'), force: true },
  ]);
});

test("keeps the config when the replace question is declined", async () => {
  const dependencies = createDependencies({
    isTerminal: true,
    prompt: createPrompter({ replace: false }),
    pathExists: async () => true,
  });

  const result = await install({}, dependencies);

  expect(result.configWritten).toBe(false);
  expect(writes(dependencies)).toEqual([]);
});

test("keeps a skill the user edited instead of overwriting it", async () => {
  const dependencies = createDependencies({
    pathExists: async () => true,
    readFile: async (path) => (path === skillSource ? skillText : "my own version\n"),
  });

  const result = await install({ layout: "none", agents: ["claude"] }, dependencies);

  expect(result.agents).toEqual([{ id: "claude", outcome: "kept" }]);
  expect(writes(dependencies)).toEqual([]);
  expect(output(dependencies)).toContain("pass --force to replace it");
});

test("replaces an edited skill when --force says so", async () => {
  const dependencies = createDependencies({
    pathExists: async () => true,
    readFile: async (path) => (path === skillSource ? skillText : "my own version\n"),
  });

  const result = await install({ layout: "none", agents: ["claude"], force: true }, dependencies);

  expect(result.agents).toEqual([{ id: "claude", outcome: "installed" }]);
  expect(writes(dependencies)).toEqual([{ path: claudeSkill, contents: skillText, force: true }]);
});

test("asks before replacing an edited skill in a terminal", async () => {
  const prompt = createPrompter({ layout: "none", agents: ["claude"], replace: true });
  const dependencies = createDependencies({
    isTerminal: true,
    prompt,
    pathExists: async (path) => path !== globalPath,
    readFile: async (path) => (path === skillSource ? skillText : "my own version\n"),
  });

  const result = await install({}, dependencies);

  expect(prompt.replace).toHaveBeenCalledWith({ path: claudeSkill });
  expect(result.agents).toEqual([{ id: "claude", outcome: "installed" }]);
});

test("reads the shipped skill once, however many agents take it", async () => {
  const readFile = mock<InstallDependencies["readFile"]>(async (path) =>
    path === skillSource ? skillText : "",
  );
  const dependencies = createDependencies({ readFile });

  await install({ layout: "none", agents: ["claude", "opencode"] }, dependencies);

  expect(readFile.mock.calls.filter(([path]) => path === skillSource)).toHaveLength(1);
});

test("asks nothing after the plan is confirmed, even for an edited skill", async () => {
  // Every question belongs before the confirmation; the summary has to say what happens.
  const confirm = mock<InstallPrompter["confirm"]>().mockResolvedValue(true);
  const replace = mock<InstallPrompter["replace"]>().mockResolvedValue(false);
  const order: string[] = [];
  const dependencies = createDependencies({
    isTerminal: true,
    pathExists: async (path) => path !== globalPath,
    readFile: async (path) => (path === skillSource ? skillText : "my own version\n"),
    prompt: {
      ...createPrompter({ layout: "none", agents: ["claude"] }),
      replace: mock<InstallPrompter["replace"]>(async (options) => {
        order.push("replace");
        return replace(options);
      }),
      confirm: mock<InstallPrompter["confirm"]>(async (options) => {
        order.push("confirm");
        return confirm(options);
      }),
    },
  });

  await install({}, dependencies);

  expect(order).toEqual(["replace", "confirm"]);
  expect(confirm.mock.calls[0]?.[0].summary).toContain(`Claude Code: keep your ${claudeSkill}`);
});

test("reports an unreadable existing skill instead of calling it the user's own", async () => {
  const dependencies = createDependencies({
    pathExists: async () => true,
    readFile: async (path) => {
      if (path === skillSource) return skillText;
      throw Object.assign(new Error("permission denied"), { code: "EACCES" });
    },
  });

  const result = await install({ layout: "none", agents: ["claude"] }, dependencies);

  expect(result.agents[0]?.outcome).toBe("failed");
  expect(result.failures[0]).toContain("permission denied");
});

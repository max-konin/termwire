import { join } from "node:path";
import {
  type AgentDefinition,
  type AgentId,
  type AgentPaths,
  agentDefinitions,
  findAgentDefinition,
  skillName,
} from "./agents.js";
import { skillMarker } from "./skill.js";

import { findLayoutTemplate, type LayoutTemplate, layoutTemplates } from "./templates.js";

export const noLayout = "none";

export type InstallLayoutChoice = LayoutTemplate["id"] | typeof noLayout;

export interface InstallRequest {
  layout?: string;
  project?: boolean;
  agents?: readonly AgentId[];
  force?: boolean;
  yes?: boolean;
}

/**
 * `ready` takes the skill, `manual` is set up here but has no skills to take it, and
 * `missing` is not installed at all.
 */
export type AgentState = "ready" | "manual" | "missing";

export interface AgentCandidate {
  id: AgentId;
  title: string;
  state: AgentState;
  /** Where the skill would go, for the agents that can take one. */
  path?: string;
}

/** Every prompt returns `undefined` when the user cancelled. */
export interface InstallPrompter {
  layout: (options: {
    templates: LayoutTemplate[];
    path: string;
    exists: boolean;
  }) => Promise<InstallLayoutChoice | undefined>;
  agents: (options: { candidates: AgentCandidate[] }) => Promise<readonly AgentId[] | undefined>;
  /** Asked only when a config is already there and no --force settled it. */
  replace: (options: { path: string }) => Promise<boolean | undefined>;
  confirm: (options: { summary: string[] }) => Promise<boolean | undefined>;
}

export interface InstallDependencies {
  cwd: () => string;
  findGitRoot: (cwd: string) => Promise<string | undefined>;
  globalConfigPath: () => string;
  agentPaths: AgentPaths;
  /** The SKILL.md shipped with the package, copied verbatim into each agent. */
  skillSource: string;
  pathExists: (path: string) => Promise<boolean>;
  readFile: (path: string) => Promise<string>;
  /** Shared with the layout config: atomic, and never clobbers without force. */
  writeConfig: (options: { path: string; contents: string; force: boolean }) => Promise<void>;
  write: (message: string) => void;
  /** Absent when nothing can be asked, which makes the run non-interactive. */
  prompt?: InstallPrompter;
  isTerminal: boolean;
}

export type AgentOutcomeKind =
  /** The skill was written. */
  | "installed"
  /** The same skill was already there, so this run left it alone. */
  | "present"
  /** A different skill was there — edited by hand, most likely — and was kept. */
  | "kept"
  /** Installed here, but takes no skills: the user has to add a line themselves. */
  | "manual"
  | "unavailable"
  | "failed";

export interface AgentOutcome {
  id: AgentId;
  outcome: AgentOutcomeKind;
  detail?: string;
}

export interface InstallResult {
  cancelled: boolean;
  configPath?: string;
  configWritten: boolean;
  agents: AgentOutcome[];
  failures: string[];
}

export async function install(
  request: InstallRequest,
  dependencies: InstallDependencies,
): Promise<InstallResult> {
  const interactive = isInteractive(request, dependencies);
  // A confirmation is only worth asking for what the user has not already said.
  const asked = { any: false };

  if (!interactive && !hasExplicitRequest(request)) {
    throw new Error(
      "install has nothing to do and no terminal to ask: pass --yes, --layout or --agents",
    );
  }

  const configPath = await resolveConfigPath(request, dependencies);
  const exists = await dependencies.pathExists(configPath);
  const cancelled: InstallResult = {
    cancelled: true,
    configWritten: false,
    agents: [],
    failures: [],
  };

  const chosen = await resolveLayout(request, dependencies, interactive, configPath, exists, asked);
  if (chosen === undefined) return cancelled;

  const decision = await decideExistingConfig(
    { chosen, exists, request, interactive, configPath, asked },
    dependencies,
  );
  if (decision === undefined) return cancelled;
  const { layout, force } = decision;

  const candidates = await agentCandidates(dependencies);
  const selected = await resolveAgents(request, dependencies, interactive, candidates, asked);
  if (selected === undefined) return cancelled;

  const skill = selected.length === 0 ? { contents: "" } : await readSkill(dependencies);
  const agents = await planAgents(
    { selected, candidates, force: request.force === true, interactive, skill, asked },
    dependencies,
  );
  if (agents === undefined) return cancelled;

  if (interactive && dependencies.prompt && asked.any) {
    const summary = planSummary({ configPath, layout, exists, force, agents });
    const accepted = await dependencies.prompt.confirm({ summary });
    if (accepted === undefined || !accepted) return cancelled;
  }

  return await apply({ configPath, layout, force, agents, skill }, dependencies);
}

/**
 * A config that is already there is only replaced when the user said so: `--force`, or a
 * yes to the prompt. A default layout nobody asked for keeps it instead of turning a run
 * that was really about agent registration into an error.
 */
async function decideExistingConfig(
  options: {
    chosen: InstallLayoutChoice;
    exists: boolean;
    request: InstallRequest;
    interactive: boolean;
    configPath: string;
    asked: { any: boolean };
  },
  dependencies: InstallDependencies,
): Promise<{ layout: InstallLayoutChoice; force: boolean } | undefined> {
  const force = options.request.force === true;
  if (options.chosen === noLayout || !options.exists || force) {
    return { layout: options.chosen, force };
  }

  if (options.interactive && dependencies.prompt) {
    options.asked.any = true;
    const replace = await dependencies.prompt.replace({ path: options.configPath });
    if (replace === undefined) return undefined;
    return replace ? { layout: options.chosen, force: true } : { layout: noLayout, force };
  }

  // A layout asked for by name conflicts with an existing file and is worth reporting;
  // a layout that merely defaulted is not.
  if (options.request.layout !== undefined) return { layout: options.chosen, force };

  dependencies.write(`Keeping ${options.configPath}; pass --layout <name> --force to replace it\n`);
  return { layout: noLayout, force };
}

function isInteractive(request: InstallRequest, dependencies: InstallDependencies): boolean {
  if (request.yes === true || dependencies.prompt === undefined) return false;
  return dependencies.isTerminal;
}

function hasExplicitRequest(request: InstallRequest): boolean {
  return request.yes === true || request.layout !== undefined || request.agents !== undefined;
}

async function resolveConfigPath(
  request: InstallRequest,
  dependencies: InstallDependencies,
): Promise<string> {
  if (request.project !== true) return dependencies.globalConfigPath();

  const gitRoot = await dependencies.findGitRoot(dependencies.cwd());
  if (gitRoot === undefined) {
    throw new Error("--project requires a Git repository");
  }
  return join(gitRoot, ".termwire.jsonc");
}

async function resolveLayout(
  request: InstallRequest,
  dependencies: InstallDependencies,
  interactive: boolean,
  path: string,
  exists: boolean,
  asked: { any: boolean },
): Promise<InstallLayoutChoice | undefined> {
  if (request.layout !== undefined) {
    if (request.layout === noLayout) return noLayout;
    const template = findLayoutTemplate(request.layout);
    if (template === undefined) {
      const known = [...layoutTemplates().map((entry) => entry.id), noLayout].join(", ");
      throw new Error(`unknown layout: ${request.layout} (expected ${known})`);
    }
    return template.id;
  }

  // Asked for agents and nothing else: do not create a config nobody mentioned.
  if (!interactive || dependencies.prompt === undefined) {
    return request.agents === undefined ? "default" : noLayout;
  }

  asked.any = true;
  return await dependencies.prompt.layout({ templates: layoutTemplates(), path, exists });
}

/**
 * An agent counts as here when its own directory is: that is what proves it has been set
 * up on this machine, and unlike a name on `PATH` it does not depend on a version
 * manager's shim being healthy.
 */
async function agentCandidates(dependencies: InstallDependencies): Promise<AgentCandidate[]> {
  return await Promise.all(agentDefinitions().map((agent) => agentCandidate(agent, dependencies)));
}

async function agentCandidate(
  agent: AgentDefinition,
  dependencies: InstallDependencies,
): Promise<AgentCandidate> {
  if (!(await dependencies.pathExists(agent.home(dependencies.agentPaths)))) {
    return { id: agent.id, title: agent.title, state: "missing" };
  }
  if (agent.skillPath === undefined) {
    return { id: agent.id, title: agent.title, state: "manual" };
  }

  return {
    id: agent.id,
    title: agent.title,
    state: "ready",
    path: agent.skillPath(dependencies.agentPaths),
  };
}

async function resolveAgents(
  request: InstallRequest,
  dependencies: InstallDependencies,
  interactive: boolean,
  candidates: AgentCandidate[],
  asked: { any: boolean },
): Promise<readonly AgentId[] | undefined> {
  if (request.agents !== undefined) return request.agents;
  if (!interactive || dependencies.prompt === undefined) return [];

  asked.any = true;
  return await dependencies.prompt.agents({ candidates });
}

export type AgentAction = "install" | "replace" | "keep" | "present" | "manual" | "unavailable";

export interface AgentPlan {
  id: AgentId;
  title: string;
  action: AgentAction;
  path?: string;
  /** Set when the skill could not be read at all. */
  error?: string;
}

/**
 * Decides what happens to each selected agent, asking whatever needs asking. Doing it
 * here rather than while writing keeps one promise: after the plan is confirmed, nothing
 * else interrupts, and the summary says everything that is about to happen.
 */
async function planAgents(
  options: {
    selected: readonly AgentId[];
    candidates: AgentCandidate[];
    force: boolean;
    interactive: boolean;
    skill: Skill;
    asked: { any: boolean };
  },
  dependencies: InstallDependencies,
): Promise<AgentPlan[] | undefined> {
  if (options.selected.length === 0) return [];

  const { skill } = options;
  const plans: AgentPlan[] = [];

  for (const id of options.selected) {
    const agent = findAgentDefinition(id);
    const candidate = options.candidates.find((entry) => entry.id === id);
    if (agent === undefined || candidate === undefined) continue;

    if (candidate.state === "missing") {
      plans.push({ id, title: agent.title, action: "unavailable" });
      continue;
    }
    if (candidate.state !== "ready" || candidate.path === undefined) {
      plans.push({ id, title: agent.title, action: "manual" });
      continue;
    }
    if ("error" in skill) {
      plans.push({
        id,
        title: agent.title,
        action: "install",
        path: candidate.path,
        error: skill.error,
      });
      continue;
    }

    const existing = await readExistingSkill(candidate.path, dependencies);
    if ("error" in existing) {
      plans.push({
        id,
        title: agent.title,
        action: "install",
        path: candidate.path,
        error: existing.error,
      });
      continue;
    }
    if (existing.contents === skill.contents) {
      plans.push({ id, title: agent.title, action: "present", path: candidate.path });
      continue;
    }
    if (existing.contents === undefined) {
      plans.push({ id, title: agent.title, action: "install", path: candidate.path });
      continue;
    }
    if (options.force || existing.contents.includes(skillMarker)) {
      plans.push({ id, title: agent.title, action: "replace", path: candidate.path });
      continue;
    }

    // Theirs, not ours: the marker is gone, so ask rather than overwrite in passing.
    if (!options.interactive || dependencies.prompt === undefined) {
      plans.push({ id, title: agent.title, action: "keep", path: candidate.path });
      continue;
    }
    options.asked.any = true;
    const replace = await dependencies.prompt.replace({ path: candidate.path });
    if (replace === undefined) return undefined;
    plans.push({
      id,
      title: agent.title,
      action: replace ? "replace" : "keep",
      path: candidate.path,
    });
  }

  return plans;
}

function planSummary(plan: {
  configPath: string;
  layout: InstallLayoutChoice;
  exists: boolean;
  force: boolean;
  agents: readonly AgentPlan[];
}): string[] {
  const lines: string[] = [];

  if (plan.layout === noLayout) {
    lines.push("Layout: leave the configuration alone");
  } else {
    const replacing = plan.exists ? (plan.force ? "replace" : "keep, already exists") : "write";
    lines.push(`Layout: ${plan.layout} — ${replacing} ${plan.configPath}`);
  }

  if (plan.agents.length === 0) {
    lines.push("Agents: none");
    return lines;
  }

  for (const agent of plan.agents) {
    lines.push(`${agent.title}: ${summariseAction(agent)}`);
  }

  return lines;
}

function summariseAction(agent: AgentPlan): string {
  if (agent.error !== undefined) return `cannot install: ${agent.error}`;
  if (agent.action === "manual") return "no skills, print the line to add";
  if (agent.action === "unavailable") return "not set up here, skip";
  if (agent.action === "present") return `already current at ${agent.path}`;
  if (agent.action === "keep") return `keep your ${agent.path}`;
  if (agent.action === "replace") return `replace ${agent.path}`;
  return `write ${agent.path}`;
}

async function apply(
  plan: {
    configPath: string;
    layout: InstallLayoutChoice;
    force: boolean;
    agents: readonly AgentPlan[];
    skill: Skill;
  },
  dependencies: InstallDependencies,
): Promise<InstallResult> {
  const result: InstallResult = {
    cancelled: false,
    configPath: plan.configPath,
    configWritten: false,
    agents: [],
    failures: [],
  };

  if (plan.layout !== noLayout) {
    const template = findLayoutTemplate(plan.layout);
    if (template === undefined) throw new Error(`unknown layout: ${plan.layout}`);
    try {
      await dependencies.writeConfig({
        path: plan.configPath,
        contents: template.contents,
        force: plan.force,
      });
      result.configWritten = true;
      dependencies.write(`Wrote ${plan.configPath} (${template.id})\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.failures.push(message);
      dependencies.write(`Config not written: ${message}\n`);
    }
  }

  for (const agent of plan.agents) {
    result.agents.push(await runAgentPlan(agent, plan.skill, dependencies));
  }

  for (const outcome of result.agents) {
    if (outcome.outcome === "failed" && outcome.detail !== undefined) {
      result.failures.push(outcome.detail);
    }
  }

  writeNextSteps(result, dependencies);
  return result;
}

type Skill = { contents: string } | { error: string };

async function readSkill(dependencies: InstallDependencies): Promise<Skill> {
  try {
    return { contents: await dependencies.readFile(dependencies.skillSource) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { error: `cannot read ${dependencies.skillSource}: ${reason}` };
  }
}

async function runAgentPlan(
  plan: AgentPlan,
  skill: Skill,
  dependencies: InstallDependencies,
): Promise<AgentOutcome> {
  const agent = findAgentDefinition(plan.id);

  if (plan.action === "unavailable") {
    dependencies.write(`${plan.title} is not set up here, skipping\n`);
    return { id: plan.id, outcome: "unavailable" };
  }

  if (plan.action === "manual") {
    dependencies.write(`${plan.title} takes no skills:\n`);
    if (agent !== undefined) writeManual(agent, dependencies);
    return { id: plan.id, outcome: "manual" };
  }

  if (plan.error !== undefined) {
    const detail = `${plan.title}: ${plan.error}`;
    dependencies.write(`${detail}\n`);
    return { id: plan.id, outcome: "failed", detail };
  }

  if (plan.action === "present") {
    dependencies.write(`${plan.title} already has the ${skillName} skill\n`);
    return { id: plan.id, outcome: "present" };
  }

  if (plan.action === "keep") {
    dependencies.write(`${plan.title}: keeping your ${plan.path}; pass --force to replace it\n`);
    return { id: plan.id, outcome: "kept" };
  }

  const path = plan.path;
  if (path === undefined) {
    const detail = `${plan.title}: no skill path`;
    return { id: plan.id, outcome: "failed", detail };
  }

  if ("error" in skill) {
    const detail = `${plan.title}: ${skill.error}`;
    return { id: plan.id, outcome: "failed", detail };
  }

  try {
    await dependencies.writeConfig({
      path,
      contents: skill.contents,
      force: plan.action === "replace",
    });
    dependencies.write(`Wrote ${path}\n`);
    return { id: plan.id, outcome: "installed" };
  } catch (error) {
    const detail = `${plan.title}: ${error instanceof Error ? error.message : String(error)}`;
    dependencies.write(`${detail}\n`);
    return { id: plan.id, outcome: "failed", detail };
  }
}

/**
 * The file that is there now, `undefined` contents when there is none. An unreadable file
 * is an error rather than "different": treating it as different would report it as the
 * user's own version and quietly keep whatever is broken there.
 */
async function readExistingSkill(
  path: string,
  dependencies: InstallDependencies,
): Promise<{ contents: string | undefined } | { error: string }> {
  if (!(await dependencies.pathExists(path))) return { contents: undefined };

  try {
    return { contents: await dependencies.readFile(path) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { error: `cannot read ${path}: ${reason}` };
  }
}

function writeManual(agent: AgentDefinition, dependencies: InstallDependencies): void {
  for (const line of agent.manual) {
    dependencies.write(line.length === 0 ? "\n" : `  ${line}\n`);
  }
  dependencies.write("\n");
}

function writeNextSteps(result: InstallResult, dependencies: InstallDependencies): void {
  if (!result.agents.some((agent) => agent.outcome === "installed")) return;

  dependencies.write(
    "The skill runs `termwire open`, so it works in a shell created by `termwire up`. " +
      "Allow it once with `Bash(termwire open:*)` to skip the approval prompt.\n",
  );
}

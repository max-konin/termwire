import type { z } from "zod";
import {
  type ConfigV1,
  configV1Schema,
  type LayoutConfig,
  type PaneConfig,
  type WindowConfig,
} from "./config-schema";
import type { LoadedConfig } from "./config-types";

const defaultLayout: LayoutConfig = {
  windows: [
    { name: "editor", panes: [{ id: "editor", role: "editor" }] },
    { name: "shell", panes: [{ id: "shell" }] },
  ],
};

export function resolveLayout(
  globalConfig?: LoadedConfig,
  projectConfig?: LoadedConfig,
): LayoutConfig {
  const global = globalConfig ? validateConfig(globalConfig) : undefined;
  const project = projectConfig ? validateConfig(projectConfig) : undefined;
  const globalWindows = global?.windows;
  const projectWindows = project?.windows;
  return copyLayout(projectWindows ?? globalWindows ?? defaultLayout.windows);
}

function expectUnique(source: string, path: string, values: Set<string>, value: string): void {
  if (values.has(value)) {
    throw new Error(`${source}: ${path}: must be unique`);
  }
  values.add(value);
}

function copyLayout(windows: LayoutConfig["windows"]): LayoutConfig {
  return {
    windows: windows.map((window) => ({
      ...window,
      panes: window.panes.map((pane) =>
        pane.command === undefined ? { ...pane } : { ...pane, command: [...pane.command] },
      ),
    })),
  };
}

function validateWindow(
  source: string,
  path: string,
  value: WindowConfig,
  names: Set<string>,
  editors: { count: number },
): void {
  expectUnique(source, `${path}.name`, names, value.name);

  validatePanes(source, path, value.panes, editors);
}

function validatePanes(
  source: string,
  windowPath: string,
  value: readonly PaneConfig[],
  editors: { count: number },
): void {
  const ids = new Set<string>();
  const earlierIds = new Set<string>();
  for (let paneIndex = 0; paneIndex < value.length; paneIndex += 1) {
    const panePath = `${windowPath}.panes[${paneIndex}]`;
    const id = validatePane(
      source,
      panePath,
      value[paneIndex],
      paneIndex,
      ids,
      earlierIds,
      editors,
    );
    earlierIds.add(id);
  }
}

function validatePane(
  source: string,
  path: string,
  value: PaneConfig,
  index: number,
  ids: Set<string>,
  earlierIds: Set<string>,
  editors: { count: number },
): string {
  expectUnique(source, `${path}.id`, ids, value.id);

  validateEditor(source, path, value, editors);

  validateSplitRules(source, path, value, index, earlierIds);

  return value.id;
}

function validateEditor(
  source: string,
  path: string,
  pane: PaneConfig,
  editors: { count: number },
): void {
  if (pane.role === "editor") {
    if (pane.command !== undefined) {
      throw new Error(`${source}: ${path}.command: is not allowed for the editor`);
    }
    editors.count += 1;
    if (editors.count > 1) {
      throw new Error(`${source}: ${path}.role: exactly one editor is required`);
    }
  }
}

function validateSplitRules(
  source: string,
  path: string,
  pane: PaneConfig,
  index: number,
  earlierIds: Set<string>,
): void {
  if (index === 0) {
    for (const key of ["splitFrom", "direction", "sizePercent"] as const) {
      if (pane[key] !== undefined) {
        throw new Error(`${source}: ${path}.${key}: is not allowed on the first pane`);
      }
    }
  } else {
    if (pane.splitFrom === undefined || !earlierIds.has(pane.splitFrom)) {
      throw new Error(`${source}: ${path}.splitFrom: must reference an earlier pane`);
    }
    if (pane.direction === undefined) {
      throw new Error(`${source}: ${path}.direction: must be horizontal or vertical`);
    }
  }
}

function expectSingleEditor(source: string, editors: { count: number }): void {
  if (editors.count !== 1) {
    throw new Error(`${source}: $.windows: exactly one editor is required`);
  }
}

function validateWindows(source: string, value: readonly WindowConfig[]): void {
  const names = new Set<string>();
  const editors = { count: 0 };
  for (let index = 0; index < value.length; index += 1) {
    validateWindow(source, `$.windows[${index}]`, value[index], names, editors);
  }

  expectSingleEditor(source, editors);
}

function validateConfig(config: LoadedConfig): ConfigV1 {
  const result = configV1Schema.safeParse(config.value);
  if (!result.success) {
    throw configError(config.source, result.error.issues[0]);
  }

  if (result.data.windows !== undefined) {
    validateWindows(config.source, result.data.windows);
  }

  return result.data;
}

function configError(source: string, issue: z.core.$ZodIssue): Error {
  const path = issue.code === "unrecognized_keys" ? [...issue.path, issue.keys[0]] : issue.path;
  return new Error(`${source}: ${jsonPath(path)}: ${issue.message}`);
}

function jsonPath(path: readonly PropertyKey[]): string {
  let result = "$";
  for (const segment of path) {
    if (typeof segment === "number") {
      result += `[${segment}]`;
    } else if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(String(segment))) {
      result += `.${String(segment)}`;
    } else {
      result += `[${JSON.stringify(String(segment))}]`;
    }
  }
  return result;
}

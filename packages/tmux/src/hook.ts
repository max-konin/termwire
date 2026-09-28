import { CommandError, type Exec, execute } from "./process.js";
import { assertNotEmpty } from "./validation.js";

export interface HookEntry {
  name: string;
  index?: number;
  command: string;
}

export interface ShowHooksOptions {
  global?: boolean;
}

export interface SetHookOptions {
  name: string;
  command: string;
  global?: boolean;
  append?: boolean;
}

export interface UnsetHookOptions {
  name: string;
  global?: boolean;
}

export function parseHooks(stdout: string): HookEntry[] {
  const entries: HookEntry[] = [];

  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;

    const separator = trimmed.indexOf(" ");
    const key = separator === -1 ? trimmed : trimmed.slice(0, separator);
    const command = separator === -1 ? "" : trimmed.slice(separator + 1);
    const parsed = /^([A-Za-z0-9_-]+)(?:\[(\d+)\])?$/.exec(key);
    if (!parsed) continue;

    const index = parsed[2];
    entries.push({
      name: parsed[1],
      ...(index === undefined ? {} : { index: Number(index) }),
      command,
    });
  }

  return entries;
}

export async function showHooks(exec: Exec, options: ShowHooksOptions = {}): Promise<HookEntry[]> {
  const command = ["tmux", "show-hooks", ...(options.global ? ["-g"] : [])];
  const execution = await execute(exec, command);

  if (execution.exitCode !== 0) {
    throw CommandError.from(command, execution);
  }

  return parseHooks(execution.stdout);
}

export async function setHook(exec: Exec, options: SetHookOptions): Promise<void> {
  assertNotEmpty("name", options.name);
  assertNotEmpty("command", options.command);

  const command = [
    "tmux",
    "set-hook",
    ...hookFlags(options.global, options.append),
    options.name,
    options.command,
  ];
  const execution = await execute(exec, command);

  if (execution.exitCode !== 0) {
    throw CommandError.from(command, execution);
  }
}

export async function unsetHook(exec: Exec, options: UnsetHookOptions): Promise<void> {
  assertNotEmpty("name", options.name);

  const command = ["tmux", "set-hook", options.global ? "-gu" : "-u", options.name];
  const execution = await execute(exec, command);

  if (execution.exitCode !== 0) {
    throw CommandError.from(command, execution);
  }
}

function hookFlags(global?: boolean, append?: boolean): string[] {
  const flags = `${global ? "g" : ""}${append ? "a" : ""}`;
  return flags.length === 0 ? [] : [`-${flags}`];
}

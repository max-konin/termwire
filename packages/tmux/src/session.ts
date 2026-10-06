import {
  appendCommand,
  appendEnvironment,
  readWindowPaneIds,
  type WindowPaneIds,
} from "./command.js";
import { CommandError, type Exec, execute } from "./process.js";
import { assertNotEmpty } from "./validation.js";

export interface NewSessionOptions {
  session: string;
  name?: string;
  cwd?: string;
  command?: readonly string[];
  environment?: Record<string, string | undefined>;
}

export async function hasSession(exec: Exec, session: string): Promise<boolean> {
  assertNotEmpty("session", session);

  const command = ["tmux", "has-session", "-t", `=${session}`];

  const execution = await execute(exec, command);

  if (execution.exitCode === 0) return true;
  if (execution.exitCode === 1) return false;

  throw CommandError.from(command, execution);
}

export async function setEnvironment(
  exec: Exec,
  session: string,
  key: string,
  value: string,
): Promise<void> {
  assertNotEmpty("session", session);
  assertNotEmpty("key", key);
  assertNotEmpty("value", value);

  const command = ["tmux", "set-environment", "-t", `=${session}`, key, value];
  const execution = await execute(exec, command);

  if (execution.exitCode !== 0) {
    throw CommandError.from(command, execution);
  }
}

export async function setSessionTitle(exec: Exec, session: string): Promise<void> {
  assertNotEmpty("session", session);

  const setTitlesCommand = ["tmux", "set-option", "-t", session, "set-titles", "on"];
  const setTitlesExecution = await execute(exec, setTitlesCommand);

  if (setTitlesExecution.exitCode !== 0) {
    throw CommandError.from(setTitlesCommand, setTitlesExecution);
  }

  const setTitlesStringCommand = [
    "tmux",
    "set-option",
    "-t",
    session,
    "set-titles-string",
    "#{session_name}",
  ];
  const setTitlesStringExecution = await execute(exec, setTitlesStringCommand);

  if (setTitlesStringExecution.exitCode !== 0) {
    throw CommandError.from(setTitlesStringCommand, setTitlesStringExecution);
  }
}

export async function killSession(exec: Exec, session: string): Promise<void> {
  assertNotEmpty("session", session);

  const command = ["tmux", "kill-session", "-t", `=${session}`];
  const execution = await execute(exec, command);

  if (execution.exitCode !== 0) {
    throw CommandError.from(command, execution);
  }
}

export async function newSession(exec: Exec, options: NewSessionOptions): Promise<WindowPaneIds> {
  assertNotEmpty("session", options.session);
  if (options.name !== undefined) assertNotEmpty("name", options.name);
  if (options.cwd !== undefined) assertNotEmpty("cwd", options.cwd);

  const command = [
    "tmux",
    "new-session",
    "-d",
    "-s",
    options.session,
    ...(options.name === undefined ? [] : ["-n", options.name]),
    "-P",
    "-F",
    "#{window_id}\t#{pane_id}",
  ];
  if (options.cwd !== undefined) command.push("-c", options.cwd);
  appendEnvironment(command, options.environment);
  appendCommand(command, options.command);

  const execution = await execute(exec, command);

  if (execution.exitCode !== 0) {
    throw CommandError.from(command, execution);
  }

  try {
    return readWindowPaneIds(execution.stdout);
  } catch (error) {
    try {
      await killSession(exec, options.session);
    } catch {
      // Preserve the original output parsing error.
    }
    throw error;
  }
}

export interface SessionSummary {
  name: string;
  attached: boolean;
  path: string;
}

/** The session path comes last, so a tab inside it cannot shift the other fields. */
const sessionFormat = "#{session_name}\t#{session_attached}\t#{session_path}";

export function parseSessionList(stdout: string): SessionSummary[] {
  const sessions: SessionSummary[] = [];

  for (const line of stdout.split("\n")) {
    const fields = line.split("\t");
    // Three fields or it is not a session row; the path keeps any tab of its own.
    if (fields.length < 3) continue;

    const [name, attached, ...path] = fields;
    if (name.length === 0) continue;

    sessions.push({ name, attached: Number(attached) > 0, path: path.join("\t") });
  }

  return sessions;
}

export async function listSessions(exec: Exec): Promise<SessionSummary[]> {
  const command = ["tmux", "list-sessions", "-F", sessionFormat];
  const execution = await execute(exec, command);

  // No server is no sessions, not a failure. The message differs by version — "no
  // server running on <socket>" on older tmux, "error connecting to <socket> (No such
  // file or directory)" on 3.6 — so the exit code decides. The cost is that an
  // unreadable socket exits 1 the same way and reads as an empty list.
  if (execution.exitCode === 1) return [];
  if (execution.exitCode !== 0) {
    throw CommandError.from(command, execution);
  }

  return parseSessionList(execution.stdout);
}

/** `show-environment` prints `NAME=value` per line, and `-NAME` for a removed one. */
export function parseEnvironment(stdout: string): Record<string, string> {
  const environment: Record<string, string> = {};

  for (const line of stdout.split("\n")) {
    if (line.startsWith("-")) continue;

    const separator = line.indexOf("=");
    if (separator <= 0) continue;

    environment[line.slice(0, separator)] = line.slice(separator + 1);
  }

  return environment;
}

export async function showEnvironment(
  exec: Exec,
  session: string,
): Promise<Record<string, string>> {
  assertNotEmpty("session", session);

  const command = ["tmux", "show-environment", "-t", `=${session}`];
  const execution = await execute(exec, command);

  // Exit 1 is "no such session": it closed between being listed and being read, and a
  // session that no longer exists has no environment rather than an error.
  if (execution.exitCode === 1) return {};
  if (execution.exitCode !== 0) {
    throw CommandError.from(command, execution);
  }

  return parseEnvironment(execution.stdout);
}

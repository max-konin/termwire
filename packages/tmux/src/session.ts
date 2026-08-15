import { appendCommand, appendEnvironment, readWindowPaneIds, type WindowPaneIds } from "./command";
import { CommandError, type Exec, execute } from "./process";
import { assertNotEmpty } from "./validation";

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

  const setTitlesCommand = ["tmux", "set-option", "-t", `=${session}`, "set-titles", "on"];
  const setTitlesExecution = await execute(exec, setTitlesCommand);

  if (setTitlesExecution.exitCode !== 0) {
    throw CommandError.from(setTitlesCommand, setTitlesExecution);
  }

  const setTitlesStringCommand = [
    "tmux",
    "set-option",
    "-t",
    `=${session}`,
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

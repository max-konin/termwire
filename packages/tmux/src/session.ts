import { appendCommand, appendEnvironment, readWindowPaneIds, type WindowPaneIds } from "./command";
import { CommandError, type Exec, execute } from "./process";
import { assertNotEmpty } from "./validation";

export interface NewSessionOptions {
  session: string;
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

export async function newSession(exec: Exec, options: NewSessionOptions): Promise<WindowPaneIds> {
  assertNotEmpty("session", options.session);
  if (options.cwd !== undefined) assertNotEmpty("cwd", options.cwd);

  const command = [
    "tmux",
    "new-session",
    "-d",
    "-s",
    options.session,
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

  return readWindowPaneIds(execution.stdout);
}

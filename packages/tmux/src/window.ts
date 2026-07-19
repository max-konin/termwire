import { appendCommand, appendEnvironment, readWindowPaneIds, type WindowPaneIds } from "./command";
import { CommandError, type Exec, execute } from "./process";
import { assertNotEmpty } from "./validation";

export interface NewWindowOptions {
  target: string;
  cwd?: string;
  command?: readonly string[];
  environment?: Record<string, string | undefined>;
}

export async function newWindow(exec: Exec, options: NewWindowOptions): Promise<WindowPaneIds> {
  assertNotEmpty("target", options.target);
  if (options.cwd !== undefined) assertNotEmpty("cwd", options.cwd);

  const command = [
    "tmux",
    "new-window",
    "-d",
    "-t",
    `=${options.target}`,
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

export async function selectWindow(exec: Exec, target: string): Promise<void> {
  assertNotEmpty("target", target);

  const command = ["tmux", "select-window", "-t", target];

  const execution = await execute(exec, command);

  if (execution.exitCode !== 0) {
    throw CommandError.from(command, execution);
  }
}

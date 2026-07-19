import { appendCommand, appendEnvironment, readPaneId } from "./command";
import { CommandError, type Exec, execute } from "./process";
import { assertNotEmpty, ValidationError } from "./validation";

export interface SplitPaneOptions {
  target: string;
  direction: "horizontal" | "vertical";
  sizePercent?: number;
  cwd?: string;
  command?: readonly string[];
  environment?: Record<string, string | undefined>;
}

export async function splitPane(exec: Exec, options: SplitPaneOptions): Promise<string> {
  assertNotEmpty("target", options.target);
  if (options.cwd !== undefined) assertNotEmpty("cwd", options.cwd);
  if (
    options.sizePercent !== undefined &&
    (!Number.isInteger(options.sizePercent) || options.sizePercent < 1 || options.sizePercent > 100)
  ) {
    throw new ValidationError("sizePercent", "sizePercent must be an integer from 1 to 100");
  }

  const command = [
    "tmux",
    "split-window",
    "-d",
    "-t",
    options.target,
    options.direction === "horizontal" ? "-h" : "-v",
    ...(options.sizePercent === undefined ? [] : ["-p", String(options.sizePercent)]),
    "-P",
    "-F",
    "#{pane_id}",
  ];
  if (options.cwd !== undefined) command.push("-c", options.cwd);
  appendEnvironment(command, options.environment);
  appendCommand(command, options.command);

  const execution = await execute(exec, command);

  if (execution.exitCode !== 0) {
    throw CommandError.from(command, execution);
  }

  return readPaneId(execution.stdout);
}

export async function sendKeys(
  exec: Exec,
  target: string,
  keys: readonly string[],
  options: { literal?: boolean } = {},
): Promise<void> {
  assertNotEmpty("target", target);
  if (keys.length === 0) {
    throw new ValidationError("keys", "keys must not be empty");
  }

  const command = ["tmux", "send-keys", "-t", target];
  if (options.literal) command.push("-l", "--");
  command.push(...keys);

  const execution = await execute(exec, command);

  if (execution.exitCode !== 0) {
    throw CommandError.from(command, execution);
  }
}

export async function selectPane(exec: Exec, target: string): Promise<void> {
  assertNotEmpty("target", target);

  const command = ["tmux", "select-pane", "-t", target];

  const execution = await execute(exec, command);

  if (execution.exitCode !== 0) {
    throw CommandError.from(command, execution);
  }
}

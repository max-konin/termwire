import { CommandError, type Exec, execute } from "./process";
import { assertNotEmpty, ValidationError } from "./validation";

export async function openFile(
  exec: Exec,
  socket: string,
  file: string,
  line?: number,
): Promise<void> {
  assertNotEmpty("socket", socket);
  assertNotEmpty("file", file);

  if (line !== undefined && (!Number.isInteger(line) || line < 1)) {
    throw new ValidationError("line", "line must be a positive integer");
  }

  const command = ["nvim", "--headless", "--server", socket, "--remote", file];

  const execution = await execute(exec, command);

  if (execution.exitCode !== 0) {
    throw CommandError.from(command, execution);
  }

  if (line === undefined) return;

  const jumpCommand = [
    "nvim",
    "--headless",
    "--server",
    socket,
    "--remote-send",
    `<C-\\><C-N>${line}G`,
  ];

  const jumpExecution = await execute(exec, jumpCommand);

  if (jumpExecution.exitCode !== 0) {
    throw CommandError.from(jumpCommand, jumpExecution);
  }
}

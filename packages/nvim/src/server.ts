import { type Exec, execute } from "./process.js";
import { assertNotEmpty } from "./validation.js";

export async function isRunning(exec: Exec, socket: string): Promise<boolean> {
  assertNotEmpty("socket", socket);

  const command = ["nvim", "--headless", "--server", socket, "--remote-expr", "1"];

  const execution = await execute(exec, command);

  return execution.exitCode === 0 && execution.stdout.trim() === "1";
}

import { CommandError, type Exec, execute } from "./process";
import { assertNotEmpty } from "./validation";

export async function attach(
  exec: Exec,
  env: Record<string, string | undefined>,
  session: string,
): Promise<void> {
  assertNotEmpty("session", session);

  const internal = env.TMUX !== undefined && env.TMUX.length > 0;
  const command = internal
    ? ["tmux", "switch-client", "-t", `=${session}`]
    : ["tmux", "attach-session", "-t", `=${session}`];
  const options = internal ? undefined : { stdio: "inherit" as const };

  const execution = await execute(exec, command, options);

  if (execution.exitCode !== 0) {
    throw CommandError.from(command, execution);
  }
}

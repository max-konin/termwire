import { spawn } from "node:child_process";

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface ExecOptions {
  /**
   * Hands the terminal to the child instead of capturing it. `tmux attach-session`
   * needs it — without a terminal tmux refuses with "open terminal failed" — and so
   * does any command that asks the user its own questions.
   */
  stdio?: "inherit";
}

export type Exec = (argv: readonly string[], options?: ExecOptions) => Promise<ExecResult>;

export async function spawnCapture(
  argv: readonly string[],
  options: ExecOptions = {},
): Promise<ExecResult> {
  const [command, ...args] = argv;

  if (command === undefined) {
    throw new Error("command must not be empty");
  }

  const inherited = options.stdio === "inherit";

  return await new Promise<ExecResult>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: inherited ? "inherit" : ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.setEncoding("utf8").on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.setEncoding("utf8").on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.once("error", reject);
    child.once("close", (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}

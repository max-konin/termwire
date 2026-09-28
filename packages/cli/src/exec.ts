import { spawn } from "node:child_process";

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type Exec = (argv: readonly string[]) => Promise<ExecResult>;

export async function spawnCapture(argv: readonly string[]): Promise<ExecResult> {
  const [command, ...args] = argv;

  if (command === undefined) {
    throw new Error("command must not be empty");
  }

  return await new Promise<ExecResult>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.once("error", reject);
    child.once("close", (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}

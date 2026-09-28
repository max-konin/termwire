import { spawn } from "node:child_process";

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface ExecOptions {
  stdio?: "inherit";
}

export type Exec = (argv: readonly string[], options?: ExecOptions) => Promise<ExecResult>;

export class CommandError extends Error {
  constructor(
    readonly command: readonly string[],
    readonly exitCode: number | null,
    readonly stdout: string,
    readonly stderr: string,
    cause?: unknown,
  ) {
    super(`Command failed: ${command.join(" ")}`, { cause });
    this.name = "CommandError";
  }

  static from(
    command: readonly string[],
    result: Omit<ExecResult, "exitCode"> & { exitCode: number | null },
    cause?: unknown,
  ): CommandError {
    return new CommandError(command, result.exitCode, result.stdout, result.stderr, cause);
  }
}

export async function execute(
  exec: Exec,
  command: readonly string[],
  options?: ExecOptions,
): Promise<ExecResult> {
  try {
    return await exec(command, options);
  } catch (cause) {
    throw CommandError.from(command, { exitCode: null, stdout: "", stderr: "" }, cause);
  }
}

export async function spawnExec(
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

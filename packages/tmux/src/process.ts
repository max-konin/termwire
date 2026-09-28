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
    readonly argv: readonly string[],
    readonly exitCode: number | null,
    readonly stderr: string,
    options?: ErrorOptions,
  ) {
    const status = exitCode === null ? "unknown" : String(exitCode);
    const details = stderr.trim();
    super(
      `Command failed (exit ${status}): ${argv.join(" ")}${details ? `: ${details}` : ""}`,
      options,
    );
    this.name = "CommandError";
  }

  static from(argv: readonly string[], result: ExecResult): CommandError {
    return new CommandError(argv, result.exitCode, result.stderr);
  }
}

export async function execute(
  exec: Exec,
  argv: readonly string[],
  options?: ExecOptions,
): Promise<ExecResult> {
  try {
    return await exec(argv, options);
  } catch (cause) {
    throw new CommandError(argv, null, "", { cause });
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

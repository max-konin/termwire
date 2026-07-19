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

export async function bunExec(
  argv: readonly string[],
  options: ExecOptions = {},
): Promise<ExecResult> {
  const inherited = options.stdio === "inherit";
  const process = Bun.spawn([...argv], {
    stdin: inherited ? "inherit" : "ignore",
    stdout: inherited ? "inherit" : "pipe",
    stderr: inherited ? "inherit" : "pipe",
  });

  const exitCode = await process.exited;

  const stdout = inherited ? "" : await new Response(process.stdout).text();
  const stderr = inherited ? "" : await new Response(process.stderr).text();

  return { exitCode, stdout, stderr };
}

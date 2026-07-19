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

export async function bunExec(argv: readonly string[], options?: ExecOptions): Promise<ExecResult> {
  const inherited = options?.stdio === "inherit";

  const proc = Bun.spawn(
    [...argv],
    inherited
      ? { stdin: "inherit", stdout: "inherit", stderr: "inherit" }
      : { stdout: "pipe", stderr: "pipe" },
  );
  const exitCode = await proc.exited;

  if (inherited) {
    return { exitCode, stdout: "", stderr: "" };
  }

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  return { exitCode, stdout, stderr };
}

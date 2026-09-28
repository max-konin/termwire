import type { Exec } from "./exec.js";

export const sessionVariable = "TERMWIRE_SESSION";

export interface ProcessEntry {
  pid: number;
  ppid: number;
}

export interface ProcessScan {
  /** Every process visible to the current user, used to protect our own ancestors. */
  processes: ProcessEntry[];
  /** Processes whose environment carries the scanned session label. */
  labeled: number[];
}

export type ProcessScanner = (session: string) => Promise<ProcessScan>;

export interface DarwinScanDependencies {
  exec: Exec;
  uid: number;
}

export interface LinuxScanDependencies {
  readdir: (path: string) => Promise<string[]>;
  readFile: (path: string) => Promise<string>;
}

export interface ProcessScannerDependencies extends DarwinScanDependencies, LinuxScanDependencies {
  platform: string;
}

export interface DarwinProcessRow extends ProcessEntry {
  /** The command line, followed by the environment when `ps -E` could read it. */
  details: string;
}

export function createProcessScanner(dependencies: ProcessScannerDependencies): ProcessScanner {
  if (dependencies.platform === "darwin") {
    return createDarwinScanner(dependencies);
  }
  if (dependencies.platform === "linux") {
    return createLinuxScanner(dependencies);
  }
  throw new Error(`process scanning is not supported on ${dependencies.platform}`);
}

export function parseDarwinProcesses(stdout: string): DarwinProcessRow[] {
  const rows: DarwinProcessRow[] = [];

  for (const line of stdout.split("\n")) {
    const parsed = /^\s*(\d+)\s+(\d+)\s(.*)$/.exec(line);
    if (!parsed) continue;
    rows.push({ pid: Number(parsed[1]), ppid: Number(parsed[2]), details: parsed[3] });
  }

  return rows;
}

export function parseDarwinArguments(stdout: string): Map<number, string> {
  const args = new Map<number, string>();

  for (const line of stdout.split("\n")) {
    const parsed = /^\s*(\d+)\s(.*)$/.exec(line);
    if (!parsed) continue;
    args.set(Number(parsed[1]), parsed[2]);
  }

  return args;
}

export function parseLinuxPpid(stat: string): number | undefined {
  const commandEnd = stat.lastIndexOf(")");
  if (commandEnd === -1) return undefined;

  const fields = stat
    .slice(commandEnd + 1)
    .trim()
    .split(/\s+/);
  const ppid = Number(fields[1]);
  return Number.isInteger(ppid) ? ppid : undefined;
}

/**
 * True when `text` assigns `needle`, meaning the match is a whole space-separated
 * token. A command line that merely mentions the variable never qualifies.
 */
export function containsAssignment(text: string, needle: string): boolean {
  let index = text.indexOf(needle);

  while (index !== -1) {
    const before = index === 0 ? " " : text.charAt(index - 1);
    const after = index + needle.length >= text.length ? " " : text.charAt(index + needle.length);
    if (/\s/.test(before) && /\s/.test(after)) return true;
    index = text.indexOf(needle, index + 1);
  }

  return false;
}

/**
 * macOS has no `/proc`, so the environment comes from `ps -E`, which appends it to
 * the command column. A process that only mentions the label on its command line
 * would look identical, so every candidate is re-read without `-E` and the command
 * line is stripped off before the label is looked up in what remains.
 */
function createDarwinScanner(dependencies: DarwinScanDependencies): ProcessScanner {
  return async (session) => {
    const needle = `${sessionVariable}=${session}`;
    const rows = parseDarwinProcesses(
      await runPs(dependencies.exec, [
        "ps",
        "-Eww",
        "-o",
        "pid=,ppid=,command=",
        "-U",
        String(dependencies.uid),
      ]),
    );
    const processes = rows.map(({ pid, ppid }) => ({ pid, ppid }));
    const candidates = rows.filter((row) => containsAssignment(row.details, needle));

    if (candidates.length === 0) {
      return { processes, labeled: [] };
    }

    const args = parseDarwinArguments(
      await runPs(
        dependencies.exec,
        ["ps", "-ww", "-o", "pid=,args=", "-p", candidates.map((c) => c.pid).join(",")],
        // `ps` exits non-zero when none of the requested pids exist any more, and a
        // candidate that just died is simply not a target.
        { allowMissingPids: true },
      ),
    );
    const labeled = candidates
      .filter((row) => {
        const argv = args.get(row.pid);
        if (argv === undefined || !row.details.startsWith(argv)) return false;
        return containsAssignment(row.details.slice(argv.length), needle);
      })
      .map((row) => row.pid);

    return { processes, labeled };
  };
}

function createLinuxScanner(dependencies: LinuxScanDependencies): ProcessScanner {
  return async (session) => {
    const label = `${sessionVariable}=${session}`;
    const processes: ProcessEntry[] = [];
    const labeled: number[] = [];

    for (const entry of await dependencies.readdir("/proc")) {
      if (!/^\d+$/.test(entry)) continue;
      const pid = Number(entry);

      const stat = await readOptional(dependencies, `/proc/${entry}/stat`);
      if (stat === undefined) continue;
      const ppid = parseLinuxPpid(stat);
      if (ppid === undefined) continue;
      processes.push({ pid, ppid });

      // Readable only for our own processes, so other users are skipped silently.
      const environ = await readOptional(dependencies, `/proc/${entry}/environ`);
      if (environ === undefined) continue;
      if (environ.split("\0").includes(label)) labeled.push(pid);
    }

    return { processes, labeled };
  };
}

async function runPs(
  exec: Exec,
  argv: readonly string[],
  options: { allowMissingPids?: boolean } = {},
): Promise<string> {
  const execution = await exec(argv);

  if (execution.exitCode === 0) return execution.stdout;
  if (options.allowMissingPids && execution.stdout.trim().length === 0) return "";

  // A failed listing must not read as an empty one: that would log a clean reap
  // while the processes it exists to kill keep running.
  const details = execution.stderr.trim();
  throw new Error(
    `${argv.join(" ")} failed (exit ${execution.exitCode})${details ? `: ${details}` : ""}`,
  );
}

async function readOptional(
  dependencies: LinuxScanDependencies,
  path: string,
): Promise<string | undefined> {
  try {
    return await dependencies.readFile(path);
  } catch {
    return undefined;
  }
}

import type { Exec } from "./exec.js";
import {
  emptyLabels,
  type ProcessEntry,
  type SessionScanner,
  sessionLabel,
} from "./process-scan.js";

export interface DarwinScanDependencies {
  exec: Exec;
  uid: number;
}

export interface DarwinProcessRow extends ProcessEntry {
  /** The command line, followed by the environment when `ps -E` could read it. */
  details: string;
}

/**
 * One row of `ps -o pid=,ppid=,rss=,command=`: three right-aligned numbers, then
 * everything after the first space as a single field, because the command line and
 * the environment `-E` appends to it are not separable here.
 */
const processRow = /^\s*(\d+)\s+(\d+)\s+(\d+)\s(.*)$/;

/** One row of `ps -o pid=,args=`: the pid, then the command line by itself. */
const argumentsRow = /^\s*(\d+)\s(.*)$/;

export function parseDarwinProcesses(stdout: string): DarwinProcessRow[] {
  const rows: DarwinProcessRow[] = [];

  for (const line of stdout.split("\n")) {
    const parsed = processRow.exec(line);
    if (!parsed) continue;
    rows.push({
      pid: Number(parsed[1]),
      ppid: Number(parsed[2]),
      rss: Number(parsed[3]),
      details: parsed[4],
    });
  }

  return rows;
}

export function parseDarwinArguments(stdout: string): Map<number, string> {
  const args = new Map<number, string>();

  for (const line of stdout.split("\n")) {
    const parsed = argumentsRow.exec(line);
    if (!parsed) continue;
    args.set(Number(parsed[1]), parsed[2]);
  }

  return args;
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
export function createDarwinScanner(dependencies: DarwinScanDependencies): SessionScanner {
  return async (sessions) => {
    const needles = new Map(sessions.map((session) => [session, sessionLabel(session)]));
    const rows = parseDarwinProcesses(
      await runPs(dependencies.exec, [
        "ps",
        "-Eww",
        "-o",
        "pid=,ppid=,rss=,command=",
        "-U",
        String(dependencies.uid),
      ]),
    );
    const processes = rows.map(({ pid, ppid, rss }) => ({ pid, ppid, rss }));
    const labeled = emptyLabels(sessions);
    // Hoisted: this runs once per process on the machine, times the sessions asked for.
    const wanted = [...needles.values()];
    const candidates = rows.filter((row) =>
      wanted.some((needle) => containsAssignment(row.details, needle)),
    );

    if (candidates.length === 0) {
      return { processes, labeled };
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

    for (const row of candidates) {
      const argv = args.get(row.pid);
      if (argv === undefined || !row.details.startsWith(argv)) continue;

      const environment = row.details.slice(argv.length);
      for (const [session, needle] of needles) {
        if (containsAssignment(environment, needle)) labeled.get(session)?.push(row.pid);
      }
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

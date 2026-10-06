import {
  emptyLabels,
  type ProcessEntry,
  type SessionScanner,
  sessionLabel,
} from "./process-scan.js";

export interface LinuxScanDependencies {
  readdir: (path: string) => Promise<string[]>;
  readFile: (path: string) => Promise<string>;
}

/**
 * `/proc/<pid>/statm` counts pages, and Node exposes no page size, so the common
 * 4 KiB is assumed: a kernel with larger pages only understates the column.
 */
const pageKib = 4;

/** A `/proc` entry that is a process rather than `self` or `uptime`: digits only. */
const processDirectory = /^\d+$/;

/** The second field of `statm` is the resident set, in pages. */
export function parseLinuxRss(statm: string): number {
  const pages = Number(statm.trim().split(/\s+/)[1]);
  return Number.isInteger(pages) ? pages * pageKib : 0;
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
 * Linux reads the environment straight out of `/proc`, where it is NUL-separated, so
 * a label is an exact element and no command line can be mistaken for one.
 */
export function createLinuxScanner(dependencies: LinuxScanDependencies): SessionScanner {
  return async (sessions) => {
    const needles = new Map(sessions.map((session) => [session, sessionLabel(session)]));
    const processes: ProcessEntry[] = [];
    const labeled = emptyLabels(sessions);

    for (const entry of await dependencies.readdir("/proc")) {
      if (!processDirectory.test(entry)) continue;
      const pid = Number(entry);

      const stat = await readOptional(dependencies, `/proc/${entry}/stat`);
      if (stat === undefined) continue;
      const ppid = parseLinuxPpid(stat);
      if (ppid === undefined) continue;
      const statm = await readOptional(dependencies, `/proc/${entry}/statm`);
      processes.push({ pid, ppid, rss: statm === undefined ? 0 : parseLinuxRss(statm) });

      // Readable only for our own processes, so other users are skipped silently.
      const environ = await readOptional(dependencies, `/proc/${entry}/environ`);
      if (environ === undefined) continue;

      const assignments = new Set(environ.split("\0"));
      for (const [session, needle] of needles) {
        if (assignments.has(needle)) labeled.get(session)?.push(pid);
      }
    }

    return { processes, labeled };
  };
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

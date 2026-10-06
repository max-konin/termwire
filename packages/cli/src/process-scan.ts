/**
 * What a process scan is, independent of how a platform performs one.
 *
 * A platform module exports a factory that takes only its own dependencies and
 * returns a `SessionScanner`; `runtime.ts` picks one. Adding a platform is a new
 * module beside this one plus a branch there, and nothing else changes: `reap` and
 * `ls` depend on the type, never on a platform.
 *
 * A new module has to honour five things, and the first two have teeth:
 *
 * 1. `processes` lists **every** process visible to this user, labeled or not. The
 *    reap protects itself, the tmux server and their ancestors with it, so a partial
 *    list is how a reap comes to signal its own parent.
 * 2. A listing that fails throws. Returning an empty scan reads as "nothing to kill",
 *    and the reap would log a clean sweep while the processes it exists to kill keep
 *    running.
 * 3. A pid counts as labeled only when `TERMWIRE_SESSION=<session>` is in its
 *    environment. A command line that merely mentions the label is not a match.
 * 4. `labeled` carries a key for every requested session, empty list included, which
 *    `emptyLabels` is for.
 * 5. `rss` is in KiB, and 0 when the platform cannot say.
 */

export const sessionVariable = "TERMWIRE_SESSION";

export interface ProcessEntry {
  pid: number;
  ppid: number;
  /** Resident set size in KiB, the unit `ps -o rss=` already reports. */
  rss: number;
}

export interface ProcessScan {
  /** Every process visible to the current user, used to protect our own ancestors. */
  processes: ProcessEntry[];
  /** Processes whose environment carries the scanned session label. */
  labeled: number[];
}

export interface SessionScan {
  processes: ProcessEntry[];
  /** The labeled pids of each requested session, that session's own key. */
  labeled: Map<string, number[]>;
}

export type ProcessScanner = (session: string) => Promise<ProcessScan>;

/**
 * Several sessions from one walk over the process table. `ls` reads every workspace
 * at once, and a walk per workspace would cost a full process listing each time.
 */
export type SessionScanner = (sessions: readonly string[]) => Promise<SessionScan>;

/** The assignment a labeled process carries, and what a scanner looks for. */
export function sessionLabel(session: string): string {
  return `${sessionVariable}=${session}`;
}

export function emptyLabels(sessions: readonly string[]): Map<string, number[]> {
  return new Map(sessions.map((session) => [session, []]));
}

/** The reap works one session at a time, and asks a scanner for exactly that. */
export function toSingleSession(scan: SessionScanner): ProcessScanner {
  return async (session) => {
    const { processes, labeled } = await scan([session]);
    return { processes, labeled: labeled.get(session) ?? [] };
  };
}

import { isAbsolute, join } from "node:path";
import type { ProcessScan, ProcessScanner } from "./process-scan.js";

export type ReapSignal = "SIGTERM" | "SIGKILL" | 0;
export type KillOutcome = "signalled" | "gone" | "denied";

export interface ReapDependencies {
  scan: ProcessScanner;
  kill: (pid: number, signal: ReapSignal) => KillOutcome;
  wait: (milliseconds: number) => Promise<void>;
  selfPid: number;
  /** The tmux server, which the hook detaches from and may itself carry the label. */
  serverPid?: number;
  graceMs?: number;
  settleMs?: number;
}

export interface ReapReport {
  session: string;
  targets: number[];
  terminated: number[];
  killed: number[];
  survived: number[];
  denied: number[];
  /** Still alive at escalation time, but no longer labeled: a recycled pid. */
  unlabeled: number[];
}

export const defaultGraceMs = 2000;
export const defaultSettleMs = 250;
const killRounds = 2;

/**
 * Processes never worth signalling: this process, the tmux server, whatever either
 * of them descends from, and init.
 *
 * Walking up from this process alone is not enough. The hook detaches the reap with
 * `&`, so the forking shell is gone and this process is already a child of init by
 * the time it scans. The tmux server is therefore not an ancestor, and it does
 * inherit the environment of whoever started it, label included: without naming it
 * the reap would kill the server and every other session on it.
 */
export function protectedPids(scan: ProcessScan, selfPid: number, serverPid?: number): Set<number> {
  const parents = new Map(scan.processes.map((entry) => [entry.pid, entry.ppid]));
  const protectedSet = new Set<number>([0, 1, selfPid]);
  if (serverPid !== undefined) protectedSet.add(serverPid);

  for (const start of [selfPid, serverPid]) {
    if (start === undefined) continue;
    let current = parents.get(start);
    while (current !== undefined && !protectedSet.has(current)) {
      protectedSet.add(current);
      current = parents.get(current);
    }
  }

  return protectedSet;
}

export function selectTargets(scan: ProcessScan, selfPid: number, serverPid?: number): number[] {
  const excluded = protectedPids(scan, selfPid, serverPid);
  return [...new Set(scan.labeled)].filter((pid) => !excluded.has(pid)).sort((a, b) => a - b);
}

/** Parses the server pid out of `TMUX`, which tmux sets to `socket,pid,session`. */
export function parseTmuxServerPid(tmux: string | undefined): number | undefined {
  const pid = Number(tmux?.split(",")[1]);
  return Number.isInteger(pid) && pid > 0 ? pid : undefined;
}

export async function reapSession(
  session: string,
  dependencies: ReapDependencies,
): Promise<ReapReport> {
  const scan = await dependencies.scan(session);
  const targets = selectTargets(scan, dependencies.selfPid, dependencies.serverPid);
  const denied = new Set<number>();

  if (targets.length === 0) {
    return {
      session,
      targets,
      terminated: [],
      killed: [],
      survived: [],
      denied: [],
      unlabeled: [],
    };
  }

  for (const pid of targets) {
    if (dependencies.kill(pid, "SIGTERM") === "denied") denied.add(pid);
  }
  await dependencies.wait(dependencies.graceMs ?? defaultGraceMs);

  const survivingPids = targets.filter((pid) => dependencies.kill(pid, 0) !== "gone");
  const terminated = targets.filter((pid) => !survivingPids.includes(pid));

  // The grace period is long enough for a pid to be freed and handed to something
  // else, so survivors are confirmed against a fresh scan before SIGKILL. A scan
  // that fails here aborts the escalation rather than risk an innocent pid.
  const relabeled =
    survivingPids.length === 0
      ? new Set<number>()
      : new Set(
          selectTargets(
            await dependencies.scan(session),
            dependencies.selfPid,
            dependencies.serverPid,
          ),
        );
  let alive = survivingPids.filter((pid) => relabeled.has(pid));
  const unlabeled = survivingPids.filter((pid) => !relabeled.has(pid));
  const killed: number[] = [];

  for (let round = 0; round < killRounds && alive.length > 0; round += 1) {
    for (const pid of alive) {
      if (dependencies.kill(pid, "SIGKILL") === "denied") denied.add(pid);
    }
    await dependencies.wait(dependencies.settleMs ?? defaultSettleMs);

    const survivors = alive.filter((pid) => dependencies.kill(pid, 0) !== "gone");
    killed.push(...alive.filter((pid) => !survivors.includes(pid)));
    alive = survivors;
  }

  return {
    session,
    targets,
    terminated,
    killed: killed.sort((a, b) => a - b),
    survived: alive,
    denied: [...denied].sort((a, b) => a - b),
    unlabeled,
  };
}

export function formatReapReport(report: ReapReport, timestamp: string): string {
  const fields = [
    `session=${report.session}`,
    `targets=${formatPids(report.targets)}`,
    `terminated=${formatPids(report.terminated)}`,
    `killed=${formatPids(report.killed)}`,
    `survived=${formatPids(report.survived)}`,
    `denied=${formatPids(report.denied)}`,
    `unlabeled=${formatPids(report.unlabeled)}`,
  ];
  return `${timestamp} ${fields.join(" ")}\n`;
}

export function formatReapFailure(session: string, error: unknown, timestamp: string): string {
  const message = error instanceof Error ? error.message : String(error);
  return `${timestamp} session=${session} error=${message.replace(/\s+/g, " ")}\n`;
}

/** `run-shell` output goes nowhere, so every reap records what it did here. */
export function reapLogPath(dependencies: {
  env: Record<string, string | undefined>;
  homedir: () => string;
}): string {
  const xdgStateHome = dependencies.env.XDG_STATE_HOME;
  const stateHome =
    xdgStateHome && isAbsolute(xdgStateHome)
      ? xdgStateHome
      : join(dependencies.homedir(), ".local", "state");
  return join(stateHome, "termwire", "reap.log");
}

function formatPids(pids: readonly number[]): string {
  return pids.length === 0 ? "-" : pids.join(",");
}

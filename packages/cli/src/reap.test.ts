import { describe, expect, mock, test } from "bun:test";
import type { ProcessEntry, ProcessScan } from "./process-scan.js";
import {
  formatReapFailure,
  formatReapReport,
  type KillOutcome,
  parseTmuxServerPid,
  type ReapSignal,
  reapLogPath,
  reapSession,
  selectTargets,
} from "./reap.js";

/** The reap only walks parents; resident memory is what `ls` reads a scan for. */
const entry = (pid: number, ppid: number): ProcessEntry => ({ pid, ppid, rss: 0 });

const scan: ProcessScan = {
  processes: [entry(1, 0), entry(100, 1), entry(200, 100), entry(300, 200), entry(400, 1)],
  labeled: [100, 200, 300, 400],
};

/** A fake process table: pids die after the signal listed for them. */
function createKill(behavior: Record<number, "SIGTERM" | "SIGKILL" | "immortal" | "denied">) {
  const alive = new Set(Object.keys(behavior).map(Number));
  const calls: { pid: number; signal: ReapSignal }[] = [];
  const kill = (pid: number, signal: ReapSignal): KillOutcome => {
    calls.push({ pid, signal });
    if (!alive.has(pid)) return "gone";
    if (signal === 0) return "signalled";
    if (behavior[pid] === "denied") return "denied";
    if (behavior[pid] === signal) alive.delete(pid);
    return "signalled";
  };
  return { kill, calls, alive };
}

describe("selectTargets", () => {
  test("keeps labeled processes and drops our own ancestors", () => {
    // 300 runs the reap, so 200, 100, and 1 above it must survive.
    expect(selectTargets(scan, 300)).toEqual([400]);
  });

  test("keeps everything labeled when the reap runs outside the tree", () => {
    expect(selectTargets(scan, 999)).toEqual([100, 200, 300, 400]);
  });

  test("ignores processes without the label", () => {
    expect(selectTargets({ processes: scan.processes, labeled: [] }, 999)).toEqual([]);
  });

  test("survives a cycle in the reported parents", () => {
    const cyclic: ProcessScan = {
      processes: [entry(10, 11), entry(11, 10)],
      labeled: [10, 11],
    };

    expect(selectTargets(cyclic, 10)).toEqual([]);
  });
});

describe("reapSession", () => {
  const options = { graceMs: 1, settleMs: 1 };

  test("does nothing when the session left no labeled processes", async () => {
    const { kill, calls } = createKill({});
    const wait = mock<(milliseconds: number) => Promise<void>>().mockResolvedValue();

    expect(
      await reapSession("repo-dev", {
        scan: async () => ({ processes: scan.processes, labeled: [] }),
        kill,
        wait,
        selfPid: 999,
        ...options,
      }),
    ).toEqual({
      session: "repo-dev",
      targets: [],
      terminated: [],
      killed: [],
      survived: [],
      denied: [],
      unlabeled: [],
    });
    expect(calls).toEqual([]);
    expect(wait).not.toHaveBeenCalled();
  });

  test("terminates what answers SIGTERM and escalates the rest to SIGKILL", async () => {
    const { kill, calls, alive } = createKill({
      100: "SIGTERM",
      200: "SIGKILL",
      300: "SIGTERM",
      400: "SIGKILL",
    });

    const report = await reapSession("repo-dev", {
      scan: async () => scan,
      kill,
      wait: async () => {},
      selfPid: 999,
      ...options,
    });

    expect(report).toEqual({
      session: "repo-dev",
      targets: [100, 200, 300, 400],
      terminated: [100, 300],
      killed: [200, 400],
      survived: [],
      denied: [],
      unlabeled: [],
    });
    expect(alive.size).toBe(0);
    expect(calls.filter((call) => call.signal === "SIGTERM").map((call) => call.pid)).toEqual([
      100, 200, 300, 400,
    ]);
    expect(calls.filter((call) => call.signal === "SIGKILL").map((call) => call.pid)).toEqual([
      200, 400,
    ]);
  });

  test("waits out the grace period before the first SIGKILL", async () => {
    const { kill } = createKill({ 400: "SIGKILL" });
    const waits: number[] = [];

    await reapSession("repo-dev", {
      scan: async () => ({ processes: scan.processes, labeled: [400] }),
      kill,
      wait: async (milliseconds) => {
        waits.push(milliseconds);
      },
      selfPid: 999,
      graceMs: 2000,
      settleMs: 250,
    });

    expect(waits).toEqual([2000, 250]);
  });

  test("reports a process that ignores every signal", async () => {
    const { kill, calls } = createKill({ 400: "immortal" });

    const report = await reapSession("repo-dev", {
      scan: async () => ({ processes: scan.processes, labeled: [400] }),
      kill,
      wait: async () => {},
      selfPid: 999,
      ...options,
    });

    expect(report.survived).toEqual([400]);
    expect(report.killed).toEqual([]);
    // Two SIGKILL rounds, because a first one is sometimes lost on a stuck tree.
    expect(calls.filter((call) => call.signal === "SIGKILL")).toHaveLength(2);
  });

  test("records a process we may not signal", async () => {
    const { kill } = createKill({ 400: "denied" });

    const report = await reapSession("repo-dev", {
      scan: async () => ({ processes: scan.processes, labeled: [400] }),
      kill,
      wait: async () => {},
      selfPid: 999,
      ...options,
    });

    expect(report.denied).toEqual([400]);
    expect(report.survived).toEqual([400]);
  });

  test("does not SIGKILL a pid that lost the label while we waited", async () => {
    // 400 exits during the grace period and the kernel hands its pid to something
    // unrelated, which answers signal 0 but is no longer ours to kill.
    const { kill, calls } = createKill({ 400: "immortal" });
    const scans = [
      { processes: scan.processes, labeled: [400] },
      { processes: scan.processes, labeled: [] },
    ];

    const report = await reapSession("repo-dev", {
      scan: async () => scans.shift() ?? { processes: scan.processes, labeled: [] },
      kill,
      wait: async () => {},
      selfPid: 999,
      ...options,
    });

    expect(report.unlabeled).toEqual([400]);
    expect(report.survived).toEqual([]);
    expect(calls.filter((call) => call.signal === "SIGKILL")).toEqual([]);
  });

  test("aborts the escalation when the confirming scan fails", async () => {
    const { kill, calls } = createKill({ 400: "immortal" });
    let scanned = 0;

    await expect(
      reapSession("repo-dev", {
        scan: async () => {
          scanned += 1;
          if (scanned > 1) throw new Error("ps failed");
          return { processes: scan.processes, labeled: [400] };
        },
        kill,
        wait: async () => {},
        selfPid: 999,
        ...options,
      }),
    ).rejects.toThrow("ps failed");

    expect(calls.filter((call) => call.signal === "SIGKILL")).toEqual([]);
  });

  test("confirms nothing when SIGTERM emptied the list", async () => {
    const { kill } = createKill({ 400: "SIGTERM" });
    const scan_ = mock<(session: string) => Promise<ProcessScan>>().mockResolvedValue({
      processes: scan.processes,
      labeled: [400],
    });

    await reapSession("repo-dev", {
      scan: scan_,
      kill,
      wait: async () => {},
      selfPid: 999,
      ...options,
    });

    expect(scan_).toHaveBeenCalledTimes(1);
  });

  test("never signals the reap process or its ancestors", async () => {
    const { kill, calls } = createKill({ 100: "SIGTERM", 200: "SIGTERM", 300: "SIGTERM" });

    const report = await reapSession("repo-dev", {
      scan: async () => ({ processes: scan.processes, labeled: [100, 200, 300] }),
      kill,
      wait: async () => {},
      selfPid: 300,
      ...options,
    });

    expect(report.targets).toEqual([]);
    expect(calls).toEqual([]);
  });
});

test("protects the tmux server and its ancestors from its own label", async () => {
  // The hook detaches the reap, so 300 is a child of init and the server is not
  // an ancestor of it. 400 is the server; 200 and 100 are what it came from.
  const detached: ProcessScan = {
    processes: [
      entry(1, 0),
      entry(100, 1),
      entry(200, 100),
      entry(400, 200),
      entry(300, 1),
      entry(500, 1),
    ],
    labeled: [100, 200, 300, 400, 500],
  };

  expect(selectTargets(detached, 300, 400)).toEqual([500]);
});

test("reaps normally when the tmux server pid is unknown", () => {
  expect(selectTargets(scan, 999, undefined)).toEqual([100, 200, 300, 400]);
});

describe("parseTmuxServerPid", () => {
  test.each([
    ["/private/tmp/tmux-501/default,56742,0", 56742],
    ["/private/tmp/tmux-501/default,56742", 56742],
    [undefined, undefined],
    ["", undefined],
    ["/socket,,0", undefined],
    ["/socket,nan,0", undefined],
    ["/socket,-1,0", undefined],
  ])("reads %p as %p", (tmux, expected) => {
    expect(parseTmuxServerPid(tmux)).toBe(expected);
  });
});

describe("formatReapReport", () => {
  test("writes one line per reap", () => {
    expect(
      formatReapReport(
        {
          session: "repo-dev",
          targets: [100, 200],
          terminated: [100],
          killed: [200],
          survived: [],
          denied: [],
          unlabeled: [300],
        },
        "2026-09-28T10:00:00.000Z",
      ),
    ).toBe(
      "2026-09-28T10:00:00.000Z session=repo-dev targets=100,200 terminated=100 killed=200 survived=- denied=- unlabeled=300\n",
    );
  });

  test("records a failure on one line too", () => {
    expect(
      formatReapFailure("repo-dev", new Error("ps failed:\n  exit 1"), "2026-09-28T10:00:00.000Z"),
    ).toBe("2026-09-28T10:00:00.000Z session=repo-dev error=ps failed: exit 1\n");
  });
});

describe("reapLogPath", () => {
  test.each([
    [{ XDG_STATE_HOME: "/state" }, "/state/termwire/reap.log"],
    [{ XDG_STATE_HOME: "relative" }, "/home/user/.local/state/termwire/reap.log"],
    [{}, "/home/user/.local/state/termwire/reap.log"],
  ])("resolves %o", (env, expected) => {
    expect(reapLogPath({ env, homedir: () => "/home/user" })).toBe(expected);
  });
});

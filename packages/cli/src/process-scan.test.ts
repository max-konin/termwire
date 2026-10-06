import { describe, expect, mock, test } from "bun:test";
import {
  emptyLabels,
  type SessionScanner,
  sessionLabel,
  sessionVariable,
  toSingleSession,
} from "./process-scan.js";

describe("the scan contract", () => {
  test("names the label a platform module looks for", () => {
    expect(sessionVariable).toBe("TERMWIRE_SESSION");
    expect(sessionLabel("repo-dev")).toBe("TERMWIRE_SESSION=repo-dev");
  });

  test("seeds a key for every requested session, so a caller never reads undefined", () => {
    expect(emptyLabels(["repo-dev", "repo-demo"])).toEqual(
      new Map([
        ["repo-dev", []],
        ["repo-demo", []],
      ]),
    );
  });
});

describe("toSingleSession", () => {
  test("asks a session scanner for one session and flattens the answer", async () => {
    const scan = mock<SessionScanner>(async () => ({
      processes: [{ pid: 900, ppid: 1, rss: 1024 }],
      labeled: new Map([["repo-dev", [900]]]),
    }));

    expect(await toSingleSession(scan)("repo-dev")).toEqual({
      processes: [{ pid: 900, ppid: 1, rss: 1024 }],
      labeled: [900],
    });
    expect(scan).toHaveBeenCalledWith(["repo-dev"]);
  });

  test("reads no labels for a session the scanner did not report", async () => {
    const scan: SessionScanner = async () => ({ processes: [], labeled: new Map() });

    expect(await toSingleSession(scan)("repo-dev")).toEqual({ processes: [], labeled: [] });
  });
});

import { describe, expect, mock, test } from "bun:test";
import type { Exec, ExecResult } from "./exec.js";
import {
  containsAssignment,
  createDarwinScanner,
  parseDarwinArguments,
  parseDarwinProcesses,
} from "./process-scan-darwin.js";

const result = (stdout: string, exitCode = 0): ExecResult => ({ exitCode, stdout, stderr: "" });

const nodeCommand = "/usr/local/bin/node /repo/server.js";
const nodeRss = 204800;
const environment = "SHELL=/bin/zsh TERMWIRE_SESSION=repo-dev TMUX=/tmp/tmux-501/default,1,0";

const scan = (exec: Exec, sessions: string[]) => createDarwinScanner({ exec, uid: 501 })(sessions);

describe("parseDarwinProcesses", () => {
  test("reads pid, ppid, rss, and everything ps appended after them", () => {
    const stdout = [
      " 501 1 204800 /usr/local/bin/node /repo/server.js TERMWIRE_SESSION=repo-dev",
      "1234    1   3072 zsh",
      "not a process row",
      "",
    ].join("\n");

    expect(parseDarwinProcesses(stdout)).toEqual([
      {
        pid: 501,
        ppid: 1,
        rss: 204800,
        details: "/usr/local/bin/node /repo/server.js TERMWIRE_SESSION=repo-dev",
      },
      { pid: 1234, ppid: 1, rss: 3072, details: "zsh" },
    ]);
  });
});

describe("parseDarwinArguments", () => {
  test("maps each pid to its command line", () => {
    expect(parseDarwinArguments(" 501 node /repo/server.js\n1234 zsh -l\n")).toEqual(
      new Map([
        [501, "node /repo/server.js"],
        [1234, "zsh -l"],
      ]),
    );
  });
});

describe("containsAssignment", () => {
  test.each([
    ["A=1 TERMWIRE_SESSION=repo-dev B=2", true],
    ["TERMWIRE_SESSION=repo-dev", true],
    ["A=1 TERMWIRE_SESSION=repo-dev", true],
    ["A=1 TERMWIRE_SESSION=repo-develop B=2", false],
    ["A=1 OLD_TERMWIRE_SESSION=repo-dev", false],
  ])("matches %p as %p", (text, expected) => {
    expect(containsAssignment(text, "TERMWIRE_SESSION=repo-dev")).toBe(expected);
  });
});

describe("createDarwinScanner", () => {
  test("labels a process whose environment carries the session", async () => {
    const exec = mock<Exec>(async (argv) =>
      argv.includes("-Eww")
        ? result(` 900 1 ${nodeRss} ${nodeCommand} ${environment}\n 1 0 8192 /sbin/launchd\n`)
        : result(` 900 ${nodeCommand}\n`),
    );

    expect(await scan(exec, ["repo-dev"])).toEqual({
      processes: [
        { pid: 900, ppid: 1, rss: nodeRss },
        { pid: 1, ppid: 0, rss: 8192 },
      ],
      labeled: new Map([["repo-dev", [900]]]),
    });
    expect(exec.mock.calls[0]?.[0]).toEqual([
      "ps",
      "-Eww",
      "-o",
      "pid=,ppid=,rss=,command=",
      "-U",
      "501",
    ]);
    expect(exec.mock.calls[1]?.[0]).toEqual(["ps", "-ww", "-o", "pid=,args=", "-p", "900"]);
  });

  test("ignores a process that only mentions the session on its command line", async () => {
    const mention = "grep TERMWIRE_SESSION=repo-dev";
    const exec = mock<Exec>(async (argv) =>
      argv.includes("-Eww") ? result(` 901 900 1024 ${mention}\n`) : result(` 901 ${mention}\n`),
    );

    expect(await scan(exec, ["repo-dev"])).toEqual({
      processes: [{ pid: 901, ppid: 900, rss: 1024 }],
      labeled: new Map([["repo-dev", []]]),
    });
  });

  test("ignores a session whose name is only a prefix of another", async () => {
    const exec = mock<Exec>(async (argv) =>
      argv.includes("-Eww")
        ? result(` 900 1 ${nodeRss} ${nodeCommand} TERMWIRE_SESSION=repo-developer\n`)
        : result(` 900 ${nodeCommand}\n`),
    );

    expect((await scan(exec, ["repo-dev"])).labeled).toEqual(new Map([["repo-dev", []]]));
  });

  test("skips a candidate that exits between the two ps calls", async () => {
    const exec = mock<Exec>(async (argv) =>
      argv.includes("-Eww")
        ? result(` 900 1 ${nodeRss} ${nodeCommand} ${environment}\n`)
        : result("", 1),
    );

    expect((await scan(exec, ["repo-dev"])).labeled).toEqual(new Map([["repo-dev", []]]));
  });

  test("fails loudly when the process listing itself fails", async () => {
    // Returning an empty listing here would log a clean reap while the processes
    // it exists to kill keep running.
    const exec = mock<Exec>(async () => ({
      exitCode: 1,
      stdout: "",
      stderr: "ps: invalid uid",
    }));

    await expect(scan(exec, ["repo-dev"])).rejects.toThrow("ps: invalid uid");
  });

  test("reads the command line only when there is a candidate", async () => {
    const exec = mock<Exec>(async () => result(" 1 0 8192 /sbin/launchd\n"));

    await scan(exec, ["repo-dev"]);

    expect(exec).toHaveBeenCalledTimes(1);
  });

  test("labels several sessions from one walk over the process table", async () => {
    const exec = mock<Exec>(async (argv) =>
      argv.includes("-Eww")
        ? result(
            ` 900 1 204800 ${nodeCommand} TERMWIRE_SESSION=repo-dev\n` +
              ` 910 1 51200 ${nodeCommand} TERMWIRE_SESSION=repo-demo\n` +
              " 1 0 8192 /sbin/launchd\n",
          )
        : result(` 900 ${nodeCommand}\n 910 ${nodeCommand}\n`),
    );

    const scanned = await scan(exec, ["repo-dev", "repo-demo", "repo-none"]);

    expect(scanned.labeled).toEqual(
      new Map([
        ["repo-dev", [900]],
        ["repo-demo", [910]],
        ["repo-none", []],
      ]),
    );
    // One listing, and one confirmation covering every candidate of every session.
    expect(exec).toHaveBeenCalledTimes(2);
    expect(exec.mock.calls[1]?.[0]).toEqual(["ps", "-ww", "-o", "pid=,args=", "-p", "900,910"]);
  });
});

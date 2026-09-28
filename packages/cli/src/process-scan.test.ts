import { describe, expect, mock, test } from "bun:test";
import type { Exec, ExecResult } from "./exec.js";
import {
  containsAssignment,
  createProcessScanner,
  parseDarwinArguments,
  parseDarwinProcesses,
  parseLinuxPpid,
} from "./process-scan.js";

const result = (stdout: string, exitCode = 0): ExecResult => ({ exitCode, stdout, stderr: "" });

const nodeCommand = "/usr/local/bin/node /repo/server.js";
const environment = "SHELL=/bin/zsh TERMWIRE_SESSION=repo-dev TMUX=/tmp/tmux-501/default,1,0";

describe("parseDarwinProcesses", () => {
  test("reads pid, ppid, and everything ps appended after them", () => {
    const stdout = [
      " 501 1 /usr/local/bin/node /repo/server.js TERMWIRE_SESSION=repo-dev",
      "1234    1 zsh",
      "not a process row",
      "",
    ].join("\n");

    expect(parseDarwinProcesses(stdout)).toEqual([
      {
        pid: 501,
        ppid: 1,
        details: "/usr/local/bin/node /repo/server.js TERMWIRE_SESSION=repo-dev",
      },
      { pid: 1234, ppid: 1, details: "zsh" },
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

describe("parseLinuxPpid", () => {
  test.each([
    ["4242 (node) S 4240 4242 4240 0 -1", 4240],
    ["7 (weird name) ) S 3 7 3 0 -1", 3],
  ])("reads the parent pid past the command name", (stat, expected) => {
    expect(parseLinuxPpid(stat)).toBe(expected);
  });

  test.each(["", "4242 (node", "4242 (node) S"])("returns undefined for %p", (stat) => {
    expect(parseLinuxPpid(stat)).toBeUndefined();
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

describe("darwin scanning", () => {
  test("labels a process whose environment carries the session", async () => {
    const exec = mock<Exec>(async (argv) =>
      argv.includes("-Eww")
        ? result(` 900 1 ${nodeCommand} ${environment}\n 1 0 /sbin/launchd\n`)
        : result(` 900 ${nodeCommand}\n`),
    );

    expect(
      await createProcessScanner({ ...linuxStubs(), platform: "darwin", exec, uid: 501 })(
        "repo-dev",
      ),
    ).toEqual({
      processes: [
        { pid: 900, ppid: 1 },
        { pid: 1, ppid: 0 },
      ],
      labeled: [900],
    });
    expect(exec.mock.calls[0]?.[0]).toEqual([
      "ps",
      "-Eww",
      "-o",
      "pid=,ppid=,command=",
      "-U",
      "501",
    ]);
    expect(exec.mock.calls[1]?.[0]).toEqual(["ps", "-ww", "-o", "pid=,args=", "-p", "900"]);
  });

  test("ignores a process that only mentions the session on its command line", async () => {
    const mention = "grep TERMWIRE_SESSION=repo-dev";
    const exec = mock<Exec>(async (argv) =>
      argv.includes("-Eww") ? result(` 901 900 ${mention}\n`) : result(` 901 ${mention}\n`),
    );

    expect(
      await createProcessScanner({ ...linuxStubs(), platform: "darwin", exec, uid: 501 })(
        "repo-dev",
      ),
    ).toEqual({ processes: [{ pid: 901, ppid: 900 }], labeled: [] });
  });

  test("ignores a session whose name is only a prefix of another", async () => {
    const exec = mock<Exec>(async (argv) =>
      argv.includes("-Eww")
        ? result(` 900 1 ${nodeCommand} TERMWIRE_SESSION=repo-developer\n`)
        : result(` 900 ${nodeCommand}\n`),
    );

    expect(
      await createProcessScanner({ ...linuxStubs(), platform: "darwin", exec, uid: 501 })(
        "repo-dev",
      ),
    ).toEqual({ processes: [{ pid: 900, ppid: 1 }], labeled: [] });
  });

  test("skips a candidate that exits between the two ps calls", async () => {
    const exec = mock<Exec>(async (argv) =>
      argv.includes("-Eww") ? result(` 900 1 ${nodeCommand} ${environment}\n`) : result("", 1),
    );

    expect(
      await createProcessScanner({ ...linuxStubs(), platform: "darwin", exec, uid: 501 })(
        "repo-dev",
      ),
    ).toEqual({ processes: [{ pid: 900, ppid: 1 }], labeled: [] });
  });

  test("fails loudly when the process listing itself fails", async () => {
    // Returning an empty listing here would log a clean reap while the processes
    // it exists to kill keep running.
    const exec = mock<Exec>(async () => ({
      exitCode: 1,
      stdout: "",
      stderr: "ps: invalid uid",
    }));

    await expect(
      createProcessScanner({ ...linuxStubs(), platform: "darwin", exec, uid: 501 })("repo-dev"),
    ).rejects.toThrow("ps: invalid uid");
  });

  test("reads the command line only when there is a candidate", async () => {
    const exec = mock<Exec>(async () => result(" 1 0 /sbin/launchd\n"));

    await createProcessScanner({ ...linuxStubs(), platform: "darwin", exec, uid: 501 })("repo-dev");

    expect(exec).toHaveBeenCalledTimes(1);
  });
});

describe("linux scanning", () => {
  const files: Record<string, string> = {
    "/proc/900/stat": "900 (node) S 1 900 1 0 -1",
    "/proc/900/environ": `SHELL=/bin/zsh\0TERMWIRE_SESSION=repo-dev\0TMUX=/tmp/default,1,0\0`,
    "/proc/901/stat": "901 (node) S 900 901 1 0 -1",
    "/proc/901/environ": "TERMWIRE_SESSION=repo-other\0",
    "/proc/902/stat": "902 (root-owned) S 1 902 1 0 -1",
  };

  function dependencies() {
    return {
      readdir: mock<(path: string) => Promise<string[]>>().mockResolvedValue([
        "900",
        "901",
        "902",
        "903",
        "self",
        "uptime",
      ]),
      readFile: mock(async (path: string) => {
        const contents = files[path];
        if (contents === undefined) {
          throw Object.assign(new Error(`no access: ${path}`), { code: "EACCES" });
        }
        return contents;
      }),
    };
  }

  test("labels only the matching session and keeps every readable process", async () => {
    const exec = mock<Exec>(async () => result(""));

    expect(
      await createProcessScanner({ ...dependencies(), platform: "linux", exec, uid: 501 })(
        "repo-dev",
      ),
    ).toEqual({
      processes: [
        { pid: 900, ppid: 1 },
        { pid: 901, ppid: 900 },
        { pid: 902, ppid: 1 },
      ],
      labeled: [900],
    });
    expect(exec).not.toHaveBeenCalled();
  });
});

test("refuses to scan an unsupported platform", () => {
  expect(() =>
    createProcessScanner({
      ...linuxStubs(),
      platform: "win32",
      exec: async () => result(""),
      uid: 0,
    }),
  ).toThrow("process scanning is not supported on win32");
});

function linuxStubs() {
  return {
    readdir: async () => [],
    readFile: async () => "",
  };
}

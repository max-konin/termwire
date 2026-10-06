import { describe, expect, mock, test } from "bun:test";
import { createLinuxScanner, parseLinuxPpid, parseLinuxRss } from "./process-scan-linux.js";

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

describe("parseLinuxRss", () => {
  test.each([
    ["4096 2048 1000 10 0 500 0", 8192],
    ["4096", 0],
    ["", 0],
  ])("turns the resident pages of %p into KiB", (statm, expected) => {
    expect(parseLinuxRss(statm)).toBe(expected);
  });
});

describe("createLinuxScanner", () => {
  const files: Record<string, string> = {
    "/proc/900/stat": "900 (node) S 1 900 1 0 -1",
    "/proc/900/statm": "60000 51200 1000 10 0 500 0",
    "/proc/900/environ": `SHELL=/bin/zsh\0TERMWIRE_SESSION=repo-dev\0TMUX=/tmp/default,1,0\0`,
    "/proc/901/stat": "901 (node) S 900 901 1 0 -1",
    "/proc/901/statm": "4096 768 100 10 0 50 0",
    "/proc/901/environ": "TERMWIRE_SESSION=repo-other\0",
    // No readable `statm`: the process is still listed, with no resident memory.
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
    expect(await createLinuxScanner(dependencies())(["repo-dev"])).toEqual({
      processes: [
        { pid: 900, ppid: 1, rss: 204800 },
        { pid: 901, ppid: 900, rss: 3072 },
        { pid: 902, ppid: 1, rss: 0 },
      ],
      labeled: new Map([["repo-dev", [900]]]),
    });
  });

  test("labels several sessions from one walk over /proc", async () => {
    const injected = dependencies();

    const scanned = await createLinuxScanner(injected)(["repo-dev", "repo-other"]);

    expect(scanned.labeled).toEqual(
      new Map([
        ["repo-dev", [900]],
        ["repo-other", [901]],
      ]),
    );
    expect(injected.readdir).toHaveBeenCalledTimes(1);
  });
});

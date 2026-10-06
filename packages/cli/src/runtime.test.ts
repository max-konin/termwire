import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import packageJson from "../package.json";
import { type Exec, type ExecOptions, spawnCapture } from "./exec.js";
import { createCommands, run, runCommands } from "./program.js";
import { createAdapters, createNodeRuntime, createPlatformScanner } from "./runtime.js";

test("spawns with an exec that can give the child the terminal", async () => {
  // `tmux attach-session` fails with "open terminal failed" unless the option
  // survives the seam, and a one-parameter exec drops it without a type error.
  const exec = spawnCapture;

  expect(await exec(["sh", "-c", "echo captured"])).toMatchObject({
    exitCode: 0,
    stdout: "captured\n",
  });
  // Redirected, or the inherited stream lands in the test report.
  expect(
    await exec(["sh", "-c", "exec >/dev/null; echo inherited"], { stdio: "inherit" }),
  ).toMatchObject({ exitCode: 0, stdout: "" });
});

test("gives the adapters an exec that carries the options through", async () => {
  // `attach` outside tmux asks for an inherited terminal. If the exec the adapters
  // get drops the option, tmux answers "open terminal failed" and `up` tears the
  // fresh session down again.
  const seen: (ExecOptions | undefined)[] = [];
  const exec: Exec = async (_argv, options) => {
    seen.push(options);
    return { exitCode: 0, stdout: "", stderr: "" };
  };

  const { tmux } = createAdapters({ exec, env: {} });
  await tmux.attach("repo-dev");

  expect(seen).toEqual([{ stdio: "inherit" }]);
});

test("gives nvim the same exec rather than letting it spawn its own", async () => {
  const seen: string[][] = [];
  const exec: Exec = async (argv) => {
    seen.push([...argv]);
    return { exitCode: 0, stdout: "", stderr: "" };
  };

  await createAdapters({ exec, env: {} }).nvim.isRunning("/tmp/termwire/repo-dev.sock");

  expect(seen).toHaveLength(1);
});

test("binds the process state the commands read", () => {
  const { host } = createNodeRuntime();

  expect(host).toMatchObject({
    pid: process.pid,
    execPath: process.execPath,
    env: process.env,
  });
  expect(host.cwd()).toBe(process.cwd());
  expect(host.homedir()).toMatch(/^\//);
  expect(host.now().getTime()).toBeCloseTo(Date.now(), -4);
});

test("picks a scanner for this platform, and says so when there is none", () => {
  // Lazy on purpose: an unsupported platform must fail the commands that scan,
  // not `--help` and not `up`.
  expect(createNodeRuntime().createScanner()).toBeFunction();
  expect(() => createPlatformScanner("plan9")).toThrow(
    "process scanning is not supported on plan9",
  );
  for (const platform of ["darwin", "linux"]) {
    expect(createPlatformScanner(platform)).toBeFunction();
  }
});

test("reports a missing process rather than throwing", () => {
  // pid 1 exists and is not ours to signal; a free high pid is gone.
  expect(createNodeRuntime().host.kill(2 ** 22 - 1, 0)).toBe("gone");
});

test("waits without blocking the loop", async () => {
  const started = Date.now();

  await createNodeRuntime().host.wait(5);

  expect(Date.now() - started).toBeGreaterThanOrEqual(4);
});

test("exposes a filesystem that reads and reports absent files", async () => {
  const { fs } = createNodeRuntime();

  const manifest = fileURLToPath(new URL("../package.json", import.meta.url));

  expect(await fs.readFile(manifest)).toContain('"@termwire/cli"');
  expect(await fs.exists("/definitely/not/here")).toBe(false);
});

test("composes commands that the program can run", async () => {
  const writeOutput: string[] = [];
  const runtime = createNodeRuntime();
  const commands = createCommands({
    ...runtime,
    host: { ...runtime.host, writeOutput: (message) => writeOutput.push(message) },
  });

  expect(await runCommands(["--version"], commands)).toBe(0);
  expect(writeOutput.join("")).toBe(`${packageJson.version}\n`);
});

test("says what is missing when JavaScript calls run without a runtime", async () => {
  const callFromJavaScript = run as unknown as (argv: readonly string[]) => Promise<number>;

  await expect(callFromJavaScript(["--version"])).rejects.toThrow(
    "run needs a runtime: pass createNodeRuntime()",
  );
});

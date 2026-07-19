import { expect, test } from "bun:test";

test("prints root help through the executable", async () => {
  const binaryPath = new URL("./openbridge.ts", import.meta.url).pathname;
  const child = Bun.spawn(["bun", binaryPath, "--help"], { stdout: "pipe", stderr: "pipe" });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);

  expect(exitCode).toBe(0);
  expect(stdout).toContain("Usage: openbridge");
  expect(stdout).toContain("up [options] <name>");
  expect(stderr).toBe("");
});

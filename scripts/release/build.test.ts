import { expect, test } from "bun:test";
import { readdir, readFile, rm, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { packageSpecs } from "./package-specs";

const root = resolve(import.meta.dir, "../..");

test("build emits only runnable package artifacts", async () => {
  for (const { directory } of packageSpecs) {
    await rm(resolve(root, directory, "dist"), { recursive: true, force: true });
  }

  const process = Bun.spawn(["bun", "run", "build"], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stderr = await new Response(process.stderr).text();
  expect(await process.exited, stderr).toBe(0);

  for (const { directory } of packageSpecs) {
    await stat(resolve(root, directory, "dist/index.js"));
    await stat(resolve(root, directory, "dist/index.d.ts"));
    const files = await readdir(resolve(root, directory, "dist"), { recursive: true });
    expect(files.some((file) => file.includes(".test."))).toBe(false);
  }

  const bin = resolve(root, "packages/cli/dist/bin/termwire.js");
  expect((await readFile(bin, "utf8")).startsWith("#!/usr/bin/env bun")).toBe(true);
  expect((await stat(bin)).mode & 0o111).not.toBe(0);
}, 120_000);

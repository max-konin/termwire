import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { retainArchives } from "./pack-effects";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

async function directory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "termwire-effects-"));
  directories.push(path);
  return path;
}

test("retains archives with verified checksums", async () => {
  const source = await directory();
  const output = join(await directory(), "release");
  const tmux = join(source, "tmux.tgz");
  const nvim = join(source, "nvim.tgz");
  await writeFile(tmux, "tmux archive");
  await writeFile(nvim, "nvim archive");

  const retained = await retainArchives(
    new Map([
      ["@termwire/tmux", tmux],
      ["@termwire/nvim", nvim],
    ]),
    output,
  );
  const manifest = await Bun.file(join(output, "release-artifacts.json")).json();

  expect(manifest).toEqual(retained);
  for (const artifact of retained) {
    const bytes = new Uint8Array(await readFile(artifact.path));
    expect(new Bun.CryptoHasher("sha256").update(bytes).digest("hex")).toBe(artifact.sha256);
  }
});

test("removes partial retained output when a source archive is missing", async () => {
  const source = await directory();
  const output = join(await directory(), "release");
  const valid = join(source, "valid.tgz");
  await writeFile(valid, "valid archive");

  await expect(
    retainArchives(
      new Map([
        ["@termwire/tmux", valid],
        ["@termwire/nvim", join(source, "missing.tgz")],
      ]),
      output,
    ),
  ).rejects.toThrow();

  expect(await Bun.file(output).exists()).toBe(false);
});

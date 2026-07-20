import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { packageSpecs } from "./package-specs";

const root = resolve(import.meta.dir, "../..");
const readJson = (path: string) => Bun.file(resolve(root, path)).json();

test("pins Bun and exposes release commands", async () => {
  const manifest = await readJson("package.json");
  expect((await Bun.file(resolve(root, ".bun-version")).text()).trim()).toBe("1.3.14");
  expect(manifest.packageManager).toBe("bun@1.3.14");
  expect(manifest.engines?.bun).toBe(">=1.3.14");
  expect(manifest.scripts).toMatchObject({
    changeset: "changeset",
    "version-packages": "changeset version",
  });
  expect(typeof manifest.devDependencies?.["@changesets/cli"]).toBe("string");
  expect(typeof manifest.devDependencies?.typescript).toBe("string");
  expect(manifest.peerDependencies?.typescript).toBeUndefined();
});

test("configures one public fixed release group", async () => {
  const config = await readJson(".changeset/config.json");
  expect(config.baseBranch).toBe("master");
  expect(config.access).toBe("public");
  expect(config.commit).toBe(false);
  expect(config.updateInternalDependencies).toBe("patch");
  expect(config.ignore).toEqual([]);
  expect(config.fixed).toEqual([packageSpecs.map(({ name }) => name)]);
});

test("keeps one unconsumed initial minor changeset", async () => {
  const text = await Bun.file(resolve(root, ".changeset/initial-public-release.md")).text();
  for (const { name } of packageSpecs) expect(text).toContain(`"${name}": minor`);
  expect(text).toContain("Initial public release");
});

test("declares every workspace as a public built package", async () => {
  for (const spec of packageSpecs) {
    const manifest = await readJson(`${spec.directory}/package.json`);
    expect(manifest.version).toBe("0.0.0");
    expect(manifest.private).toBeUndefined();
    expect(manifest.publishConfig).toEqual({ access: "public" });
    expect(manifest.license).toBe("MIT");
    expect(manifest.engines).toEqual({ bun: ">=1.3.14" });
    expect(manifest.files).toEqual(["dist", "README.md", "LICENSE", "CHANGELOG.md"]);
    expect(manifest.main).toBe("./dist/index.js");
    expect(manifest.types).toBe("./dist/index.d.ts");
    expect(manifest.exports?.["."]?.import).toBe("./dist/index.js");
    expect(manifest.exports?.["."]?.types).toBe("./dist/index.d.ts");
    expect(manifest.repository).toEqual({
      type: "git",
      url: "git+https://github.com/max-konin/termwire.git",
      directory: spec.directory,
    });
    if (spec.bin) expect(manifest.bin).toEqual({ termwire: `./${spec.bin}` });
  }
});

test("ships the canonical MIT license with every package", async () => {
  const canonical = await Bun.file(resolve(root, "LICENSE")).text();
  expect(canonical).toContain("MIT License");
  expect(canonical).toContain("Termwire contributors");
  for (const { directory } of packageSpecs) {
    expect(await Bun.file(resolve(root, directory, "LICENSE")).text()).toBe(canonical);
  }
});

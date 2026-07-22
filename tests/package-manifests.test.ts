import { expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const semver =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const packages = [
  { name: "@termwire/tmux", directory: "packages/tmux", internalDependencies: [] },
  { name: "@termwire/nvim", directory: "packages/nvim", internalDependencies: [] },
  {
    name: "@termwire/cli",
    directory: "packages/cli",
    internalDependencies: ["@termwire/nvim", "@termwire/tmux"],
  },
  {
    name: "@termwire/opencode-plugin",
    directory: "packages/opencode-plugin",
    internalDependencies: ["@termwire/nvim", "@termwire/tmux"],
  },
  {
    name: "@termwire/mcp",
    directory: "packages/mcp",
    internalDependencies: ["@termwire/nvim", "@termwire/tmux"],
  },
];

test("keeps publishable workspace manifests aligned and installable", async () => {
  const directories = (await readdir(resolve(root, "packages"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => `packages/${entry.name}`);
  const discovered = (
    await Promise.all(
      directories.map(async (directory) => ({
        directory,
        hasManifest: await Bun.file(resolve(root, directory, "package.json")).exists(),
      })),
    )
  )
    .filter(({ hasManifest }) => hasManifest)
    .map(({ directory }) => directory)
    .sort();
  expect(discovered).toEqual(packages.map(({ directory }) => directory).sort());

  const manifests = new Map(
    await Promise.all(
      discovered.map(async (directory) => {
        const manifest = (await Bun.file(resolve(root, directory, "package.json")).json()) as {
          name: string;
          version: string;
          publishConfig?: { access?: string };
          dependencies?: Record<string, string>;
          optionalDependencies?: Record<string, string>;
          peerDependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };
        return [manifest.name, manifest] as const;
      }),
    ),
  );

  expect([...manifests.keys()].sort()).toEqual(packages.map(({ name }) => name).sort());
  const versions = [...manifests.values()].map(({ version }) => version);
  for (const version of versions) expect(version).toMatch(semver);
  expect(new Set(versions).size).toBe(1);

  for (const spec of packages) {
    const manifest = manifests.get(spec.name);
    if (!manifest) throw new Error(`missing manifest: ${spec.name}`);
    expect(manifest.publishConfig?.access).toBe("public");
    for (const section of [
      manifest.dependencies,
      manifest.optionalDependencies,
      manifest.peerDependencies,
      manifest.devDependencies,
    ]) {
      for (const range of Object.values(section ?? {})) {
        expect(range.startsWith("workspace:") || range.startsWith("catalog:")).toBe(false);
      }
    }
    for (const dependency of spec.internalDependencies) {
      const target = manifests.get(dependency);
      if (!target) throw new Error(`missing internal manifest: ${dependency}`);
      expect(manifest.dependencies?.[dependency]).toBe(`^${target.version}`);
    }
  }
});

test("uses an npm-valid CLI executable path", async () => {
  const manifest = (await Bun.file(resolve(root, "packages/cli/package.json")).json()) as {
    bin?: Record<string, string>;
  };

  expect(manifest.bin).toEqual({ termwire: "dist/bin/termwire.js" });
});

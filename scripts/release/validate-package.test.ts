import { afterEach, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { packageSpecs } from "./package-specs";
import { validatePackageDirectory } from "./validate-package";

interface FixtureOptions {
  name?: string;
  version?: string;
  cli?: boolean;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface Fixture {
  path: string;
  license: string;
}

const root = resolve(import.meta.dir, "../..");
const cliSpec = getSpec("@termwire/cli");
const directories: string[] = [];
const canonicalLicense = await readFile(resolve(root, "LICENSE"), "utf8");

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

async function createFixture(options: FixtureOptions = {}): Promise<Fixture> {
  const cli = options.cli ?? options.name === cliSpec.name;
  const name = options.name ?? (cli ? cliSpec.name : "@termwire/tmux");
  const spec = getSpec(name);
  const version = options.version ?? "0.0.0";
  const path = await mkdtemp(join(tmpdir(), "termwire-validate-"));
  directories.push(path);
  const dependencies =
    options.dependencies ??
    (cli ? { "@termwire/nvim": version, "@termwire/tmux": version } : undefined);
  const manifest = {
    name,
    version,
    type: "module",
    main: "./dist/index.js",
    types: "./dist/index.d.ts",
    exports: {
      ".": {
        types: "./dist/index.d.ts",
        import: "./dist/index.js",
        default: "./dist/index.js",
      },
    },
    ...(cli ? { bin: { termwire: "./dist/bin/termwire.js" } } : {}),
    files: ["dist", "README.md", "LICENSE", "CHANGELOG.md"],
    publishConfig: { access: "public" },
    license: "MIT",
    engines: { bun: ">=1.3.14" },
    repository: {
      type: "git",
      url: "git+https://github.com/max-konin/termwire.git",
      directory: spec.directory,
    },
    homepage: "https://github.com/max-konin/termwire#readme",
    bugs: { url: "https://github.com/max-konin/termwire/issues" },
    ...(dependencies ? { dependencies } : {}),
    ...(options.devDependencies ? { devDependencies: options.devDependencies } : {}),
  };

  await writeFile(join(path, "package.json"), JSON.stringify(manifest, undefined, 2));
  await writeFile(join(path, "README.md"), "# fixture\n");
  await writeFile(join(path, "LICENSE"), canonicalLicense);
  await mkdir(join(path, "dist", "bin"), { recursive: true });
  await writeFile(join(path, "dist/index.js"), "export {};\n");
  await writeFile(join(path, "dist/index.d.ts"), "export {};\n");
  if (version !== "0.0.0") await writeFile(join(path, "CHANGELOG.md"), "# Changelog\n");
  if (cli) {
    const bin = join(path, "dist/bin/termwire.js");
    await writeFile(bin, "#!/usr/bin/env bun\nconsole.log('fixture');\n");
    await chmod(bin, 0o755);
  }
  return { path, license: canonicalLicense };
}

async function updateManifest(
  fixture: Fixture,
  mutate: (manifest: Record<string, unknown>) => void,
) {
  const path = join(fixture.path, "package.json");
  const manifest = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  mutate(manifest);
  await writeFile(path, JSON.stringify(manifest, undefined, 2));
}

async function validate(fixture: Fixture, version = "0.0.0") {
  const manifest = JSON.parse(await readFile(join(fixture.path, "package.json"), "utf8")) as {
    name: string;
  };
  const spec = getSpec(manifest.name);
  return validatePackageDirectory(fixture.path, spec, version, fixture.license);
}

function getSpec(name: string) {
  const spec = packageSpecs.find((candidate) => candidate.name === name);
  if (!spec) throw new Error(`missing fixture package spec: ${name}`);
  return spec;
}

const unsafeMutations: {
  apply(fixture: Fixture): Promise<void>;
  error: string;
  cli?: boolean;
}[] = [
  {
    apply: async (fixture) => {
      await mkdir(join(fixture.path, "src"));
      await writeFile(join(fixture.path, "src/index.ts"), "export {};");
    },
    error: "unexpected directory: src",
  },
  {
    apply: (fixture) => writeFile(join(fixture.path, "dist/index.test.js"), "export {};"),
    error: "test file",
  },
  {
    apply: (fixture) => writeFile(join(fixture.path, "dist/source.ts"), "export {};"),
    error: "unexpected file",
  },
  {
    apply: (fixture) => writeFile(join(fixture.path, "dist/tsconfig.json"), "{}"),
    error: "unexpected file",
  },
  {
    apply: (fixture) => writeFile(join(fixture.path, "dist/.env"), "secret"),
    error: "hidden file",
  },
  {
    apply: (fixture) =>
      symlink(join(fixture.path, "dist/index.js"), join(fixture.path, "dist/link.js")),
    error: "symlink",
  },
  {
    apply: (fixture) => updateManifest(fixture, (manifest) => delete manifest.main),
    error: "main",
  },
  {
    apply: (fixture) => updateManifest(fixture, (manifest) => delete manifest.types),
    error: "types",
  },
  {
    apply: (fixture) =>
      updateManifest(fixture, (manifest) => {
        (manifest.exports as { ".": { import: string } })["."].import = "./dist/missing.js";
      }),
    error: "exports",
  },
  { apply: (fixture) => writeFile(join(fixture.path, "LICENSE"), "different"), error: "LICENSE" },
  {
    apply: (fixture) =>
      writeFile(join(fixture.path, "dist/bin/termwire.js"), "console.log('x');\n"),
    error: "Bun shebang",
    cli: true,
  },
  {
    apply: (fixture) => chmod(join(fixture.path, "dist/bin/termwire.js"), 0o644),
    error: "executable",
    cli: true,
  },
];

test("accepts an exact-version safe package", async () => {
  const fixture = await createFixture({ name: "@termwire/cli", version: "0.0.0", cli: true });
  await expect(
    validatePackageDirectory(fixture.path, cliSpec, "0.0.0", fixture.license),
  ).resolves.toBeUndefined();
});

test("rejects workspace protocols and stale internal versions", async () => {
  const workspace = await createFixture({
    name: "@termwire/cli",
    cli: true,
    dependencies: { "@termwire/nvim": "0.0.0", "@termwire/tmux": "workspace:*" },
  });
  await expect(validate(workspace)).rejects.toThrow("workspace protocol");

  const stale = await createFixture({
    name: "@termwire/cli",
    version: "0.1.0",
    cli: true,
    dependencies: { "@termwire/nvim": "0.1.0", "@termwire/tmux": "0.0.1" },
  });
  await expect(validate(stale, "0.1.0")).rejects.toThrow("expected internal version 0.1.0");
});

test("rejects workspace protocols in development dependencies", async () => {
  const fixture = await createFixture({ devDependencies: { "@termwire/tmux": "workspace:*" } });
  await expect(validate(fixture)).rejects.toThrow("workspace protocol");
});

test("requires a changelog after the setup version", async () => {
  const fixture = await createFixture({ version: "0.1.0" });
  await rm(join(fixture.path, "CHANGELOG.md"));
  await expect(validate(fixture, "0.1.0")).rejects.toThrow("missing CHANGELOG.md");
});

test("rejects source, tests, broken entrypoints, licenses, and CLI modes", async () => {
  for (const mutation of unsafeMutations) {
    const fixture = await createFixture({ cli: mutation.cli });
    await mutation.apply(fixture);
    await expect(validate(fixture)).rejects.toThrow(mutation.error);
  }
});

test("requires public metadata and package-specific errors", async () => {
  const fixture = await createFixture();
  await updateManifest(fixture, (manifest) => {
    manifest.publishConfig = { access: "restricted" };
  });
  await expect(validate(fixture)).rejects.toThrow("@termwire/tmux: invalid publishConfig.access");
});

test("requires ESM package metadata", async () => {
  const fixture = await createFixture();
  await updateManifest(fixture, (manifest) => {
    manifest.type = "commonjs";
  });
  await expect(validate(fixture)).rejects.toThrow("@termwire/tmux: invalid type");
});

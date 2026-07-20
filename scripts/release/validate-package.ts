import { lstat, readdir, readFile, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { PackageSpec } from "./package-specs";

type Manifest = Record<string, unknown>;

interface FileEntry {
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  isSymbolicLink: boolean;
}

export async function validatePackageDirectory(
  packageDirectory: string,
  spec: PackageSpec,
  expectedVersion: string,
  canonicalLicense: string,
): Promise<void> {
  try {
    const manifest = await readManifest(packageDirectory);
    validateManifest(manifest, spec, expectedVersion);
    validateDependencyRanges(manifest, spec, expectedVersion);
    const entries = await listFiles(packageDirectory);
    validateFiles(entries, expectedVersion);

    await assertTarget(packageDirectory, manifest.main, "main");
    await assertTarget(packageDirectory, manifest.types, "types");
    const exports = manifest.exports as Record<string, Record<string, unknown>>;
    await assertTarget(packageDirectory, exports["."]?.types, "exports.types");
    await assertTarget(packageDirectory, exports["."]?.import, "exports.import");
    await assertTarget(packageDirectory, exports["."]?.default, "exports.default");

    if (spec.bin) await validateBin(packageDirectory, manifest, spec.bin);
    if ((await readFile(resolve(packageDirectory, "LICENSE"), "utf8")) !== canonicalLicense) {
      throw new Error("LICENSE does not match canonical license");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith(`${spec.name}:`)) throw error;
    throw new Error(`${spec.name}: ${message}`);
  }
}

async function readManifest(packageDirectory: string): Promise<Manifest> {
  try {
    return JSON.parse(
      await readFile(resolve(packageDirectory, "package.json"), "utf8"),
    ) as Manifest;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`invalid package.json (${message})`);
  }
}

async function listFiles(packageDirectory: string, directory = ""): Promise<FileEntry[]> {
  const entries: FileEntry[] = [];
  for (const name of await readdir(resolve(packageDirectory, directory))) {
    const path = directory ? `${directory}/${name}` : name;
    const info = await lstat(resolve(packageDirectory, path));
    entries.push({
      path,
      isDirectory: info.isDirectory(),
      isFile: info.isFile(),
      isSymbolicLink: info.isSymbolicLink(),
    });
    if (info.isDirectory()) entries.push(...(await listFiles(packageDirectory, path)));
  }
  return entries;
}

async function assertTarget(
  packageDirectory: string,
  target: unknown,
  field: string,
): Promise<void> {
  if (typeof target !== "string" || !target.startsWith("./")) {
    throw new Error(`missing or invalid ${field}`);
  }
  const path = resolve(packageDirectory, target);
  const contained = relative(packageDirectory, path);
  if (isAbsolute(contained) || contained === ".." || contained.startsWith(`..${sep}`)) {
    throw new Error(`${field} target is outside package`);
  }
  if (!(await stat(path)).isFile()) throw new Error(`${field} target does not exist`);
}

function validateDependencyRanges(
  manifest: Manifest,
  spec: PackageSpec,
  expectedVersion: string,
): void {
  const sections = ["dependencies", "optionalDependencies", "peerDependencies", "devDependencies"];
  for (const section of sections) {
    const dependencies = manifest[section];
    if (dependencies === undefined) continue;
    if (typeof dependencies !== "object" || dependencies === null || Array.isArray(dependencies)) {
      throw new Error(`invalid ${section}`);
    }
    for (const [name, range] of Object.entries(dependencies)) {
      if (typeof range !== "string") throw new Error(`invalid dependency range for ${name}`);
      if (range.startsWith("workspace:") || range.startsWith("catalog:")) {
        throw new Error(`${section} contains workspace protocol for ${name}`);
      }
    }
  }

  const dependencies = manifest.dependencies;
  if (typeof dependencies !== "object" || dependencies === null || Array.isArray(dependencies)) {
    if (spec.internalDependencies.length > 0) throw new Error("missing dependencies");
    return;
  }
  const runtimeDependencies = dependencies as Record<string, unknown>;
  for (const name of spec.internalDependencies) {
    if (runtimeDependencies[name] !== expectedVersion) {
      throw new Error(`${name} expected internal version ${expectedVersion}`);
    }
  }
}

function validateManifest(manifest: Manifest, spec: PackageSpec, expectedVersion: string): void {
  if (manifest.name !== spec.name) throw new Error(`expected name ${spec.name}`);
  if (manifest.version !== expectedVersion) throw new Error(`expected version ${expectedVersion}`);
  if (manifest.private !== undefined) throw new Error("package must not be private");
  if (manifest.type !== "module") throw new Error("invalid type");
  if (!matches(manifest.publishConfig, { access: "public" }))
    throw new Error("invalid publishConfig.access");
  if (manifest.license !== "MIT") throw new Error("invalid license");
  if (!matches(manifest.engines, { bun: ">=1.3.14" })) throw new Error("invalid engines.bun");
  if (!equals(manifest.files, ["dist", "README.md", "LICENSE", "CHANGELOG.md"])) {
    throw new Error("invalid files");
  }
  if (manifest.main !== "./dist/index.js") throw new Error("invalid main");
  if (manifest.types !== "./dist/index.d.ts") throw new Error("invalid types");
  const exports = manifest.exports as Record<string, Record<string, unknown>>;
  if (
    !matches(exports?.["."], {
      types: "./dist/index.d.ts",
      import: "./dist/index.js",
      default: "./dist/index.js",
    })
  ) {
    throw new Error("invalid exports");
  }
  if (
    !matches(manifest.repository, {
      type: "git",
      url: "git+https://github.com/max-konin/termwire.git",
      directory: spec.directory,
    })
  ) {
    throw new Error("invalid repository");
  }
  if (manifest.homepage !== "https://github.com/max-konin/termwire#readme") {
    throw new Error("invalid homepage");
  }
  if (!matches(manifest.bugs, { url: "https://github.com/max-konin/termwire/issues" })) {
    throw new Error("invalid bugs.url");
  }
  if (spec.bin && !matches(manifest.bin, { termwire: `./${spec.bin}` })) {
    throw new Error("invalid bin");
  }
}

function validateFiles(entries: FileEntry[], expectedVersion: string): void {
  const files = new Set(entries.filter((entry) => !entry.isDirectory).map((entry) => entry.path));
  for (const entry of entries) {
    if (entry.isSymbolicLink) throw new Error(`symlink is not permitted: ${entry.path}`);
    if (
      entry.path.startsWith("dist/") &&
      entry.path.split("/").some((part) => part.startsWith("."))
    ) {
      throw new Error(`hidden file is not permitted: ${entry.path}`);
    }
    if (entry.isDirectory) {
      if (entry.path !== "dist" && !entry.path.startsWith("dist/")) {
        throw new Error(`unexpected directory: ${entry.path}`);
      }
      continue;
    }
    if (!entry.isFile) throw new Error(`non-regular file is not permitted: ${entry.path}`);
    if (["package.json", "README.md", "LICENSE", "CHANGELOG.md"].includes(entry.path)) continue;
    if (!entry.path.startsWith("dist/")) throw new Error(`unexpected file: ${entry.path}`);
    const basename = entry.path.split("/").at(-1);
    if (!basename) throw new Error(`invalid file path: ${entry.path}`);
    if (basename.startsWith(".")) throw new Error(`hidden file is not permitted: ${entry.path}`);
    if (basename.includes(".test.") || basename.includes(".spec.")) {
      throw new Error(`test file is not permitted: ${entry.path}`);
    }
    if (!entry.path.endsWith(".js") && !entry.path.endsWith(".d.ts")) {
      throw new Error(`unexpected file: ${entry.path}`);
    }
  }
  for (const required of ["package.json", "README.md", "LICENSE"]) {
    if (!files.has(required)) throw new Error(`missing ${required}`);
  }
  if (expectedVersion !== "0.0.0" && !files.has("CHANGELOG.md")) {
    throw new Error("missing CHANGELOG.md");
  }
}

async function validateBin(
  packageDirectory: string,
  manifest: Manifest,
  bin: string,
): Promise<void> {
  const target = (manifest.bin as Record<string, unknown>)?.termwire;
  await assertTarget(packageDirectory, target, "bin");
  const path = resolve(packageDirectory, bin);
  const content = await readFile(path, "utf8");
  if (!content.startsWith("#!/usr/bin/env bun\n")) throw new Error("CLI is missing Bun shebang");
  if (((await stat(path)).mode & 0o111) === 0) throw new Error("CLI is not executable");
}

function matches(value: unknown, expected: Record<string, unknown>): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.entries(expected).every(
      ([key, expectedValue]) => (value as Manifest)[key] === expectedValue,
    )
  );
}

function equals(value: unknown, expected: unknown[]): boolean {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every((item, index) => item === expected[index])
  );
}

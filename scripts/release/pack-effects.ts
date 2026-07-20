import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import type { PackCheckEffects, ReleaseArtifact } from "./pack-check";
import type { PackageSpec } from "./package-specs";
import { validatePackageDirectory } from "./validate-package";

const root = resolve(import.meta.dir, "../..");

export function createPackCheckEffects(): PackCheckEffects {
  return {
    createTemporaryDirectory: () => mkdtemp(join(tmpdir(), "termwire-pack-")),
    build: () => run(["bun", "run", "build"], root),
    readCommonVersion,
    readCanonicalLicense: () => readFile(join(root, "LICENSE"), "utf8"),
    pack,
    extract,
    validate: validatePackageDirectory,
    installConsumer,
    smokeConsumer,
    retainArchives,
    cleanup: (directory) => rm(directory, { recursive: true, force: true }),
  };
}

export async function retainArchives(
  archives: Map<string, string>,
  outputDirectory: string,
): Promise<ReleaseArtifact[]> {
  if (!isAbsolute(outputDirectory) || !outsideRepository(outputDirectory)) {
    throw new Error("output directory must be absolute and outside the repository");
  }
  const existing = await exists(outputDirectory);
  if (existing && (await readdir(outputDirectory)).length > 0) {
    throw new Error("output directory must be absent or empty");
  }
  try {
    await mkdir(outputDirectory, { recursive: true });
    const artifacts: ReleaseArtifact[] = [];
    for (const [name, source] of archives) {
      const path = join(outputDirectory, basename(source));
      await copyFile(source, path);
      const sourceHash = await sha256(source);
      const checksum = await sha256(path);
      if (sourceHash !== checksum) throw new Error(`checksum mismatch for ${name}`);
      artifacts.push({ name, path, sha256: checksum });
    }
    await writeFile(
      join(outputDirectory, "release-artifacts.json"),
      JSON.stringify(artifacts, undefined, 2),
    );
    return artifacts;
  } catch (error) {
    await rm(outputDirectory, { recursive: true, force: true });
    throw error;
  }
}

async function readCommonVersion(): Promise<string> {
  const versions = await Promise.all(
    ["tmux", "nvim", "cli", "opencode-plugin"].map(async (name) => {
      const manifest = (await Bun.file(join(root, "packages", name, "package.json")).json()) as {
        version: string;
      };
      return manifest.version;
    }),
  );
  const version = versions.at(0);
  if (!version || !versions.every((candidate) => candidate === version))
    throw new Error("workspace versions differ");
  return version;
}

async function pack(spec: PackageSpec, temporaryDirectory: string): Promise<string> {
  const destination = join(temporaryDirectory, "archives");
  await mkdir(destination, { recursive: true });
  const before = new Set(await readdir(destination));
  await run(
    ["bun", "pm", "pack", "--destination", destination],
    join(root, spec.directory),
    spec.name,
  );
  const archives = (await readdir(destination)).filter(
    (file) => file.endsWith(".tgz") && !before.has(file),
  );
  const archive = archives.at(0);
  if (archives.length !== 1 || !archive)
    throw new Error(`${spec.name}: expected one packed archive`);
  return join(destination, archive);
}

async function extract(
  archive: string,
  spec: PackageSpec,
  temporaryDirectory: string,
): Promise<string> {
  const directory = await mkdtemp(join(temporaryDirectory, "extract-"));
  await run(["tar", "-xzf", archive, "-C", directory], root, spec.name);
  return join(directory, "package");
}

async function installConsumer(
  archives: Map<string, string>,
  temporaryDirectory: string,
): Promise<string> {
  const directory = await mkdtemp(join(temporaryDirectory, "consumer-"));
  const dependencies = Object.fromEntries(
    [...archives].map(([name, path]) => [name, `file:${path}`]),
  );
  await writeFile(
    join(directory, "package.json"),
    JSON.stringify({ private: true, type: "module", dependencies, overrides: dependencies }),
  );
  await run(["bun", "install"], directory);
  await writeFile(
    join(directory, "consumer.ts"),
    `import { createTmux, type CreateTmuxOptions } from "@termwire/tmux";
import { createNvim, type CreateNvimOptions } from "@termwire/nvim";
import { run, type UpRequest } from "@termwire/cli";
import { TermwirePlugin } from "@termwire/opencode-plugin";
void [createTmux, createNvim, run, TermwirePlugin];
type Representative = CreateTmuxOptions | CreateNvimOptions | UpRequest;
void (undefined as unknown as Representative);
`,
  );
  await writeFile(
    join(directory, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        module: "ESNext",
        moduleResolution: "bundler",
        typeRoots: [join(root, "node_modules", "@types")],
      },
      include: ["consumer.ts"],
    }),
  );
  await run([join(root, "node_modules", ".bin", "tsc"), "-p", "tsconfig.json"], directory);
  return directory;
}

async function smokeConsumer(directory: string): Promise<void> {
  await run(
    [
      "bun",
      "-e",
      'import "@termwire/tmux"; import "@termwire/nvim"; import "@termwire/cli"; import { TermwirePlugin } from "@termwire/opencode-plugin"; if (!TermwirePlugin) throw new Error("missing TermwirePlugin")',
    ],
    directory,
  );
  await run(
    [join(directory, "node_modules", ".bin", "termwire"), "--help"],
    directory,
    undefined,
    "Usage: termwire",
  );
}

async function run(
  command: string[],
  cwd: string,
  packageName?: string,
  expectedOutput?: string,
): Promise<void> {
  const process = Bun.spawn(command, { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  if (exitCode !== 0 || (expectedOutput && !stdout.includes(expectedOutput))) {
    const prefix = packageName ? `${packageName}: ` : "";
    throw new Error(
      `${prefix}command failed (${command.join(" ")}) in ${cwd}; exit ${exitCode}; ${stderr || stdout}`,
    );
  }
}

async function sha256(path: string): Promise<string> {
  return new Bun.CryptoHasher("sha256").update(new Uint8Array(await readFile(path))).digest("hex");
}

async function exists(path: string): Promise<boolean> {
  return Bun.file(path).exists();
}

function outsideRepository(path: string): boolean {
  const value = relative(root, path);
  return value === ".." || value.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`);
}

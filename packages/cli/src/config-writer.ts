import { dirname, join } from "node:path";
import type { RuntimeFileSystem } from "./runtime.js";

export interface WriteConfigOptions {
  path: string;
  contents: string;
  force: boolean;
}

/** The filesystem the runtime already describes, plus a name for the temporary file. */
export interface ConfigWriterDependencies
  extends Pick<RuntimeFileSystem, "mkdir" | "writeFile" | "rename" | "unlink"> {
  suffix: () => string;
}

/**
 * Writes a config without ever losing one. Without `force` the file is created
 * exclusively, so a config that appeared since the caller last looked is reported
 * rather than replaced. With `force` the replacement goes through a temporary file
 * in the same directory and one `rename`, so `up` never reads a half-written file.
 */
export async function writeConfigFile(
  options: WriteConfigOptions,
  dependencies: ConfigWriterDependencies,
): Promise<void> {
  await dependencies.mkdir(dirname(options.path));

  if (options.force) {
    await replaceConfigFile(options, dependencies);
    return;
  }

  await createConfigFile(options, dependencies);
}

async function createConfigFile(
  options: WriteConfigOptions,
  dependencies: ConfigWriterDependencies,
): Promise<void> {
  try {
    await dependencies.writeFile(options.path, options.contents, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`${options.path} already exists; pass --force to replace it`);
    }
    throw error;
  }
}

async function replaceConfigFile(
  options: WriteConfigOptions,
  dependencies: ConfigWriterDependencies,
): Promise<void> {
  const temporary = join(dirname(options.path), `.termwire-${dependencies.suffix()}.tmp`);

  try {
    await dependencies.writeFile(temporary, options.contents, { flag: "wx" });
    await dependencies.rename(temporary, options.path);
  } catch (error) {
    await removeQuietly(temporary, dependencies);
    throw error;
  }
}

/** Cleanup must never replace the failure that caused it. */
async function removeQuietly(path: string, dependencies: ConfigWriterDependencies): Promise<void> {
  try {
    await dependencies.unlink(path);
  } catch {
    // Nothing to report: the caller is already throwing.
  }
}

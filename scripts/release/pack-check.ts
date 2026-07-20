import type { PackageSpec } from "./package-specs";

export interface PackCheckEffects {
  createTemporaryDirectory(): Promise<string>;
  build(): Promise<void>;
  readCommonVersion(): Promise<string>;
  readCanonicalLicense(): Promise<string>;
  pack(spec: PackageSpec, temporaryDirectory: string): Promise<string>;
  extract(archive: string, spec: PackageSpec, temporaryDirectory: string): Promise<string>;
  validate(
    extractedDirectory: string,
    spec: PackageSpec,
    version: string,
    license: string,
  ): Promise<void>;
  installConsumer(archives: Map<string, string>, temporaryDirectory: string): Promise<string>;
  smokeConsumer(consumerDirectory: string): Promise<void>;
  retainArchives(
    archives: Map<string, string>,
    outputDirectory: string,
  ): Promise<ReleaseArtifact[]>;
  cleanup(temporaryDirectory: string): Promise<void>;
}

export interface ReleaseArtifact {
  name: string;
  path: string;
  sha256: string;
}

export interface PackCheckOptions {
  outputDirectory?: string;
}

export async function runPackCheck(
  effects: PackCheckEffects,
  specs: PackageSpec[],
  options: PackCheckOptions = {},
): Promise<ReleaseArtifact[]> {
  const temporaryDirectory = await effects.createTemporaryDirectory();
  try {
    await effects.build();
    const version = await effects.readCommonVersion();
    const license = await effects.readCanonicalLicense();
    const archives = new Map<string, string>();
    for (const spec of specs) {
      const archive = await effects.pack(spec, temporaryDirectory);
      archives.set(spec.name, archive);
      const extracted = await effects.extract(archive, spec, temporaryDirectory);
      await effects.validate(extracted, spec, version, license);
    }
    const consumer = await effects.installConsumer(archives, temporaryDirectory);
    await effects.smokeConsumer(consumer);
    if (options.outputDirectory) {
      return await effects.retainArchives(archives, options.outputDirectory);
    }
    return [];
  } finally {
    await effects.cleanup(temporaryDirectory);
  }
}

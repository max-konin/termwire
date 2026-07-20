import { expect, test } from "bun:test";
import { runPackCheck } from "./pack-check";
import { packageSpecs } from "./package-specs";

const artifacts = [
  { name: "@termwire/tmux", path: "/release/tmux.tgz", sha256: "a".repeat(64) },
  { name: "@termwire/nvim", path: "/release/nvim.tgz", sha256: "b".repeat(64) },
];

function createEffects(events: string[], failSecondPack = false) {
  let packCount = 0;
  return {
    createTemporaryDirectory: async () => {
      events.push("temporary");
      return "/temporary";
    },
    build: async () => {
      events.push("build");
    },
    readCommonVersion: async () => {
      events.push("version");
      return "0.1.0";
    },
    readCanonicalLicense: async () => {
      events.push("license");
      return "license";
    },
    pack: async (spec: (typeof packageSpecs)[number]) => {
      events.push(`pack:${spec.name}`);
      if (++packCount === 2 && failSecondPack) throw new Error("second pack failed");
      return `/temporary/${spec.name.replace("/", "-")}.tgz`;
    },
    extract: async (archive: string, spec: (typeof packageSpecs)[number]) => {
      events.push(`extract:${spec.name}`);
      return `${archive}/package`;
    },
    validate: async (
      extractedDirectory: string,
      spec: (typeof packageSpecs)[number],
      version: string,
      license: string,
    ) => {
      events.push(`validate:${spec.name}:${version}:${license}:${extractedDirectory}`);
    },
    installConsumer: async (archives: Map<string, string>) => {
      events.push(`install:${[...archives.keys()].join(",")}`);
      return "/temporary/consumer";
    },
    smokeConsumer: async (consumerDirectory: string) => {
      events.push(`smoke:${consumerDirectory}`);
    },
    retainArchives: async (_archives: Map<string, string>, outputDirectory: string) => {
      events.push(`retain:${outputDirectory}`);
      return artifacts;
    },
    cleanup: async (temporaryDirectory: string) => {
      events.push(`cleanup:${temporaryDirectory}`);
    },
  };
}

test("runs the disposable pack check in package dependency order", async () => {
  const events: string[] = [];

  await expect(runPackCheck(createEffects(events), packageSpecs)).resolves.toEqual([]);

  expect(events).toEqual([
    "temporary",
    "build",
    "version",
    "license",
    ...packageSpecs.flatMap((spec) => [
      `pack:${spec.name}`,
      `extract:${spec.name}`,
      `validate:${spec.name}:0.1.0:license:/temporary/${spec.name.replace("/", "-")}.tgz/package`,
    ]),
    `install:${packageSpecs.map(({ name }) => name).join(",")}`,
    "smoke:/temporary/consumer",
    "cleanup:/temporary",
  ]);
});

test("retains validated archives only after consumer smoke", async () => {
  const events: string[] = [];

  await expect(
    runPackCheck(createEffects(events), packageSpecs, { outputDirectory: "/release" }),
  ).resolves.toEqual(artifacts);

  expect(events.indexOf("retain:/release")).toBeGreaterThan(
    events.indexOf("smoke:/temporary/consumer"),
  );
  expect(events.at(-1)).toBe("cleanup:/temporary");
});

test("cleans up after a pack failure without consumer or retention work", async () => {
  const events: string[] = [];

  await expect(
    runPackCheck(createEffects(events, true), packageSpecs, { outputDirectory: "/release" }),
  ).rejects.toThrow("second pack failed");

  expect(events.filter((event) => event === "cleanup:/temporary")).toHaveLength(1);
  expect(events.some((event) => event.startsWith("install:"))).toBe(false);
  expect(events.some((event) => event.startsWith("smoke:"))).toBe(false);
  expect(events.some((event) => event.startsWith("retain:"))).toBe(false);
});

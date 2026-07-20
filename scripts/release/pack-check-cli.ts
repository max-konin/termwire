import { isAbsolute } from "node:path";
import { runPackCheck } from "./pack-check";
import { createPackCheckEffects } from "./pack-effects";
import { packageSpecs } from "./package-specs";

const args = Bun.argv.slice(2);
let outputDirectory: string | undefined;
const requestedOutput = args[1];
if (args.length === 0) {
  outputDirectory = undefined;
} else if (
  args.length === 2 &&
  args[0] === "--output" &&
  requestedOutput &&
  isAbsolute(requestedOutput)
) {
  outputDirectory = requestedOutput;
} else {
  throw new Error("usage: pack-check-cli.ts [--output <absolute-directory>]");
}

try {
  const artifacts = await runPackCheck(createPackCheckEffects(), packageSpecs, { outputDirectory });
  console.log(`validated ${packageSpecs.length} package archives`);
  for (const artifact of artifacts)
    console.log(`${artifact.name} ${artifact.sha256} ${artifact.path}`);
} catch (error) {
  process.exitCode = 1;
  console.error(error instanceof Error ? error.message : error);
}

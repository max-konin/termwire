import { expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const hook = resolve(root, ".githooks/pre-commit");

function run(command: string[], cwd: string, env?: Record<string, string>) {
  const inherited = { ...process.env, ...env };
  const sanitized = Object.fromEntries(
    Object.entries(inherited).filter(([key]) => !key.startsWith("GIT_")),
  );
  const result = Bun.spawnSync(command, {
    cwd,
    env: {
      ...sanitized,
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
    },
    stderr: "pipe",
    stdout: "pipe",
  });
  return {
    ...result,
    stderr: result.stderr.toString(),
    stdout: result.stdout.toString(),
  };
}

async function createRepo() {
  const directory = await mkdtemp(join(tmpdir(), "termwire-pre-commit-"));
  await run(["git", "init", "-q"], directory);
  await run(["git", "config", "user.email", "test@example.com"], directory);
  await run(["git", "config", "user.name", "Test"], directory);
  await run(["git", "config", "core.hooksPath", "/dev/null"], directory);
  await run(["git", "config", "commit.gpgSign", "false"], directory);
  return directory;
}

async function installFakes(
  directory: string,
  behavior: "success" | "lint-fails" | "status-fails",
) {
  const bin = join(directory, "bin");
  await mkdir(bin);
  const realGit = run(["sh", "-c", "command -v git"], root).stdout.trim();
  if (!realGit) throw new Error("Unable to locate real git executable");
  await writeFile(
    join(bin, "git"),
    `#!/bin/sh
if [ "$1" = "status" ] && [ "$2" = "--porcelain=v1" ] && [ "$FAKE_GIT_STATUS_FAIL" = "1" ]; then
  exit 19
fi
exec "$REAL_GIT" "$@"
`,
  );
  await writeFile(
    join(bin, "bunx"),
    `#!/bin/sh
printf '%s\\n' "bunx $*" >> "$TERMWIRE_LOG"
printf 'formatted\\n' > fixture.ts
`,
  );
  await writeFile(
    join(bin, "bun"),
    `#!/bin/sh
printf '%s\\n' "$*" >> "$TERMWIRE_LOG"
if [ "$*" = "run lint" ]; then
  if [ "$TERMWIRE_LINT_FAIL" = "1" ]; then exit 7; fi
  [ "$(git show :fixture.ts)" = "formatted" ] || exit 8
fi
`,
  );
  await chmod(join(bin, "git"), 0o755);
  await chmod(join(bin, "bunx"), 0o755);
  await chmod(join(bin, "bun"), 0o755);
  const log = join(directory, "commands.log");
  await writeFile(log, "");
  return {
    PATH: `${bin}:${process.env.PATH ?? ""}`,
    REAL_GIT: realGit,
    FAKE_GIT_STATUS_FAIL: behavior === "status-fails" ? "1" : "0",
    TERMWIRE_LOG: log,
    TERMWIRE_LINT_FAIL: behavior === "lint-fails" ? "1" : "0",
  };
}

async function stageFixture(directory: string, content: string) {
  await writeFile(join(directory, "fixture.ts"), content);
  expect(run(["git", "add", "fixture.ts"], directory).exitCode).toBe(0);
}

test("runs formatting, lint, and tests in order and refreshes the index", async () => {
  const directory = await createRepo();
  try {
    const env = await installFakes(directory, "success");
    await stageFixture(directory, "raw\n");
    const result = run(["sh", hook], directory, {
      ...env,
      GIT_DIR: "/hostile/git-dir",
      GIT_WORK_TREE: "/hostile/work-tree",
    });

    expect(result.exitCode).toBe(0);
    expect(await readFile(join(directory, "commands.log"), "utf8")).toBe(
      "bunx biome check --write --staged --files-ignore-unknown=true --no-errors-on-unmatched\nrun lint\ntest\n",
    );
    expect(run(["git", "show", ":fixture.ts"], directory).stdout).toBe("formatted\n");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("rejects staged files with unstaged changes before running tools", async () => {
  const directory = await createRepo();
  try {
    const env = await installFakes(directory, "success");
    await stageFixture(directory, "staged\n");
    expect(
      run(
        ["git", "-c", "commit.gpgSign=false", "commit", "--no-verify", "-qm", "initial"],
        directory,
      ).exitCode,
    ).toBe(0);
    await writeFile(join(directory, "fixture.ts"), "staged\nunstaged\n");
    await stageFixture(directory, "staged\nnew staged\n");
    await writeFile(join(directory, "fixture.ts"), "staged\nnew staged\nunstaged\n");

    const result = run(["sh", hook], directory, env);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("ERROR: staged files also have unstaged changes");
    expect(await readFile(join(directory, "commands.log"), "utf8")).toBe("");
    expect(run(["git", "show", ":fixture.ts"], directory).stdout).toBe("staged\nnew staged\n");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("fails closed when git status fails before running tools", async () => {
  const directory = await createRepo();
  try {
    const env = await installFakes(directory, "status-fails");
    await stageFixture(directory, "raw\n");
    const result = run(["sh", hook], directory, env);

    expect(result.exitCode).not.toBe(0);
    expect(await readFile(join(directory, "commands.log"), "utf8")).toBe("");
    expect(run(["git", "show", ":fixture.ts"], directory).stdout).toBe("raw\n");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("propagates lint failure and does not run tests", async () => {
  const directory = await createRepo();
  try {
    const env = await installFakes(directory, "lint-fails");
    await stageFixture(directory, "raw\n");
    const result = run(["sh", hook], directory, env);

    expect(result.exitCode).toBe(7);
    expect(await readFile(join(directory, "commands.log"), "utf8")).toBe(
      "bunx biome check --write --staged --files-ignore-unknown=true --no-errors-on-unmatched\nrun lint\n",
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

import { expect, mock, test } from "bun:test";
import { type ConfigWriterDependencies, writeConfigFile } from "./config-writer.js";

function createDependencies(overrides: Partial<ConfigWriterDependencies> = {}) {
  return {
    mkdir: mock<ConfigWriterDependencies["mkdir"]>().mockResolvedValue(undefined),
    writeFile: mock<ConfigWriterDependencies["writeFile"]>().mockResolvedValue(),
    rename: mock<ConfigWriterDependencies["rename"]>().mockResolvedValue(),
    unlink: mock<ConfigWriterDependencies["unlink"]>().mockResolvedValue(),
    suffix: () => "abc123",
    ...overrides,
  };
}

const target = "/home/user/.config/termwire/config.jsonc";

test("creates the parent directory and the file exclusively", async () => {
  const dependencies = createDependencies();

  await writeConfigFile({ path: target, contents: "{}", force: false }, dependencies);

  expect(dependencies.mkdir).toHaveBeenCalledWith("/home/user/.config/termwire");
  expect(dependencies.writeFile).toHaveBeenCalledWith(target, "{}", { flag: "wx" });
  expect(dependencies.rename).not.toHaveBeenCalled();
});

test("reports an existing config instead of replacing it", async () => {
  const dependencies = createDependencies({
    writeFile: mock<ConfigWriterDependencies["writeFile"]>().mockRejectedValue(
      Object.assign(new Error("exists"), { code: "EEXIST" }),
    ),
  });

  await expect(
    writeConfigFile({ path: target, contents: "{}", force: false }, dependencies),
  ).rejects.toThrow(`${target} already exists; pass --force to replace it`);
});

test("propagates a write failure that is not a collision", async () => {
  const failure = Object.assign(new Error("read-only"), { code: "EROFS" });
  const dependencies = createDependencies({
    writeFile: mock<ConfigWriterDependencies["writeFile"]>().mockRejectedValue(failure),
  });

  await expect(
    writeConfigFile({ path: target, contents: "{}", force: false }, dependencies),
  ).rejects.toBe(failure);
});

test("replaces through a sibling temporary file and one rename", async () => {
  const dependencies = createDependencies();

  await writeConfigFile({ path: target, contents: "{}", force: true }, dependencies);

  const temporary = "/home/user/.config/termwire/.termwire-abc123.tmp";
  expect(dependencies.writeFile).toHaveBeenCalledWith(temporary, "{}", { flag: "wx" });
  expect(dependencies.rename).toHaveBeenCalledWith(temporary, target);
});

test("removes the temporary file when the replacement fails", async () => {
  const failure = new Error("rename failed");
  const dependencies = createDependencies({
    rename: mock<ConfigWriterDependencies["rename"]>().mockRejectedValue(failure),
  });

  await expect(
    writeConfigFile({ path: target, contents: "{}", force: true }, dependencies),
  ).rejects.toBe(failure);
  expect(dependencies.unlink).toHaveBeenCalledWith(
    "/home/user/.config/termwire/.termwire-abc123.tmp",
  );
});

test("keeps the original failure when cleanup also fails", async () => {
  const failure = new Error("rename failed");
  const dependencies = createDependencies({
    rename: mock<ConfigWriterDependencies["rename"]>().mockRejectedValue(failure),
    unlink: mock<ConfigWriterDependencies["unlink"]>().mockRejectedValue(new Error("gone")),
  });

  await expect(
    writeConfigFile({ path: target, contents: "{}", force: true }, dependencies),
  ).rejects.toBe(failure);
});

import { expect, mock, test } from "bun:test";
import { createConfigLoader } from "./config-loader";

test("loads global config from XDG_CONFIG_HOME using UTF-8", async () => {
  const readFile =
    mock<(path: string, encoding: "utf8") => Promise<string>>().mockResolvedValue(
      '{ "version": 1 }',
    );
  const loader = createConfigLoader({
    env: { XDG_CONFIG_HOME: "/xdg" },
    homedir: () => "/home/max",
    exists: mock<(path: string) => Promise<boolean>>().mockResolvedValue(true),
    readFile,
  });

  await loader.loadGlobal();

  expect(readFile).toHaveBeenCalledWith("/xdg/termwire/config.jsonc", "utf8");
});

test("falls back to the home config directory for global config", async () => {
  const readFile =
    mock<(path: string, encoding: "utf8") => Promise<string>>().mockResolvedValue(
      '{ "version": 1 }',
    );
  const loader = createConfigLoader({
    env: {},
    homedir: () => "/home/max",
    exists: mock<(path: string) => Promise<boolean>>().mockResolvedValue(true),
    readFile,
  });

  await loader.loadGlobal();

  expect(readFile).toHaveBeenCalledWith("/home/max/.config/termwire/config.jsonc", "utf8");
});

test.each([
  ["empty", ""],
  ["relative", "relative/config"],
])(
  "falls back to the home config directory when XDG_CONFIG_HOME is %s",
  async (_caseName, XDG_CONFIG_HOME) => {
    const readFile =
      mock<(path: string, encoding: "utf8") => Promise<string>>().mockResolvedValue(
        '{ "version": 1 }',
      );
    const loader = createConfigLoader({
      env: { XDG_CONFIG_HOME },
      homedir: () => "/home/max",
      exists: mock<(path: string) => Promise<boolean>>().mockResolvedValue(true),
      readFile,
    });

    await loader.loadGlobal();

    expect(readFile).toHaveBeenCalledWith("/home/max/.config/termwire/config.jsonc", "utf8");
  },
);

test("returns undefined for a missing optional global config", async () => {
  const readFile =
    mock<(path: string, encoding: "utf8") => Promise<string>>().mockResolvedValue(
      '{ "version": 1 }',
    );
  const loader = createConfigLoader({
    env: { XDG_CONFIG_HOME: "/xdg" },
    homedir: () => "/home/max",
    exists: mock<(path: string) => Promise<boolean>>().mockResolvedValue(false),
    readFile,
  });

  expect(await loader.loadGlobal()).toBeUndefined();
  expect(readFile).not.toHaveBeenCalled();
});

test("returns undefined when an existing config disappears before it is read", async () => {
  const missing = Object.assign(new Error("missing"), { code: "ENOENT" });
  const loader = createConfigLoader({
    env: { XDG_CONFIG_HOME: "/xdg" },
    homedir: () => "/home/max",
    exists: mock<(path: string) => Promise<boolean>>().mockResolvedValue(true),
    readFile:
      mock<(path: string, encoding: "utf8") => Promise<string>>().mockRejectedValue(missing),
  });

  await expect(loader.loadGlobal()).resolves.toBeUndefined();
});

test("loads project config from the resolved Git root using UTF-8", async () => {
  const readFile =
    mock<(path: string, encoding: "utf8") => Promise<string>>().mockResolvedValue(
      '{ "version": 1 }',
    );
  const loader = createConfigLoader({
    env: {},
    homedir: () => "/home/max",
    exists: mock<(path: string) => Promise<boolean>>().mockResolvedValue(true),
    readFile,
  });

  await loader.loadProject("/worktrees/repo-feature");

  expect(readFile).toHaveBeenCalledWith("/worktrees/repo-feature/.termwire.jsonc", "utf8");
});

test("parses JSONC comments and trailing commas", async () => {
  const loader = createConfigLoader({
    env: { XDG_CONFIG_HOME: "/xdg" },
    homedir: () => "/home/max",
    exists: mock<(path: string) => Promise<boolean>>().mockResolvedValue(true),
    readFile: mock<(path: string, encoding: "utf8") => Promise<string>>().mockResolvedValue(
      '// note\n{ "version": 1, }',
    ),
  });

  expect(await loader.loadGlobal()).toEqual({
    source: "/xdg/termwire/config.jsonc",
    value: { version: 1 },
  });
});

test("reports malformed JSONC with its source and one-based location", async () => {
  const loader = createConfigLoader({
    env: { XDG_CONFIG_HOME: "/xdg" },
    homedir: () => "/home/max",
    exists: mock<(path: string) => Promise<boolean>>().mockResolvedValue(true),
    readFile:
      mock<(path: string, encoding: "utf8") => Promise<string>>().mockResolvedValue(
        '{\n  "version":\n}',
      ),
  });

  await expect(loader.loadGlobal()).rejects.toThrow("/xdg/termwire/config.jsonc:3:1");
});

test("reports malformed JSONC with lone-CR line endings", async () => {
  const loader = createConfigLoader({
    env: { XDG_CONFIG_HOME: "/xdg" },
    homedir: () => "/home/max",
    exists: mock<(path: string) => Promise<boolean>>().mockResolvedValue(true),
    readFile:
      mock<(path: string, encoding: "utf8") => Promise<string>>().mockResolvedValue(
        '{\r  "version":\r}',
      ),
  });

  await expect(loader.loadGlobal()).rejects.toThrow("/xdg/termwire/config.jsonc:3:1");
});

test("wraps an unreadable existing config with its source and cause", async () => {
  const cause = Object.assign(new Error("permission denied"), { code: "EACCES" });
  const loader = createConfigLoader({
    env: { XDG_CONFIG_HOME: "/xdg" },
    homedir: () => "/home/max",
    exists: mock<(path: string) => Promise<boolean>>().mockResolvedValue(true),
    readFile: mock<(path: string, encoding: "utf8") => Promise<string>>().mockRejectedValue(cause),
  });

  await expect(loader.loadGlobal()).rejects.toMatchObject({
    message: "Failed to read config /xdg/termwire/config.jsonc",
    cause,
  });
});

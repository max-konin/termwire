import { isAbsolute, join } from "node:path";
import { type ParseError, parse } from "jsonc-parser";
import type { LoadedConfig } from "./config-types.js";

export interface ConfigLoaderDependencies {
  env: Record<string, string | undefined>;
  homedir: () => string;
  exists: (path: string) => Promise<boolean>;
  readFile: (path: string, encoding: "utf8") => Promise<string>;
}

export function createConfigLoader(dependencies: ConfigLoaderDependencies): {
  loadGlobal(): Promise<LoadedConfig | undefined>;
  loadProject(gitRoot: string): Promise<LoadedConfig | undefined>;
} {
  return {
    async loadGlobal() {
      return loadFile(dependencies, globalConfigPath(dependencies));
    },
    async loadProject(gitRoot) {
      return loadFile(dependencies, join(gitRoot, ".termwire.jsonc"));
    },
  };
}

/** `$XDG_CONFIG_HOME` when it is absolute, `~/.config` otherwise. */
export function configHome(dependencies: {
  env: Record<string, string | undefined>;
  homedir: () => string;
}): string {
  const xdgConfigHome = dependencies.env.XDG_CONFIG_HOME;
  return xdgConfigHome && isAbsolute(xdgConfigHome)
    ? xdgConfigHome
    : join(dependencies.homedir(), ".config");
}

export function globalConfigPath(dependencies: {
  env: Record<string, string | undefined>;
  homedir: () => string;
}): string {
  return join(configHome(dependencies), "termwire", "config.jsonc");
}

function lineColumn(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let column = 1;
  for (let index = 0; index < offset; index += 1) {
    if (text[index] === "\r") {
      if (text[index + 1] === "\n" && index + 1 < offset) {
        index += 1;
      }
      line += 1;
      column = 1;
    } else if (text[index] === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { line, column };
}

async function loadFile(
  dependencies: ConfigLoaderDependencies,
  path: string,
): Promise<LoadedConfig | undefined> {
  if (!(await dependencies.exists(path))) {
    return undefined;
  }

  let text: string;
  try {
    text = await dependencies.readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw new Error(`Failed to read config ${path}`, { cause: error });
  }

  const errors: ParseError[] = [];
  const value = parse(text, errors, { allowTrailingComma: true, disallowComments: false });

  if (errors.length > 0) {
    const { line, column } = lineColumn(text, errors[0].offset);
    throw new Error(`${path}:${line}:${column}: ${errors[0].error}`);
  }

  return { source: path, value };
}

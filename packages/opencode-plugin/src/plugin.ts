import type { Plugin } from "@opencode-ai/plugin";
import type { OpenFileHandler } from "./open";
import { createTermwireOpenTool } from "./tool";

export function createTermwirePlugin(openFile: OpenFileHandler): Plugin {
  return async () => ({
    tool: { termwire_open: createTermwireOpenTool(openFile) },
  });
}

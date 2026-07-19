import type { Plugin } from "@opencode-ai/plugin";
import type { OpenFileHandler } from "./open";
import { createOpenbridgeOpenTool } from "./tool";

export function createOpenbridgePlugin(openFile: OpenFileHandler): Plugin {
  return async () => ({
    tool: { openbridge_open: createOpenbridgeOpenTool(openFile) },
  });
}

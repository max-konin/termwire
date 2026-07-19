import { tool } from "@opencode-ai/plugin";
import type { OpenFileHandler } from "./open";

export function createOpenbridgeOpenTool(openFile: OpenFileHandler) {
  return tool({
    description: "Open a file in this workspace's Neovim instance and focus the editor pane.",
    args: {
      path: tool.schema.string().trim().min(1).describe("File path to open"),
      line: tool.schema
        .number()
        .int()
        .positive()
        .optional()
        .describe("Optional 1-based line number"),
    },
    async execute({ path, line }, context) {
      const result = await openFile({ directory: context.directory, path, line });
      const suffix = result.line === undefined ? "" : ` at line ${result.line}`;
      return {
        title: "Open file",
        output: `Opened ${result.path}${suffix}`,
        metadata: result,
      };
    },
  });
}

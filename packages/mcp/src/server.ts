import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { OpenFileHandler } from "./open";
import {
  createTermwireOpenToolHandler,
  termwireOpenInputSchema,
  termwireOpenOutputSchema,
} from "./tool";

export function createTermwireMcpServer(openFile: OpenFileHandler): McpServer {
  const server = new McpServer({ name: "termwire", version: "0.1.2" });
  server.registerTool(
    "termwire_open",
    {
      description:
        "Open a file in this workspace's Neovim instance and focus the editor pane when available.",
      inputSchema: termwireOpenInputSchema,
      outputSchema: termwireOpenOutputSchema,
    },
    createTermwireOpenToolHandler(openFile),
  );

  return server;
}

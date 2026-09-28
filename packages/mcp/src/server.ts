import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { OpenFileHandler } from "./open.js";
import {
  createTermwireOpenToolHandler,
  termwireOpenInputSchema,
  termwireOpenOutputSchema,
} from "./tool.js";

const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  version: string;
};

export function createTermwireMcpServer(openFile: OpenFileHandler): McpServer {
  const server = new McpServer({ name: "termwire", version: manifest.version });
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

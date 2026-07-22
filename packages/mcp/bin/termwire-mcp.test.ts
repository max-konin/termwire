import { expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

function cleanEnvironment(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      ([key, value]) => value !== undefined && !key.startsWith("TERMWIRE_"),
    ),
  ) as Record<string, string>;
}

test("initializes, lists termwire_open, and returns a workspace error", async () => {
  const binaryPath = new URL("./termwire-mcp.ts", import.meta.url).pathname;
  const client = new Client({ name: "termwire-test-client", version: "0.1.0" });
  const transport = new StdioClientTransport({
    command: "bun",
    args: [binaryPath],
    env: cleanEnvironment(),
  });

  try {
    await client.connect(transport);

    const listed = await client.listTools();

    expect(listed.tools.map(({ name }) => name)).toEqual(["termwire_open"]);
    expect(listed.tools[0]?.description).toBe(
      "Open a file in this workspace's Neovim instance and focus the editor pane when available.",
    );
    expect(listed.tools[0]?.inputSchema).toMatchObject({ type: "object", required: ["path"] });

    const result = await client.callTool({
      name: "termwire_open",
      arguments: { path: "README.md", line: 3 },
    });

    expect(result).toEqual({
      content: [{ type: "text", text: "not inside a termwire workspace" }],
      isError: true,
    });
  } finally {
    await client.close();
  }
});

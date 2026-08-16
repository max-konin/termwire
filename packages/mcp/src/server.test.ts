import { expect, test } from "bun:test";
import { createTermwireMcpServer } from "./server";

test("advertises the current package release in MCP server metadata", () => {
  const server = createTermwireMcpServer(async () => ({ path: "/tmp/file" }));

  expect(
    (server.server as unknown as { _serverInfo: { version: string } })._serverInfo.version,
  ).toBe("0.2.1");
});

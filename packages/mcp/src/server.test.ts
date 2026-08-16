import { expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import packageJson from "../package.json";
import { createTermwireMcpServer } from "./server";

test("advertises the package release in the public MCP initialization response", async () => {
  const server = createTermwireMcpServer(async () => ({ path: "/tmp/file" }));
  const client = new Client({ name: "termwire-test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    expect(client.getServerVersion()?.version).toBe(packageJson.version);
  } finally {
    await client.close();
    await server.close();
  }
});

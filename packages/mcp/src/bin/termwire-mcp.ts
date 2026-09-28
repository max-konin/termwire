#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createNvim } from "@termwire/nvim";
import { createTmux } from "@termwire/tmux";
import { createOpenFileHandler } from "../open.js";
import { createTermwireMcpServer } from "../server.js";

const openFile = createOpenFileHandler({
  getEnv: () => process.env,
  getCwd: () => process.cwd(),
  nvim: createNvim(),
  tmux: createTmux(),
});

await createTermwireMcpServer(openFile).connect(new StdioServerTransport());

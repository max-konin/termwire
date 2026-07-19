import { createNvim } from "@openbridge/nvim";
import { createTmux } from "@openbridge/tmux";
import { createOpenFileHandler } from "./open";
import { createOpenbridgePlugin } from "./plugin";

const openFile = createOpenFileHandler({
  getEnv: () => process.env,
  nvim: createNvim(),
  tmux: createTmux(),
});

export const OpenbridgePlugin = createOpenbridgePlugin(openFile);

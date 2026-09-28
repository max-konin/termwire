import { createNvim } from "@termwire/nvim";
import { createTmux } from "@termwire/tmux";
import { createOpenFileHandler } from "./open.js";
import { createTermwirePlugin } from "./plugin.js";

const openFile = createOpenFileHandler({
  getEnv: () => process.env,
  nvim: createNvim(),
  tmux: createTmux(),
});

export const TermwirePlugin = createTermwirePlugin(openFile);

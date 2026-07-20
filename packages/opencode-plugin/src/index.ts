import { createNvim } from "@termwire/nvim";
import { createTmux } from "@termwire/tmux";
import { createOpenFileHandler } from "./open";
import { createTermwirePlugin } from "./plugin";

const openFile = createOpenFileHandler({
  getEnv: () => process.env,
  nvim: createNvim(),
  tmux: createTmux(),
});

export const TermwirePlugin = createTermwirePlugin(openFile);

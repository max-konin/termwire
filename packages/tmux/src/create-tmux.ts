import { attach } from "./client";
import { selectPane, sendKeys, splitPane } from "./pane";
import { bunExec, type Exec } from "./process";
import { hasSession, newSession } from "./session";
import { newWindow, selectWindow } from "./window";

export interface CreateTmuxOptions {
  exec?: Exec;
  env?: Record<string, string | undefined>;
}

export function createTmux({ exec = bunExec, env = process.env }: CreateTmuxOptions = {}) {
  return {
    hasSession: (session: string) => hasSession(exec, session),
    newSession: (options: Parameters<typeof newSession>[1]) => newSession(exec, options),
    newWindow: (options: Parameters<typeof newWindow>[1]) => newWindow(exec, options),
    splitPane: (options: Parameters<typeof splitPane>[1]) => splitPane(exec, options),
    sendKeys: (target: string, keys: readonly string[], options?: Parameters<typeof sendKeys>[3]) =>
      sendKeys(exec, target, keys, options),
    selectWindow: (target: string) => selectWindow(exec, target),
    selectPane: (target: string) => selectPane(exec, target),
    attach: (session: string) => attach(exec, env, session),
  };
}

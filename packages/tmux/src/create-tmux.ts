import { attach } from "./client";
import { respawnPane, selectPane, sendKeys, splitPane } from "./pane";
import { bunExec, type Exec } from "./process";
import { hasSession, killSession, newSession, setEnvironment, setSessionTitle } from "./session";
import { newWindow, selectLayout, selectWindow } from "./window";

export interface CreateTmuxOptions {
  exec?: Exec;
  env?: Record<string, string | undefined>;
}

export function createTmux({ exec = bunExec, env = process.env }: CreateTmuxOptions = {}) {
  return {
    hasSession: (session: string) => hasSession(exec, session),
    newSession: (options: Parameters<typeof newSession>[1]) => newSession(exec, options),
    newWindow: (options: Parameters<typeof newWindow>[1]) => newWindow(exec, options),
    setEnvironment: (session: string, key: string, value: string) =>
      setEnvironment(exec, session, key, value),
    setSessionTitle: (session: string) => setSessionTitle(exec, session),
    killSession: (session: string) => killSession(exec, session),
    respawnPane: (options: Parameters<typeof respawnPane>[1]) => respawnPane(exec, options),
    splitPane: (options: Parameters<typeof splitPane>[1]) => splitPane(exec, options),
    sendKeys: (target: string, keys: readonly string[], options?: Parameters<typeof sendKeys>[3]) =>
      sendKeys(exec, target, keys, options),
    selectWindow: (target: string) => selectWindow(exec, target),
    selectLayout: (target: string, layout: Parameters<typeof selectLayout>[2]) =>
      selectLayout(exec, target, layout),
    selectPane: (target: string) => selectPane(exec, target),
    attach: (session: string) => attach(exec, env, session),
  };
}

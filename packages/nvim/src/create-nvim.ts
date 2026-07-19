import { openFile } from "./file";
import { bunExec, type Exec } from "./process";
import { isRunning } from "./server";

export interface CreateNvimOptions {
  exec?: Exec;
}

export function createNvim({ exec = bunExec }: CreateNvimOptions = {}) {
  return {
    isRunning: (socket: string) => isRunning(exec, socket),
    openFile: (socket: string, file: string, line?: number) => openFile(exec, socket, file, line),
  };
}

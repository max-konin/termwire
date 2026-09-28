import { openFile } from "./file.js";
import { type Exec, spawnExec } from "./process.js";
import { isRunning } from "./server.js";

export interface CreateNvimOptions {
  exec?: Exec;
}

export function createNvim({ exec = spawnExec }: CreateNvimOptions = {}) {
  return {
    isRunning: (socket: string) => isRunning(exec, socket),
    openFile: (socket: string, file: string, line?: number) => openFile(exec, socket, file, line),
  };
}

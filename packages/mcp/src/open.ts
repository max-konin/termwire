import { resolve } from "node:path";

export type WorkspaceEnvironment = Record<string, string | undefined>;
export type OpenFileRequest = { path: string; line?: number };
export type OpenFileResult = { path: string; line?: number };
export type OpenFileHandler = (request: OpenFileRequest) => Promise<OpenFileResult>;
export type NvimClient = {
  isRunning(socket: string): Promise<boolean>;
  openFile(socket: string, path: string, line?: number): Promise<void>;
};
export type TmuxClient = {
  selectWindow(target: string): Promise<void>;
  selectPane(pane: string): Promise<void>;
};
export type CreateOpenFileHandlerOptions = {
  getEnv: () => WorkspaceEnvironment;
  getCwd: () => string;
  nvim: NvimClient;
  tmux: TmuxClient;
};

export function createOpenFileHandler({
  getEnv,
  getCwd,
  nvim,
  tmux,
}: CreateOpenFileHandlerOptions): OpenFileHandler {
  return async ({ path, line }) => {
    const env = getEnv();
    const socket = env.TERMWIRE_SOCKET?.trim();
    const editorPane = env.TERMWIRE_EDITOR_PANE?.trim();

    if (!socket) throw new Error("not inside a termwire workspace");

    const absolutePath = resolve(getCwd(), path);

    if (!(await nvim.isRunning(socket))) {
      throw new Error(`nvim is not responding on socket ${socket}`);
    }

    await nvim.openFile(socket, absolutePath, line);

    if (editorPane) {
      await tmux.selectWindow(editorPane);
      await tmux.selectPane(editorPane);
    }

    return { path: absolutePath, line };
  };
}

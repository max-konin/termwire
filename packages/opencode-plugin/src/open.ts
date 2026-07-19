import { resolve } from "node:path";

export type WorkspaceEnvironment = Record<string, string | undefined>;

export type OpenFileRequest = {
  directory: string;
  path: string;
  line?: number;
};

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
  nvim: NvimClient;
  tmux: TmuxClient;
};

export function createOpenFileHandler({
  getEnv,
  nvim,
  tmux,
}: CreateOpenFileHandlerOptions): OpenFileHandler {
  return async ({ directory, path, line }) => {
    const env = getEnv();
    const socket = env.OPENBRIDGE_SOCKET?.trim();
    const editorPane = env.OPENBRIDGE_EDITOR_PANE?.trim();
    const absolutePath = resolve(directory, path);

    if (!socket || !editorPane) {
      throw new Error("not inside an openbridge workspace");
    }

    if (!(await nvim.isRunning(socket))) {
      throw new Error(`nvim is not responding on socket ${socket}`);
    }

    await nvim.openFile(socket, absolutePath, line);

    await tmux.selectWindow(editorPane);
    await tmux.selectPane(editorPane);

    return { path: absolutePath, line };
  };
}

import { resolve } from "node:path";

export interface OpenRequest {
  target: string;
  line?: string;
}

export interface OpenResult {
  path: string;
  line?: number;
}

export interface NvimClient {
  isRunning(socket: string): Promise<boolean>;
  openFile(socket: string, path: string, line?: number): Promise<void>;
}

export interface TmuxClient {
  selectWindow(target: string): Promise<void>;
  selectPane(pane: string): Promise<void>;
}

export interface OpenDependencies {
  cwd: () => string;
  env: Record<string, string | undefined>;
  nvim: NvimClient;
  tmux: TmuxClient;
}

const lineSuffix = /^(.+):(\d+)$/;

function parseLine(value: string): number {
  const trimmed = value.trim();

  if (!/^\d+$/.test(trimmed) || Number(trimmed) < 1) {
    throw new Error("line must be a positive integer");
  }

  return Number(trimmed);
}

export function parseTarget(target: string, line?: string): { path: string; line?: number } {
  const trimmed = target.trim();

  if (trimmed === "") {
    throw new Error("path must not be empty");
  }

  if (line !== undefined) {
    return { path: trimmed, line: parseLine(line) };
  }

  const match = lineSuffix.exec(trimmed);

  if (!match) {
    return { path: trimmed };
  }

  const [, path, suffix] = match;

  if (path === undefined || suffix === undefined) {
    return { path: trimmed };
  }

  return { path, line: parseLine(suffix) };
}

export async function open(
  request: OpenRequest,
  dependencies: OpenDependencies,
): Promise<OpenResult> {
  const parsed = parseTarget(request.target, request.line);
  const socket = dependencies.env.TERMWIRE_SOCKET?.trim();
  const editorPane = dependencies.env.TERMWIRE_EDITOR_PANE?.trim();

  if (!socket) {
    throw new Error("not inside a termwire workspace");
  }

  const path = resolve(dependencies.cwd(), parsed.path);

  if (!(await dependencies.nvim.isRunning(socket))) {
    throw new Error(`nvim is not responding on socket ${socket}`);
  }

  await dependencies.nvim.openFile(socket, path, parsed.line);

  if (editorPane) {
    await dependencies.tmux.selectWindow(editorPane);
    await dependencies.tmux.selectPane(editorPane);
  }

  return { path, ...(parsed.line === undefined ? {} : { line: parsed.line }) };
}

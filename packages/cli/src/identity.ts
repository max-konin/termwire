import { basename } from "node:path";

export interface WorkspaceIdentity {
  project: string;
  session: string;
  socket: string;
}

export function sanitizeComponent(value: string, label: string): string {
  const sanitized = value
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (sanitized.length === 0) {
    throw new Error(`${label} must contain a letter, number, _ or -`);
  }
  return sanitized;
}

export function createIdentity(options: {
  cwd: string;
  gitRoot?: string;
  name: string;
}): WorkspaceIdentity {
  const project = sanitizeComponent(
    basename(options.gitRoot ?? options.cwd),
    "project",
  );
  const name = sanitizeComponent(options.name, "name");
  const session = `${project}-${name}`;
  const socket = `/tmp/openbridge/${session}.sock`;

  if (Buffer.byteLength(socket) > 103) {
    throw new Error("socket path exceeds macOS Unix socket limit of 103 bytes");
  }

  return {
    project,
    session,
    socket,
  };
}

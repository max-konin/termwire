import { sep } from "node:path";
import { type SessionScanner, sessionVariable } from "./process-scan.js";
import type { GitExec } from "./worktree.js";

/** What `ls` knows about one workspace. Collected from tmux and Git, never from disk. */
export interface Workspace {
  session: string;
  attached: boolean;
  /** The Git branch, a short sha on a detached HEAD, or `-` outside a repository. */
  branch: string;
  /** The session path, absolute: shortening to `~` is for the table, not for machines. */
  directory: string;
  /** The session outlived its directory, which is listed and marked rather than fatal. */
  missing: boolean;
  procs: number;
  rssKib: number;
}

/** The fields of a tmux session this module reads, as the adapter reports them. */
export interface WorkspaceSession {
  name: string;
  attached: boolean;
  path: string;
}

export interface WorkspacesDependencies {
  listSessions: () => Promise<WorkspaceSession[]>;
  showEnvironment: (session: string) => Promise<Record<string, string>>;
  git: GitExec;
  pathExists: (path: string) => Promise<boolean>;
  /** One walk over the process table, asked for every workspace at once. */
  scan: SessionScanner;
}

const unknownBranch = "-";

/**
 * A session is a workspace when its tmux environment carries `TERMWIRE_SESSION`,
 * never because its name looks like `<project>-<name>`: the user picks the name and
 * `up` sets the label, so a session of their own is never mistaken for ours.
 */
export async function collectWorkspaces({
  listSessions,
  showEnvironment,
  git,
  pathExists,
  scan,
}: WorkspacesDependencies): Promise<Workspace[]> {
  const sessions = await listSessions();
  const labeled: WorkspaceSession[] = [];

  for (const session of sessions) {
    const environment = await showEnvironment(session.name);
    if (environment[sessionVariable] !== undefined) labeled.push(session);
  }

  if (labeled.length === 0) return [];

  const usage = await measureSessions(
    scan,
    labeled.map((session) => session.name),
  );

  return await Promise.all(
    labeled.map((session) =>
      describeWorkspace(session, usage.get(session.name) ?? noUsage, { git, pathExists }),
    ),
  );
}

async function describeWorkspace(
  session: WorkspaceSession,
  usage: SessionUsage,
  { git, pathExists }: Pick<WorkspacesDependencies, "git" | "pathExists">,
): Promise<Workspace> {
  const exists = await pathExists(session.path);

  return {
    session: session.name,
    attached: session.attached,
    branch: exists ? await readBranch(git, session.path) : unknownBranch,
    directory: session.path,
    missing: !exists,
    ...usage,
  };
}

/** Git answers through `-C`, so a directory that is gone fails instead of the spawn. */
export async function readBranch(git: GitExec, directory: string): Promise<string> {
  const current = await git(["git", "-C", directory, "branch", "--show-current"]);
  if (current.exitCode !== 0) return unknownBranch;

  const branch = current.stdout.trim();
  if (branch.length > 0) return branch;

  // No current branch: a detached HEAD, which the short sha names.
  const head = await git(["git", "-C", directory, "rev-parse", "--short", "HEAD"]);
  const sha = head.stdout.trim();
  return head.exitCode === 0 && sha.length > 0 ? sha : unknownBranch;
}

interface SessionUsage {
  procs: number;
  rssKib: number;
}

const noUsage: SessionUsage = { procs: 0, rssKib: 0 };

async function measureSessions(
  scan: SessionScanner,
  sessions: readonly string[],
): Promise<Map<string, SessionUsage>> {
  const { processes, labeled } = await scan(sessions);
  const resident = new Map(processes.map(({ pid, rss }) => [pid, rss]));
  const usage = new Map<string, SessionUsage>();

  for (const [session, pids] of labeled) {
    let rssKib = 0;
    for (const pid of pids) rssKib += resident.get(pid) ?? 0;
    usage.set(session, { procs: pids.length, rssKib });
  }

  return usage;
}

/** `$HOME` as `~`. A path that lies elsewhere, or an unknown home, is left alone. */
export function shortenHome(path: string, home: string): string {
  const root = home.endsWith(sep) ? home.slice(0, -sep.length) : home;

  if (root.length === 0) return path;
  if (path === root) return "~";
  return path.startsWith(`${root}${sep}`) ? `~${path.slice(root.length)}` : path;
}

/** KiB as the column shows it: K under a megabyte, M under a gigabyte, then one decimal. */
export function formatRss(kib: number): string {
  if (kib < 1024) return `${kib}K`;

  const mib = kib / 1024;
  if (mib < 1024) return `${Math.round(mib)}M`;

  return `${(mib / 1024).toFixed(1)}G`;
}

/**
 * One column: its header, how it pads, and where its value comes from. Each column
 * carries its own cell so the header row and the data rows cannot fall out of step.
 */
const columns = [
  { header: "SESSION", align: "left", cell: ({ session }: Workspace) => session },
  { header: "A", align: "left", cell: ({ attached }: Workspace) => (attached ? "*" : "") },
  { header: "BRANCH", align: "left", cell: ({ branch }: Workspace) => branch },
  { header: "DIRECTORY", align: "left", cell: formatDirectory },
  { header: "PROCS", align: "right", cell: ({ procs }: Workspace) => String(procs) },
  { header: "RSS", align: "right", cell: ({ rssKib }: Workspace) => formatRss(rssKib) },
] as const;

/** Empty is not an error: nothing running is a normal answer. */
const noWorkspaces = "no termwire workspaces";

/** The table `ls` prints, padded to its own contents. */
export function formatWorkspaceTable(workspaces: readonly Workspace[], home: string): string {
  if (workspaces.length === 0) return `${noWorkspaces}\n`;

  const rows = workspaces.map((workspace) => columns.map(({ cell }) => cell(workspace, home)));
  const widths = columns.map(({ header }, index) =>
    rows.reduce((width, cells) => Math.max(width, cells[index].length), header.length),
  );

  const lines = [columns.map(({ header }) => header), ...rows].map((cells) =>
    formatRow(cells, widths),
  );

  return `${lines.join("\n")}\n`;
}

/** The same rows for machines: absolute directories, and `rssKib` in KiB. */
export function formatWorkspacesJson(workspaces: readonly Workspace[]): string {
  return `${JSON.stringify(workspaces, null, 2)}\n`;
}

function formatDirectory(workspace: Workspace, home: string): string {
  const directory = shortenHome(workspace.directory, home);
  return workspace.missing ? `${directory} (missing)` : directory;
}

function formatRow(cells: readonly string[], widths: readonly number[]): string {
  return cells
    .map((cell, index) => pad(cell, widths[index], columns[index].align))
    .join("  ")
    .trimEnd();
}

function pad(cell: string, width: number, align: "left" | "right"): string {
  return align === "right" ? cell.padStart(width) : cell.padEnd(width);
}

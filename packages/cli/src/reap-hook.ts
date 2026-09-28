import { isAbsolute } from "node:path";
import type { HookEntry, SetHookOptions, ShowHooksOptions, UnsetHookOptions } from "@termwire/tmux";

export const reapHookName = "session-closed";
/**
 * Identifies our entry among the user's own `session-closed` hooks, and doubles as
 * a harmless environment assignment in the shell command that carries it.
 */
export const reapHookMarker = "TERMWIRE_REAP_HOOK=1";
export const reapCommandName = "_reap";
/** tmux expands this when the hook fires; `#{q:...}` escapes it for sh(1). */
const sessionFormat = "hook_session_name";

export type ReapHookOutcome = "created" | "updated" | "unchanged";

export interface ReapHookTmux {
  showHooks: (options?: ShowHooksOptions) => Promise<HookEntry[]>;
  setHook: (options: SetHookOptions) => Promise<void>;
  unsetHook: (options: UnsetHookOptions) => Promise<void>;
}

export interface ReapHookPaths {
  execPath: string;
  scriptPath: string;
}

/**
 * The tmux server has its own environment and no `PATH` we control, so the hook
 * names the interpreter and the script by absolute path. `#{hook_session_name}` is
 * expanded by tmux when the hook fires; only the global hook sees it, because a
 * session is destroyed before its own hooks run.
 *
 * `run-shell -b` never runs when the session being closed is the last one, because
 * the server shuts down first. A foreground `run-shell` does run, and the trailing
 * `&` hands the reap to a detached child that outlives the server, so tmux waits
 * only for the fork and the closing client never blocks on it.
 *
 * The hook is global and therefore fires for sessions Termwire never created,
 * whose names it never sanitized. `#{q:...}` is what makes that safe: tmux escapes
 * the sh(1) special characters in the name, so the name must stay unquoted here.
 * Quoting it would disarm the escaping and turn a session named
 * `evil'; rm -rf ~; '` into a command.
 */
export function createReapHookCommand(paths: ReapHookPaths): string {
  const execPath = shellQuote(paths.execPath, "interpreter path");
  const scriptPath = shellQuote(paths.scriptPath, "script path");
  const session = `#{q:${sessionFormat}}`;
  const command = `${reapHookMarker} ${execPath} ${scriptPath} ${reapCommandName} ${session}`;
  return `run-shell "${command} >/dev/null 2>&1 &"`;
}

export async function ensureReapHook(options: {
  tmux: ReapHookTmux;
  execPath: string;
  scriptPath: string;
}): Promise<ReapHookOutcome> {
  const command = createReapHookCommand(options);
  const entries = await options.tmux.showHooks({ global: true });
  const [existing, ...duplicates] = entries.filter(
    (entry) => entry.name === reapHookName && entry.command.includes(reapHookMarker),
  );

  if (existing === undefined) {
    // Appending keeps any `session-closed` hook the user configured themselves.
    await options.tmux.setHook({ name: reapHookName, command, global: true, append: true });
    return "created";
  }

  let outcome: ReapHookOutcome = "unchanged";

  if (existing.command !== command) {
    await options.tmux.setHook({ name: hookTarget(existing), command, global: true });
    outcome = "updated";
  }
  // Earlier versions, or a hand-edited server, can leave more than one of ours.
  for (const duplicate of [...duplicates].reverse()) {
    await options.tmux.unsetHook({ name: hookTarget(duplicate), global: true });
    outcome = "updated";
  }

  return outcome;
}

function hookTarget(entry: HookEntry): string {
  return entry.index === undefined ? entry.name : `${entry.name}[${entry.index}]`;
}

/**
 * The path is read by two parsers: tmux, which expands `#{...}` and backslash
 * escapes inside double quotes, and then `sh`. Quoting characters would have to
 * survive both, so they are rejected instead of escaped twice.
 */
function shellQuote(value: string, label: string): string {
  if (value.trim().length === 0) {
    throw new Error(`${label} must not be empty`);
  }
  if (!isAbsolute(value)) {
    throw new Error(`${label} must be absolute: ${value}`);
  }
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters break both parsers
  if (/['"\\#\n\r\t\u0000-\u001f]/.test(value)) {
    throw new Error(`${label} contains characters a tmux hook cannot carry: ${value}`);
  }
  return `'${value}'`;
}

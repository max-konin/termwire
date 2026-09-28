import { expect, mock, test } from "bun:test";
import type { HookEntry } from "@termwire/tmux";
import {
  createReapHookCommand,
  ensureReapHook,
  type ReapHookTmux,
  reapHookMarker,
} from "./reap-hook.js";

const paths = { execPath: "/usr/local/bin/node", scriptPath: "/opt/termwire/bin/termwire.js" };
const command = createReapHookCommand(paths);

function createTmux(entries: HookEntry[]): {
  tmux: ReapHookTmux;
  setHook: ReturnType<typeof mock<ReapHookTmux["setHook"]>>;
  unsetHook: ReturnType<typeof mock<ReapHookTmux["unsetHook"]>>;
} {
  const setHook = mock<ReapHookTmux["setHook"]>().mockResolvedValue();
  const unsetHook = mock<ReapHookTmux["unsetHook"]>().mockResolvedValue();
  const showHooks = mock<ReapHookTmux["showHooks"]>().mockResolvedValue(entries);
  return { tmux: { showHooks, setHook, unsetHook }, setHook, unsetHook };
}

test("builds a hook that names absolute paths and defers the session name to tmux", () => {
  expect(command).toBe(
    `run-shell "${reapHookMarker} '/usr/local/bin/node' '/opt/termwire/bin/termwire.js' _reap #{q:hook_session_name} >/dev/null 2>&1 &"`,
  );
});

test("leaves the session name unquoted so the tmux q modifier escapes it", () => {
  // The hook is global and fires for sessions Termwire never named. Quoting
  // `#{q:...}` would disarm the escaping: a session called `x'; rm -rf ~; '`
  // would close the quote and run as a command.
  expect(command).toContain(" _reap #{q:hook_session_name} ");
  expect(command).not.toContain("'#{");
});

test("runs the reap in the foreground so closing the last session still fires it", () => {
  // `run-shell -b` is skipped during server shutdown; the detached child is what
  // keeps the closing client from waiting for the reap.
  expect(command.startsWith('run-shell "')).toBe(true);
  expect(command.endsWith(' >/dev/null 2>&1 &"')).toBe(true);
});

test.each([
  ["a relative path", { execPath: "node", scriptPath: "/opt/termwire.js" }, "must be absolute"],
  ["an empty path", { execPath: " ", scriptPath: "/opt/termwire.js" }, "must not be empty"],
  ["a quote", { execPath: "/opt/node", scriptPath: "/opt/it's/termwire.js" }, "cannot carry"],
  [
    "a format marker",
    { execPath: "/opt/node", scriptPath: "/opt/#{x}/termwire.js" },
    "cannot carry",
  ],
])("rejects %s", (_label, candidate, message) => {
  expect(() => createReapHookCommand(candidate)).toThrow(message);
});

test("appends the hook when the server has none of ours", async () => {
  const { tmux, setHook, unsetHook } = createTmux([
    { name: "session-closed", index: 0, command: 'run-shell "notify-send closed"' },
    { name: "client-attached", command: "set-option status on" },
  ]);

  expect(await ensureReapHook({ tmux, ...paths })).toBe("created");
  expect(setHook).toHaveBeenCalledWith({
    name: "session-closed",
    command,
    global: true,
    append: true,
  });
  expect(unsetHook).not.toHaveBeenCalled();
});

test("leaves an identical hook alone, so repeated up calls do not multiply hooks", async () => {
  const { tmux, setHook, unsetHook } = createTmux([
    { name: "session-closed", index: 0, command: 'run-shell "notify-send closed"' },
    { name: "session-closed", index: 1, command },
  ]);

  expect(await ensureReapHook({ tmux, ...paths })).toBe("unchanged");
  expect(setHook).not.toHaveBeenCalled();
  expect(unsetHook).not.toHaveBeenCalled();
});

test("replaces our hook in place when the interpreter or script path moved", async () => {
  const stale = createReapHookCommand({
    execPath: "/old/bin/node",
    scriptPath: "/old/termwire.js",
  });
  const { tmux, setHook, unsetHook } = createTmux([
    { name: "session-closed", index: 0, command: 'run-shell "notify-send closed"' },
    { name: "session-closed", index: 1, command: stale },
  ]);

  expect(await ensureReapHook({ tmux, ...paths })).toBe("updated");
  expect(setHook).toHaveBeenCalledWith({ name: "session-closed[1]", command, global: true });
  expect(unsetHook).not.toHaveBeenCalled();
});

test("drops duplicates of ours from the highest index down and keeps the first", async () => {
  const { tmux, setHook, unsetHook } = createTmux([
    { name: "session-closed", index: 0, command },
    { name: "session-closed", index: 1, command },
    { name: "session-closed", index: 2, command },
  ]);

  expect(await ensureReapHook({ tmux, ...paths })).toBe("updated");
  expect(setHook).not.toHaveBeenCalled();
  expect(unsetHook.mock.calls).toEqual([
    [{ name: "session-closed[2]", global: true }],
    [{ name: "session-closed[1]", global: true }],
  ]);
});

test("replaces our hook stored without an index by plain name", async () => {
  const stale = createReapHookCommand({ execPath: "/old/bin/node", scriptPath: "/old/tw.js" });
  const { tmux, setHook } = createTmux([{ name: "session-closed", command: stale }]);

  expect(await ensureReapHook({ tmux, ...paths })).toBe("updated");
  expect(setHook).toHaveBeenCalledWith({ name: "session-closed", command, global: true });
});

test("reads only global hooks", async () => {
  const { tmux } = createTmux([]);

  await ensureReapHook({ tmux, ...paths });

  expect(tmux.showHooks).toHaveBeenCalledWith({ global: true });
});

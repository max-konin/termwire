import { expect, test } from "bun:test";
import { configV1Schema } from "./config-schema";

test.each([
  ["version-only config", { version: 1 }],
  ["config with schema marker", { version: 1, $schema: "termwire-layout" }],
])("accepts a valid %s", (_caseName, value) => {
  expect(configV1Schema.safeParse(value).success).toBe(true);
});

test.each([
  ["unknown root key", { version: 1, extra: true }],
  ["non-literal version", { version: 2 }],
  ["empty schema marker", { version: 1, $schema: "" }],
  ["empty windows", { version: 1, windows: [] }],
  ["non-object window", { version: 1, windows: [null] }],
  ["unknown window key", { version: 1, windows: [{ name: "editor", panes: [], extra: true }] }],
  ["missing window name", { version: 1, windows: [{ panes: [] }] }],
  ["empty window name", { version: 1, windows: [{ name: "", panes: [] }] }],
  ["missing panes", { version: 1, windows: [{ name: "editor" }] }],
  ["empty panes", { version: 1, windows: [{ name: "editor", panes: [] }] }],
  ["non-object pane", { version: 1, windows: [{ name: "editor", panes: [null] }] }],
  [
    "unknown pane key",
    { version: 1, windows: [{ name: "editor", panes: [{ id: "editor", extra: true }] }] },
  ],
  ["missing pane id", { version: 1, windows: [{ name: "editor", panes: [{}] }] }],
  ["empty pane id", { version: 1, windows: [{ name: "editor", panes: [{ id: "" }] }] }],
  [
    "empty command",
    { version: 1, windows: [{ name: "editor", panes: [{ id: "shell", command: [] }] }] },
  ],
  [
    "non-string command element",
    { version: 1, windows: [{ name: "editor", panes: [{ id: "shell", command: [1] }] }] },
  ],
  [
    "invalid role",
    { version: 1, windows: [{ name: "editor", panes: [{ id: "shell", role: "shell" }] }] },
  ],
  [
    "invalid direction",
    { version: 1, windows: [{ name: "editor", panes: [{ id: "shell", direction: "diagonal" }] }] },
  ],
  [
    "fractional percent",
    { version: 1, windows: [{ name: "editor", panes: [{ id: "shell", sizePercent: 1.5 }] }] },
  ],
  [
    "low percent",
    { version: 1, windows: [{ name: "editor", panes: [{ id: "shell", sizePercent: 0 }] }] },
  ],
  [
    "high percent",
    { version: 1, windows: [{ name: "editor", panes: [{ id: "shell", sizePercent: 100 }] }] },
  ],
])("rejects an invalid config with %s", (_caseName, value) => {
  expect(configV1Schema.safeParse(value).success).toBe(false);
});

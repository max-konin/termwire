import { expect, test } from "bun:test";
import type { LayoutConfig } from "./config-schema";
import { resolveLayout } from "./config-validation";

const globalWindows: LayoutConfig["windows"] = [
  { name: "global", panes: [{ id: "editor", role: "editor" }] },
];
const projectWindows: LayoutConfig["windows"] = [
  { name: "project", panes: [{ id: "editor", role: "editor" }] },
];
const defaultLayout: LayoutConfig = {
  windows: [
    { name: "editor", panes: [{ id: "editor", role: "editor" }] },
    { name: "shell", panes: [{ id: "shell" }] },
  ],
};

test.each([
  ["non-object root", null, "$"],
  ["missing version", {}, "$.version"],
  ["unsupported version", { version: 2 }, "$.version"],
  ["unknown root key", { version: 1, extra: true }, "$.extra"],
])("rejects root config with %s", (_caseName, value, path) => {
  expect(() => resolveLayout({ source: "/repo/.termwire.jsonc", value })).toThrow(
    `/repo/.termwire.jsonc: ${path}`,
  );
});

test.each([["schema marker", { version: 1, $schema: "termwire-layout" }]])(
  "accepts a config with %s",
  (_caseName, value) => {
    expect(resolveLayout({ source: "/repo/.termwire.jsonc", value })).toEqual(defaultLayout);
  },
);

test.each([
  ["empty windows", { version: 1, windows: [] }, "$.windows"],
  ["non-object window", { version: 1, windows: [null] }, "$.windows[0]"],
  [
    "missing window name",
    { version: 1, windows: [{ panes: [{ id: "pane" }] }] },
    "$.windows[0].name",
  ],
  ["missing window panes", { version: 1, windows: [{ name: "window" }] }, "$.windows[0].panes"],
  [
    "empty window name",
    { version: 1, windows: [{ name: "", panes: [{ id: "pane" }] }] },
    "$.windows[0].name",
  ],
  [
    "non-string window name",
    { version: 1, windows: [{ name: 1, panes: [{ id: "pane" }] }] },
    "$.windows[0].name",
  ],
  [
    "unknown window key",
    { version: 1, windows: [{ name: "editor", panes: [{ id: "pane" }], extra: true }] },
    "$.windows[0].extra",
  ],
  [
    "duplicate window name",
    {
      version: 1,
      windows: [
        { name: "editor", panes: [{ id: "first" }] },
        { name: "editor", panes: [{ id: "second" }] },
      ],
    },
    "$.windows[1].name",
  ],
])("rejects window config with %s", (_caseName, value, path) => {
  expect(() => resolveLayout({ source: "/repo/.termwire.jsonc", value })).toThrow(
    `/repo/.termwire.jsonc: ${path}`,
  );
});

test.each([
  ["empty panes", [], "$.windows[0].panes"],
  ["non-object pane", [null], "$.windows[0].panes[0]"],
  ["missing pane id", [{}], "$.windows[0].panes[0].id"],
  ["empty pane id", [{ id: "" }], "$.windows[0].panes[0].id"],
  ["duplicate pane id", [{ id: "shell" }, { id: "shell" }], "$.windows[0].panes[1].id"],
  ["unknown pane key", [{ id: "shell", extra: true }], "$.windows[0].panes[0].extra"],
  ["empty command argv", [{ id: "shell", command: [] }], "$.windows[0].panes[0].command"],
  [
    "non-string command argument",
    [{ id: "shell", command: [1] }],
    "$.windows[0].panes[0].command[0]",
  ],
  ["empty command argument", [{ id: "shell", command: [""] }], "$.windows[0].panes[0].command[0]"],
])("rejects pane config with %s", (_caseName, panes, path) => {
  expect(() =>
    resolveLayout({
      source: "/repo/.termwire.jsonc",
      value: { version: 1, windows: [{ name: "shell", panes }] },
    }),
  ).toThrow(`/repo/.termwire.jsonc: ${path}`);
});

test.each([
  [
    "split fields on first pane",
    [{ name: "editor", panes: [{ id: "editor", splitFrom: "shell" }] }],
    "$.windows[0].panes[0].splitFrom",
  ],
  [
    "missing later split fields",
    [{ name: "editor", panes: [{ id: "editor" }, { id: "shell" }] }],
    "$.windows[0].panes[1].splitFrom",
  ],
  [
    "forward split target",
    [
      {
        name: "editor",
        panes: [
          { id: "editor" },
          { id: "shell", splitFrom: "later", direction: "horizontal" },
          { id: "later", splitFrom: "editor", direction: "horizontal" },
        ],
      },
    ],
    "$.windows[0].panes[1].splitFrom",
  ],
  [
    "cross-window split target",
    [
      { name: "editor", panes: [{ id: "editor" }] },
      {
        name: "shell",
        panes: [{ id: "shell" }, { id: "child", splitFrom: "editor", direction: "horizontal" }],
      },
    ],
    "$.windows[1].panes[1].splitFrom",
  ],
  [
    "invalid split direction",
    [
      {
        name: "editor",
        panes: [{ id: "editor" }, { id: "shell", splitFrom: "editor", direction: "diagonal" }],
      },
    ],
    "$.windows[0].panes[1].direction",
  ],
  [
    "size percent below range",
    [
      {
        name: "editor",
        panes: [
          { id: "editor" },
          { id: "shell", splitFrom: "editor", direction: "horizontal", sizePercent: 0 },
        ],
      },
    ],
    "$.windows[0].panes[1].sizePercent",
  ],
  [
    "fractional size percent",
    [
      {
        name: "editor",
        panes: [
          { id: "editor" },
          { id: "shell", splitFrom: "editor", direction: "horizontal", sizePercent: 1.5 },
        ],
      },
    ],
    "$.windows[0].panes[1].sizePercent",
  ],
  [
    "size percent above range",
    [
      {
        name: "editor",
        panes: [
          { id: "editor" },
          { id: "shell", splitFrom: "editor", direction: "horizontal", sizePercent: 100 },
        ],
      },
    ],
    "$.windows[0].panes[1].sizePercent",
  ],
])("rejects split config with %s", (_caseName, windows, path) => {
  expect(() =>
    resolveLayout({ source: "/repo/.termwire.jsonc", value: { version: 1, windows } }),
  ).toThrow(`/repo/.termwire.jsonc: ${path}`);
});

test.each([
  ["no editor", [{ name: "shell", panes: [{ id: "shell" }] }], "$.windows"],
  [
    "two editors",
    [
      { name: "editor", panes: [{ id: "editor", role: "editor" }] },
      { name: "other", panes: [{ id: "other", role: "editor" }] },
    ],
    "$.windows[1].panes[0].role",
  ],
  [
    "unrecognized role",
    [{ name: "editor", panes: [{ id: "editor", role: "shell" }] }],
    "$.windows[0].panes[0].role",
  ],
  [
    "editor command",
    [{ name: "editor", panes: [{ id: "editor", role: "editor", command: ["nvim"] }] }],
    "$.windows[0].panes[0].command",
  ],
])("rejects editor config with %s", (_caseName, windows, path) => {
  expect(() =>
    resolveLayout({ source: "/repo/.termwire.jsonc", value: { version: 1, windows } }),
  ).toThrow(`/repo/.termwire.jsonc: ${path}`);
});

test.each([
  [
    "project windows replace global windows",
    { source: "/global/config.jsonc", value: { version: 1, windows: globalWindows } },
    { source: "/repo/.termwire.jsonc", value: { version: 1, windows: projectWindows } },
    { windows: projectWindows },
  ],
  [
    "version-only project falls through to global windows",
    { source: "/global/config.jsonc", value: { version: 1, windows: globalWindows } },
    { source: "/repo/.termwire.jsonc", value: { version: 1 } },
    { windows: globalWindows },
  ],
  [
    "version-only global defaults without project config",
    { source: "/global/config.jsonc", value: { version: 1 } },
    undefined,
    defaultLayout,
  ],
  [
    "version-only files default",
    { source: "/global/config.jsonc", value: { version: 1 } },
    { source: "/repo/.termwire.jsonc", value: { version: 1 } },
    defaultLayout,
  ],
  [
    "schema-only global defaults without project config",
    { source: "/global/config.jsonc", value: { version: 1, $schema: "termwire-layout" } },
    undefined,
    defaultLayout,
  ],
  [
    "schema-only project falls through to global windows",
    { source: "/global/config.jsonc", value: { version: 1, windows: globalWindows } },
    { source: "/repo/.termwire.jsonc", value: { version: 1, $schema: "termwire-layout" } },
    { windows: globalWindows },
  ],
])("resolves layout when %s", (_caseName, globalConfig, projectConfig, expected) => {
  expect(resolveLayout(globalConfig, projectConfig)).toEqual(expected);
});

test.each([["returned pane command"]])("does not leak mutations through %s", (_caseName) => {
  const sourceConfig: { source: string; value: unknown } = {
    source: "/repo/.termwire.jsonc",
    value: {
      version: 1,
      windows: [
        {
          name: "editor",
          panes: [
            { id: "editor", role: "editor" },
            { id: "shell", splitFrom: "editor", direction: "horizontal", command: ["zsh"] },
          ],
        },
      ],
    },
  };
  const expected: LayoutConfig = {
    windows: [
      {
        name: "editor",
        panes: [
          { id: "editor", role: "editor" },
          { id: "shell", splitFrom: "editor", direction: "horizontal", command: ["zsh"] },
        ],
      },
    ],
  };

  const resolved = resolveLayout(sourceConfig);
  (resolved.windows[0].panes[1].command as string[]).push("--login");

  expect(sourceConfig.value).toEqual({ version: 1, ...expected });
  expect(resolveLayout(sourceConfig)).toEqual(expected);
});

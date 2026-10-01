export const layoutTemplateIds = ["default", "three-window", "focused", "full-stack"] as const;

export type LayoutTemplateId = (typeof layoutTemplateIds)[number];

export interface LayoutTemplate {
  id: LayoutTemplateId;
  title: string;
  hint: string;
  /** Box drawing of the windows and panes, one line per row, all the same width. */
  preview: readonly string[];
  contents: string;
}

const header = `// Termwire layout, written by \`termwire install\`.
// Pane commands are examples; edit them for your project.
`;

const definitions: readonly LayoutTemplate[] = [
  {
    id: "default",
    title: "Editor and shell",
    hint: "the built-in two-window layout",
    preview: [
      "editor",
      "┌────────────────┐",
      "│ nvim           │",
      "└────────────────┘",
      "shell",
      "┌────────────────┐",
      "│ $              │",
      "└────────────────┘",
    ],
    contents: `${header}{
  "version": 1,
  "windows": [
    {
      "name": "editor",
      "panes": [{ "id": "editor", "role": "editor" }],
    },
    {
      "name": "shell",
      "panes": [{ "id": "shell" }],
    },
  ],
}
`,
  },
  {
    id: "three-window",
    title: "Three windows",
    hint: "editor, a shell for an agent, and a plain shell",
    preview: [
      "editor",
      "┌────────────────┐",
      "│ nvim           │",
      "└────────────────┘",
      "ai",
      "┌────────────────┐",
      "│ $              │",
      "└────────────────┘",
      "shell",
      "┌────────────────┐",
      "│ $              │",
      "└────────────────┘",
    ],
    contents: `${header}{
  "version": 1,
  "windows": [
    {
      "name": "editor",
      "panes": [{ "id": "editor", "role": "editor" }],
    },
    {
      "name": "ai",
      "panes": [{ "id": "ai" }],
    },
    {
      "name": "shell",
      "panes": [{ "id": "shell" }],
    },
  ],
}
`,
  },
  {
    id: "focused",
    title: "Focused coding",
    hint: "one window: editor, OpenCode, and watched tests side by side",
    preview: [
      "work",
      "┌─────────┬──────┐",
      "│ nvim    │ ai   │",
      "│         ├──────┤",
      "│         │ test │",
      "└─────────┴──────┘",
      "         right side: 40%",
    ],
    contents: `${header}{
  "version": 1,
  "windows": [
    {
      "name": "work",
      "panes": [
        { "id": "editor", "role": "editor" },
        {
          "id": "ai",
          "splitFrom": "editor",
          "direction": "horizontal",
          "sizePercent": 40,
          "command": ["opencode"],
        },
        {
          "id": "tests",
          "splitFrom": "ai",
          "direction": "vertical",
          "sizePercent": 40,
          "command": ["bun", "test", "--watch"],
        },
      ],
    },
  ],
}
`,
  },
  {
    id: "full-stack",
    title: "Full stack",
    hint: "code with watched tests, a dev server window, and a spare shell",
    preview: [
      "code",
      "┌────────────────┐",
      "│ nvim           │",
      "├────────────────┤",
      "│ tests    (35%) │",
      "└────────────────┘",
      "server",
      "┌────────────────┐",
      "│ dev server     │",
      "└────────────────┘",
      "shell",
      "┌────────────────┐",
      "│ $              │",
      "└────────────────┘",
    ],
    contents: `${header}{
  "version": 1,
  "windows": [
    {
      "name": "code",
      "panes": [
        { "id": "editor", "role": "editor" },
        {
          "id": "tests",
          "splitFrom": "editor",
          "direction": "vertical",
          "sizePercent": 35,
          "command": ["bun", "test", "--watch"],
        },
      ],
    },
    {
      "name": "server",
      "panes": [{ "id": "server", "command": ["bun", "run", "dev"] }],
    },
    {
      "name": "shell",
      "panes": [{ "id": "shell" }],
    },
  ],
}
`,
  },
];

/** Copies, so a caller can never mutate the registry other callers read. */
export function layoutTemplates(): LayoutTemplate[] {
  return definitions.map((template) => ({ ...template }));
}

export function findLayoutTemplate(id: string): LayoutTemplate | undefined {
  const template = definitions.find((candidate) => candidate.id === id);
  return template === undefined ? undefined : { ...template };
}

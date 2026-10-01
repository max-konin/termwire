import { describe, expect, test } from "bun:test";
import { type PreviewChoice, renderChoices } from "./layout-preview.js";
import { layoutTemplates } from "./templates.js";

const gutter = "   ";

/** Padding is computed, not counted by hand, so a label change cannot break these. */
function sideBySide(left: readonly string[], art: readonly string[]): string {
  const width = Math.max(...left.map((line) => line.length));
  return left
    .map((line, index) => {
      const row = art[index];
      return row === undefined ? line : `${line.padEnd(width)}${gutter}${row}`;
    })
    .join("\n");
}

const choices: PreviewChoice[] = [
  { label: "One", hint: "first", preview: ["┌───┐", "│ a │", "└───┘"] },
  { label: "Two", hint: "second", preview: ["┌─────┐", "│ bbb │", "└─────┘"] },
  { label: "Skip", preview: [] },
];

describe("renderChoices", () => {
  test("draws the highlighted choice's layout beside the list", () => {
    expect(renderChoices({ choices, cursor: 0, columns: 80 })).toBe(
      `${sideBySide(["● One", "○ Two", "○ Skip"], ["┌───┐", "│ a │", "└───┘"])}\n  first`,
    );
  });

  test("keeps the hint under the list, so a sentence cannot push the drawing away", () => {
    const wordy: PreviewChoice[] = [
      {
        label: "One",
        hint: "a hint long enough to outgrow any sane terminal column",
        preview: ["┌─┐"],
      },
    ];

    const rows = renderChoices({ choices: wordy, cursor: 0, columns: 40 }).split("\n");

    expect(rows[0]).toBe("● One   ┌─┐");
    expect(rows.at(-1)).toContain("outgrow any sane terminal");
  });

  test("swaps the drawing when the cursor moves", () => {
    expect(renderChoices({ choices, cursor: 1, columns: 80 })).toBe(
      `${sideBySide(["○ One", "● Two", "○ Skip"], ["┌─────┐", "│ bbb │", "└─────┘"])}\n  second`,
    );
  });

  test("shows only the list for a choice without a drawing", () => {
    expect(renderChoices({ choices, cursor: 2, columns: 80 })).toBe(
      ["○ One", "○ Two", "● Skip"].join("\n"),
    );
  });

  test("stacks under the list when two columns will not fit", () => {
    expect(renderChoices({ choices, cursor: 0, columns: 10 })).toBe(
      ["● One", "○ Two", "○ Skip", "", "┌───┐", "│ a │", "└───┘", "  first"].join("\n"),
    );
  });

  test("keeps drawing rows that outlast the list", () => {
    const tall: PreviewChoice[] = [{ label: "One", preview: ["a", "b", "c", "d"] }];

    expect(renderChoices({ choices: tall, cursor: 0, columns: 40 })).toBe(
      sideBySide(["● One", "", "", ""], ["a", "b", "c", "d"]),
    );
  });

  test("never leaves a padded line dangling in whitespace", () => {
    const rows = renderChoices({ choices, cursor: 0, columns: 80 }).split("\n");

    for (const row of rows) {
      expect(row).toBe(row.trimEnd());
    }
  });

  test.each([-3, 7])("clamps an out-of-range cursor (%p)", (cursor) => {
    expect(() => renderChoices({ choices, cursor, columns: 80 })).not.toThrow();
  });
});

describe("template previews", () => {
  test.each(layoutTemplates().map((template) => [template.id, template] as const))(
    "%s draws every window it configures",
    (_id, template) => {
      const art = template.preview.join("\n");
      const windows = [...template.contents.matchAll(/"name":\s*"([^"]+)"/g)].map(
        (match) => match[1],
      );

      expect(windows.length).toBeGreaterThan(0);
      for (const window of windows) {
        expect(art).toContain(window);
      }
    },
  );

  test.each(layoutTemplates().map((template) => [template.id, template] as const))(
    "%s keeps its box rows the same width",
    (_id, template) => {
      const boxRows = template.preview.filter((line) => /[┌│└├┬┴]/.test(line));
      const widths = new Set(boxRows.map((line) => line.length));

      expect(boxRows.length).toBeGreaterThan(0);
      expect(widths.size).toBe(1);
    },
  );
});

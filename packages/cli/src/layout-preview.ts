export interface PreviewChoice {
  label: string;
  hint?: string;
  preview: readonly string[];
}

export interface RenderChoicesOptions {
  choices: readonly PreviewChoice[];
  /** Index of the highlighted choice, whose preview is the one drawn. */
  cursor: number;
  /** Terminal width; below what the two columns need, the preview goes underneath. */
  columns: number;
}

const gutter = "   ";
const activeMarker = "●";
const inactiveMarker = "○";

/**
 * Draws the choices with the highlighted one's window layout beside them, so moving
 * through the list shows what each template would create. The hint goes underneath
 * rather than after the label, because a sentence in the left column pushes the
 * drawing off a normal terminal. Too narrow for two columns and the drawing stacks
 * under the list instead of wrapping the boxes into nonsense.
 */
export function renderChoices({ choices, cursor, columns }: RenderChoicesOptions): string {
  const selected = Math.min(Math.max(cursor, 0), Math.max(choices.length - 1, 0));
  const left = choices.map(
    (choice, index) => `${index === selected ? activeMarker : inactiveMarker} ${choice.label}`,
  );
  const active = choices[selected];
  const hint = active?.hint === undefined ? [] : [`  ${active.hint}`];
  const preview = active?.preview ?? [];

  if (preview.length === 0) return [...left, ...hint].join("\n");

  const leftWidth = widestOf(left);
  const previewWidth = widestOf(preview);

  if (leftWidth + gutter.length + previewWidth > columns) {
    return [...left, "", ...preview, ...hint].join("\n");
  }

  const height = Math.max(left.length, preview.length);
  const rows: string[] = [];
  for (let index = 0; index < height; index += 1) {
    const text = left[index] ?? "";
    const art = preview[index] ?? "";
    rows.push(art.length === 0 ? text : `${pad(text, leftWidth)}${gutter}${art}`);
  }

  return [...rows, ...hint].join("\n");
}

function widestOf(lines: readonly string[]): number {
  return lines.reduce((widest, line) => Math.max(widest, line.length), 0);
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

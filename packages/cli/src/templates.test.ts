import { describe, expect, test } from "bun:test";
import { type ParseError, parse } from "jsonc-parser";
import { configV1Schema } from "./config-schema.js";
import { findLayoutTemplate, layoutTemplateIds, layoutTemplates } from "./templates.js";

describe("layoutTemplates", () => {
  test("offers every declared id exactly once", () => {
    expect(layoutTemplates().map((template) => template.id)).toEqual([...layoutTemplateIds]);
  });

  test.each([...layoutTemplateIds])("%s parses as JSONC and satisfies the config schema", (id) => {
    const template = findLayoutTemplate(id);
    if (template === undefined) throw new Error(`missing template: ${id}`);

    const errors: ParseError[] = [];
    const value = parse(template.contents, errors, {
      allowTrailingComma: true,
      disallowComments: false,
    });

    expect(errors).toEqual([]);
    expect(configV1Schema.parse(value)).toMatchObject({ version: 1 });
  });

  test.each([...layoutTemplateIds])("%s keeps its comments for the reader", (id) => {
    expect(findLayoutTemplate(id)?.contents).toContain("// Termwire layout");
  });

  test("declares exactly one editor pane per template", () => {
    for (const template of layoutTemplates()) {
      const config = configV1Schema.parse(
        parse(template.contents, [], { allowTrailingComma: true, disallowComments: false }),
      );
      const editors = (config.windows ?? []).flatMap((window) =>
        window.panes.filter((pane) => pane.role === "editor"),
      );
      expect(editors).toHaveLength(1);
    }
  });

  test("hands out copies, so one caller cannot edit what the next one reads", () => {
    const first = layoutTemplates()[0];
    if (first === undefined) throw new Error("expected a template");
    first.title = "mutated";

    expect(layoutTemplates()[0]?.title).not.toBe("mutated");
  });

  test("returns undefined for an unknown id", () => {
    expect(findLayoutTemplate("nope")).toBeUndefined();
  });
});

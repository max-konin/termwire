import { expect, mock, test } from "bun:test";
import { createTermwireOpenTool } from "./tool";

function safeParseSuccess(schema: unknown, value: unknown): boolean {
  return (schema as { safeParse(value: unknown): { success: boolean } }).safeParse(value).success;
}

test("requires a path and accepts only a positive integer line", () => {
  const definition = createTermwireOpenTool(mock(async () => ({ path: "/x" })));
  expect(safeParseSuccess(definition.args.path, "   ")).toBe(false);
  expect(safeParseSuccess(definition.args.path, " src/app.ts ")).toBe(true);
  expect(safeParseSuccess(definition.args.line, undefined)).toBe(true);
  expect(safeParseSuccess(definition.args.line, 42)).toBe(true);
  expect(safeParseSuccess(definition.args.line, 0)).toBe(false);
  expect(safeParseSuccess(definition.args.line, 1.5)).toBe(false);
});

test("uses the tool-call directory and returns structured output", async () => {
  const openFile = mock(async () => ({
    path: "/workspace/project/src/app.ts",
    line: 42,
  }));
  const definition = createTermwireOpenTool(openFile);
  const result = await definition.execute({ path: "src/app.ts", line: 42 }, {
    directory: "/workspace/project",
  } as never);
  expect(openFile).toHaveBeenCalledWith({
    directory: "/workspace/project",
    path: "src/app.ts",
    line: 42,
  });
  expect(result).toEqual({
    title: "Open file",
    output: "Opened /workspace/project/src/app.ts at line 42",
    metadata: { path: "/workspace/project/src/app.ts", line: 42 },
  });
});

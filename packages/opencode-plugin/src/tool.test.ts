import { expect, mock, test } from "bun:test";
import { createOpenbridgeOpenTool } from "./tool";

test("requires a path and accepts only a positive integer line", () => {
  const definition = createOpenbridgeOpenTool(mock(async () => ({ path: "/x" })));
  expect(definition.args.path.safeParse("   ").success).toBe(false);
  expect(definition.args.path.safeParse(" src/app.ts ").success).toBe(true);
  expect(definition.args.line.safeParse(undefined).success).toBe(true);
  expect(definition.args.line.safeParse(42).success).toBe(true);
  expect(definition.args.line.safeParse(0).success).toBe(false);
  expect(definition.args.line.safeParse(1.5).success).toBe(false);
});

test("uses the tool-call directory and returns structured output", async () => {
  const openFile = mock(async () => ({
    path: "/workspace/project/src/app.ts",
    line: 42,
  }));
  const definition = createOpenbridgeOpenTool(openFile);
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

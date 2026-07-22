import { expect, mock, test } from "bun:test";
import {
  createTermwireOpenToolHandler,
  termwireOpenInputSchema,
  termwireOpenOutputSchema,
} from "./tool";

test("validates and trims input", () => {
  expect(termwireOpenInputSchema.safeParse({ path: "   " }).success).toBe(false);
  expect(termwireOpenInputSchema.parse({ path: " src/app.ts ", line: 42 })).toEqual({
    path: "src/app.ts",
    line: 42,
  });
  expect(termwireOpenInputSchema.safeParse({ path: "x", line: 0 }).success).toBe(false);
  expect(termwireOpenInputSchema.safeParse({ path: "x", line: 1.5 }).success).toBe(false);
  expect(termwireOpenOutputSchema.safeParse({ path: "/x", line: null }).success).toBe(true);
});

test("returns text and structured success content", async () => {
  const openFile = mock(async () => ({ path: "/workspace/src/app.ts", line: 42 }));
  const execute = createTermwireOpenToolHandler(openFile);

  await expect(execute({ path: "src/app.ts", line: 42 })).resolves.toEqual({
    content: [{ type: "text", text: "Opened /workspace/src/app.ts at line 42" }],
    structuredContent: { path: "/workspace/src/app.ts", line: 42 },
  });

  expect(openFile).toHaveBeenCalledWith({ path: "src/app.ts", line: 42 });
});

test.each([
  [new Error("nvim unavailable"), "nvim unavailable"],
  ["tmux unavailable", "tmux unavailable"],
])("returns an MCP error result without hiding %s", async (error, message) => {
  const execute = createTermwireOpenToolHandler(
    mock(async () => {
      throw error;
    }),
  );

  await expect(execute({ path: "README.md" })).resolves.toEqual({
    content: [{ type: "text", text: message }],
    isError: true,
  });
});

test("uses null structured content when line is omitted", async () => {
  const execute = createTermwireOpenToolHandler(
    mock(async () => ({ path: "/workspace/README.md" })),
  );

  await expect(execute({ path: "README.md" })).resolves.toEqual({
    content: [{ type: "text", text: "Opened /workspace/README.md" }],
    structuredContent: { path: "/workspace/README.md", line: null },
  });
});

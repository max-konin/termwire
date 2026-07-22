import { z } from "zod";
import type { OpenFileHandler } from "./open";

export const termwireOpenInputSchema = z.object({
  path: z.string().trim().min(1),
  line: z.number().int().positive().optional(),
});

export const termwireOpenOutputSchema = z.object({
  path: z.string(),
  line: z.number().nullable(),
});

export function createTermwireOpenToolHandler(openFile: OpenFileHandler) {
  return async ({ path, line }: z.infer<typeof termwireOpenInputSchema>) => {
    try {
      const result = await openFile({ path, line });
      const suffix = result.line === undefined ? "" : ` at line ${result.line}`;

      return {
        content: [{ type: "text" as const, text: `Opened ${result.path}${suffix}` }],
        structuredContent: { path: result.path, line: result.line ?? null },
      };
    } catch (error) {
      return {
        content: [
          { type: "text" as const, text: error instanceof Error ? error.message : String(error) },
        ],
        isError: true as const,
      };
    }
  };
}

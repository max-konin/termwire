import { z } from "zod";

export const paneSchema = z.strictObject({
  id: z.string().min(1),
  role: z.literal("editor").optional(),
  command: z.array(z.string().min(1)).min(1).optional(),
  splitFrom: z.string().optional(),
  direction: z.enum(["horizontal", "vertical"]).optional(),
  sizePercent: z.number().int().min(1).max(99).optional(),
});

export const windowSchema = z.strictObject({
  name: z.string().min(1),
  panes: z.array(paneSchema).min(1),
});

export const configV1Schema = z.strictObject({
  version: z.literal(1),
  $schema: z.string().min(1).optional(),
  windows: z.array(windowSchema).min(1).optional(),
});

export type PaneConfig = z.infer<typeof paneSchema>;
export type WindowConfig = z.infer<typeof windowSchema>;
export type ConfigV1 = z.infer<typeof configV1Schema>;
export type LayoutConfig = { windows: NonNullable<ConfigV1["windows"]> };

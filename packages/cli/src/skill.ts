import { fileURLToPath } from "node:url";
import { skillName } from "./agents.js";

/**
 * Marks a skill file as ours to replace. Without it we cannot tell our own older text
 * from something the user rewrote, and an upgrade would quietly eat their edits. Deleting
 * the line is how a user says "leave this file alone".
 */
export const skillMarker =
  "<!-- managed by `termwire install`; delete this line to keep your own version -->";

/**
 * The skill lives as Markdown in the package rather than as a string in the source: it is
 * editable, reviewable in a diff, and readable by anyone who wants to know what their agent
 * was told. `dist/skill.js` and `src/skill.ts` both sit one level below the package root, so
 * the same specifier resolves in a published install and from a checkout.
 */
export function skillSourcePath(): string {
  return fileURLToPath(new URL(`../skills/${skillName}/SKILL.md`, import.meta.url));
}

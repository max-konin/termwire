import { SelectPrompt } from "@clack/core";
import { cancel, confirm, intro, isCancel, log, multiselect, outro } from "@clack/prompts";
import type { AgentId } from "./agents.js";
import { type InstallLayoutChoice, type InstallPrompter, noLayout } from "./install.js";
import { renderChoices } from "./layout-preview.js";

/**
 * The only module that talks to a terminal UI. Everything it returns is plain data,
 * so `install` stays testable with a scripted prompter and no rendering.
 */
export interface ClackPrompterOptions {
  /** Terminal width, which decides whether the drawing fits beside the list. */
  columns: number;
}

export function createClackPrompter({ columns }: ClackPrompterOptions): InstallPrompter {
  return {
    async layout({ templates, path, exists }) {
      intro("termwire install");
      if (exists) {
        log.info(`${path} already exists; you will be asked before it is replaced.`);
      }

      const choices = [
        ...templates.map((template) => ({
          value: template.id as InstallLayoutChoice,
          label: template.title,
          hint: template.hint,
          preview: template.preview,
        })),
        {
          value: noLayout as InstallLayoutChoice,
          label: "Skip",
          hint: "leave the configuration alone",
          preview: [] as readonly string[],
        },
      ];
      const message = exists ? `Layout to write to ${path}` : `Layout for ${path}`;

      // `select` from @clack/prompts renders one line per option; drawing the windows
      // beside the list needs the core prompt's own render.
      const answer = await new SelectPrompt<(typeof choices)[number]>({
        options: choices,
        initialValue: "default",
        render() {
          return [
            `${bar} ${message}`,
            indent(renderChoices({ choices, cursor: this.cursor, columns: columns - 2 })),
            bar,
          ].join("\n");
        },
      }).prompt();

      return isCancel(answer) ? cancelled() : (answer as InstallLayoutChoice);
    },

    async agents({ candidates }) {
      // Only agents set up on this machine are offered; the rest are named with the
      // reason, so the list is never a menu of things that cannot work.
      const ready = candidates.filter((candidate) => candidate.state === "ready");
      const missing = candidates.filter((candidate) => candidate.state === "missing");
      const manual = candidates.filter((candidate) => candidate.state === "manual");

      if (missing.length > 0) {
        log.info(`Not set up here: ${missing.map((candidate) => candidate.title).join(", ")}`);
      }
      for (const candidate of manual) {
        log.info(`${candidate.title} takes no skills; you will get the line to add by hand`);
      }
      if (ready.length === 0 && manual.length === 0) {
        log.info("No agent found here, skipping.");
        return [];
      }

      const answer = await multiselect({
        message: "Install the termwire-open skill for",
        required: false,
        initialValues: [] as AgentId[],
        options: [...ready, ...manual].map((candidate) => ({
          value: candidate.id,
          label: candidate.title,
          ...(candidate.path === undefined ? {} : { hint: candidate.path }),
        })),
      });

      return isCancel(answer) ? cancelled() : answer;
    },

    async replace({ path }) {
      const answer = await confirm({
        message: `Replace ${path}?`,
        initialValue: false,
      });

      return isCancel(answer) ? cancelled() : answer;
    },

    async confirm({ summary }) {
      log.step(`Plan:\n${summary.map((line) => `  ${line}`).join("\n")}`);

      const answer = await confirm({ message: "Apply this?" });
      if (isCancel(answer)) return cancelled();
      if (!answer) {
        outro("Nothing changed.");
        return false;
      }
      return true;
    },
  };
}

const bar = "│";

function indent(block: string): string {
  return block
    .split("\n")
    .map((line) => (line.length === 0 ? bar : `${bar} ${line}`))
    .join("\n");
}

function cancelled(): undefined {
  cancel("Cancelled, nothing changed.");
  return undefined;
}

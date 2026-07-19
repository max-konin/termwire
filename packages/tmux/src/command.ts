import { assertNotEmpty, ValidationError } from "./validation";

export interface WindowPaneIds {
  windowId: string;
  paneId: string;
}

export function appendEnvironment(
  argv: string[],
  environment?: Record<string, string | undefined>,
): void {
  if (!environment) return;

  for (const [name, value] of Object.entries(environment)) {
    if (value !== undefined) {
      argv.push("-e", `${name}=${value}`);
    }
  }
}

export function appendCommand(argv: string[], command?: readonly string[]): void {
  if (!command) return;

  if (command.length === 0) {
    throw new ValidationError("command", "command must not be empty");
  }

  assertNotEmpty("command", command[0]);
  argv.push(...command);
}

export function readPaneId(stdout: string): string {
  const paneId = stdout.trim();

  assertNotEmpty("paneId", paneId);
  return paneId;
}

export function readWindowPaneIds(stdout: string): WindowPaneIds {
  const values = stdout.trim().split("\t");

  if (values.length !== 2) {
    throw new ValidationError("windowPaneIds", "expected a window and pane id");
  }

  const [windowId, paneId] = values.map((value) => value.trim());

  assertNotEmpty("windowId", windowId);
  assertNotEmpty("paneId", paneId);

  return { windowId, paneId };
}

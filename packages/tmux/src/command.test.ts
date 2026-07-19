import { describe, expect, test } from "bun:test";
import { appendCommand, appendEnvironment, readPaneId, readWindowPaneIds } from "./command";
import { ValidationError } from "./validation";

describe("appendEnvironment", () => {
  test("appends defined environment entries as repeated arguments", () => {
    const argv = ["tmux", "new-session"];

    appendEnvironment(argv, { PROJECT_ROLE: "workspace", OMITTED: undefined });

    expect(argv).toEqual(["tmux", "new-session", "-e", "PROJECT_ROLE=workspace"]);
  });
});

describe("appendCommand", () => {
  test("preserves command argv elements", () => {
    const argv = ["tmux", "new-session"];

    appendCommand(argv, ["printf", "hello world", "$HOME"]);

    expect(argv).toEqual(["tmux", "new-session", "printf", "hello world", "$HOME"]);
  });
});

describe("readPaneId", () => {
  test("trims a pane id", () => {
    expect(readPaneId(" %1\n")).toBe("%1");
  });

  test("rejects blank output", () => {
    expect(() => readPaneId(" \n")).toThrow(ValidationError);
  });
});

describe("readWindowPaneIds", () => {
  test("returns trimmed window and pane ids", () => {
    expect(readWindowPaneIds(" @1\t%1 \n")).toEqual({ windowId: "@1", paneId: "%1" });
  });

  test("rejects malformed output", () => {
    expect(() => readWindowPaneIds("@1\n")).toThrow(ValidationError);
  });
});

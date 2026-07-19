import { expect, mock, test } from "bun:test";
import { createOpenbridgePlugin } from "./plugin";

test("registers openbridge_open without opening during plugin load", async () => {
  const openFile = mock(async () => ({ path: "/workspace/README.md" }));
  const plugin = createOpenbridgePlugin(openFile);
  const hooks = await plugin({} as never);
  expect(hooks.tool?.openbridge_open).toBeDefined();
  expect(openFile).not.toHaveBeenCalled();
});

import { expect, mock, test } from "bun:test";
import { createTermwirePlugin } from "./plugin";

test("registers termwire_open without opening during plugin load", async () => {
  const openFile = mock(async () => ({ path: "/workspace/README.md" }));
  const plugin = createTermwirePlugin(openFile);
  const hooks = await plugin({} as never);
  expect(hooks.tool?.termwire_open).toBeDefined();
  expect(openFile).not.toHaveBeenCalled();
});

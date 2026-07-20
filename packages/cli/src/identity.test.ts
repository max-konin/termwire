import { expect, test } from "bun:test";
import { createIdentity, sanitizeComponent } from "./identity";

test("sanitizes components without changing case", () => {
  expect(sanitizeComponent(" My Project/DEV ", "name")).toBe("My-Project-DEV");
});

test("derives identity from the Git root", () => {
  expect(createIdentity({ cwd: "/tmp/Fallback", gitRoot: "/repo/TermWire", name: "Dev" })).toEqual({
    project: "TermWire",
    session: "TermWire-Dev",
    socket: "/tmp/termwire/TermWire-Dev.sock",
  });
});

test("derives the project from cwd without a Git root", () => {
  expect(createIdentity({ cwd: "/tmp/Fallback", name: "Dev" })).toMatchObject({
    project: "Fallback",
    session: "Fallback-Dev",
  });
});

test("rejects an empty project", () => {
  expect(() => createIdentity({ cwd: "/", name: "Dev" })).toThrow(
    "project must contain a letter, number, _ or -",
  );
});

test("rejects an empty name", () => {
  expect(() => createIdentity({ cwd: "/tmp/Fallback", name: "   " })).toThrow(
    "name must contain a letter, number, _ or -",
  );
});

test("accepts a socket path at the macOS Unix socket byte limit", () => {
  const identity = createIdentity({ cwd: "/tmp/p", name: "n".repeat(82) });

  expect(Buffer.byteLength(identity.socket)).toBe(103);
});

test("rejects a socket path over the macOS Unix socket byte limit", () => {
  expect(() => createIdentity({ cwd: "/tmp/p", name: "n".repeat(83) })).toThrow(
    "socket path exceeds macOS Unix socket limit of 103 bytes",
  );
});

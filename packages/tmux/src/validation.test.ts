import { describe, expect, test } from "bun:test";
import { assertNotEmpty, ValidationError } from "./validation";

describe("assertNotEmpty", () => {
  test("accepts a non-empty value", () => {
    expect(() => assertNotEmpty("session", "project")).not.toThrow();
  });

  test.each(["", "   ", "\t\n"])("rejects an empty session value", (value) => {
    expect(() => assertNotEmpty("session", value)).toThrow(ValidationError);

    try {
      assertNotEmpty("session", value);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).field).toBe("session");
    }
  });
});

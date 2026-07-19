import { describe, expect, test } from "bun:test";
import { assertNotEmpty, ValidationError } from "./validation";

describe("assertNotEmpty", () => {
  test("accepts a non-empty value", () => {
    expect(() => assertNotEmpty("socket", "/tmp/editor.sock")).not.toThrow();
  });

  test("rejects empty and whitespace-only values with the field", () => {
    for (const value of ["", "  "]) {
      expect(() => assertNotEmpty("socket", value)).toThrow(ValidationError);

      try {
        assertNotEmpty("socket", value);
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).field).toBe("socket");
      }
    }
  });
});

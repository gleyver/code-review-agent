import { describe, expect, it } from "vitest";
import { timingSafeStringEqual } from "./timing-safe-string-equal.js";

describe("timingSafeStringEqual", () => {
  it("returns true for identical strings", () => {
    expect(timingSafeStringEqual("same-secret", "same-secret")).toBe(true);
  });

  it("returns false for different strings", () => {
    expect(timingSafeStringEqual("expected", "wrong")).toBe(false);
  });

  it("returns false when received is undefined", () => {
    expect(timingSafeStringEqual("expected", undefined)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseFoundryAgentsJson } from "./foundry-agents-config.js";

describe("parseFoundryAgentsJson", () => {
  it("parses valid array", () => {
    const raw = JSON.stringify([
      { id: "a", foundryName: "n1", foundryVersion: "1" },
      { id: "b", foundryName: "n2", foundryVersion: "2" }
    ]);
    const out = parseFoundryAgentsJson(raw);
    expect(out).toHaveLength(2);
    expect(out[0]?.id).toBe("a");
  });

  it("rejects duplicate ids case-insensitive", () => {
    const raw = JSON.stringify([
      { id: "Same", foundryName: "n1", foundryVersion: "1" },
      { id: "same", foundryName: "n2", foundryVersion: "2" }
    ]);
    expect(() => parseFoundryAgentsJson(raw)).toThrow(z.ZodError);
  });
});

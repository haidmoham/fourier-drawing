import { describe, expect, it } from "vitest";
import { traceStrengthAfterFade } from "./source-trace";

describe("source trace", () => {
  it("returns a full-strength trace to graphite after its fade duration", () => {
    expect(traceStrengthAfterFade(1, 300, 600)).toBe(0.5);
    expect(traceStrengthAfterFade(1, 600, 600)).toBe(0);
    expect(traceStrengthAfterFade(1, 900, 600)).toBe(0);
  });
});

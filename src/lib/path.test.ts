import { describe, expect, it } from "vitest";
import { appendSample, canClosePath, distance, type Point } from "./path";

describe("path sampling", () => {
  it("keeps the first point and samples points at the requested distance", () => {
    const first: Point = { x: 10, y: 10 };
    const samples = appendSample([first], { x: 13, y: 14 }, 4);

    expect(samples).toEqual([first, { x: 13, y: 14 }]);
    expect(distance(first, samples[1])).toBe(5);
  });

  it("ignores pointer jitter without mutating existing samples", () => {
    const original: Point[] = [{ x: 10, y: 10 }];
    const samples = appendSample(original, { x: 11, y: 11 }, 2);

    expect(samples).toEqual(original);
    expect(samples).not.toBe(original);
  });

  it("requires at least three points before a path can close", () => {
    expect(canClosePath([])).toBe(false);
    expect(canClosePath([{ x: 0, y: 0 }, { x: 2, y: 2 }])).toBe(false);
    expect(
      canClosePath([
        { x: 0, y: 0 },
        { x: 2, y: 2 },
        { x: 4, y: 0 },
      ]),
    ).toBe(true);
  });
});

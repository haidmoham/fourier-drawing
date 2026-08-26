import { describe, expect, it } from "vitest";
import { analyzeFourier, maxHarmonicPairs, type CurveSample } from "./domain-adapter";

describe("Fourier presentation contract", () => {
  it("derives the harmonic limit from capped analysis data", () => {
    const samples: CurveSample[] = Array.from({ length: 700 }, (_, index) => ({
      x: index,
      y: Math.sin(index),
      z: 0,
      timestamp: index,
    }));

    const analysis = analyzeFourier(samples);

    expect(analysis.resampled).toHaveLength(256);
    expect(maxHarmonicPairs(analysis)).toBe(128);
  });
});

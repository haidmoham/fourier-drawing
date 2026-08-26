import { describe, expect, it } from "vitest";
import {
  analyzeCurve,
  appendDistanceFiltered,
  dft3,
  normalizedRmsReconstructionBreakdown,
  normalizedRmsReconstructionError,
  reconstruct3,
  resampleUniformArcLength,
  safeMaxHarmonicPairs,
  type CurveSample,
} from "./index";

const sample = (x: number, y: number, z: number, timestamp = 0): CurveSample => ({
  x,
  y,
  z,
  timestamp,
});

describe("curve sampling", () => {
  it("filters nearby points without mutating the input", () => {
    const original = [sample(0, 0, 0)];
    const filtered = appendDistanceFiltered(original, sample(1, 1, 1), 2);
    const appended = appendDistanceFiltered(original, sample(2, 0, 0), 2);

    expect(filtered).toEqual(original);
    expect(filtered).not.toBe(original);
    expect(appended).toEqual([original[0], sample(2, 0, 0)]);
  });
});

describe("uniform arc-length resampling", () => {
  it("places points at equal distances and preserves endpoints", () => {
    const result = resampleUniformArcLength(
      [sample(0, 0, 0, 0), sample(2, 0, 0, 2), sample(2, 4, 0, 6)],
      4,
    );

    expect(result).toEqual([
      sample(0, 0, 0, 0),
      sample(2, 0, 0, 2),
      sample(2, 2, 0, 4),
      sample(2, 4, 0, 6),
    ]);
  });

  it("handles empty, one-point, and zero-length curves", () => {
    expect(resampleUniformArcLength([], 3)).toEqual([]);
    expect(resampleUniformArcLength([sample(1, 2, 3, 4)], 3)).toEqual([
      sample(1, 2, 3, 4),
      sample(1, 2, 3, 4),
      sample(1, 2, 3, 4),
    ]);
    expect(resampleUniformArcLength([sample(1, 2, 3), sample(1, 2, 3, 2)], 2)).toEqual([
      sample(1, 2, 3),
      sample(1, 2, 3),
    ]);
  });
});

describe("three-coordinate DFT", () => {
  it("keeps a constant point in the DC coefficient", () => {
    const coefficients = dft3(Array.from({ length: 8 }, () => ({ x: 2, y: -3, z: 5 })));

    expect(coefficients[0]).toMatchObject({
      frequency: 0,
      x: { re: 2, im: 0 },
      y: { re: -3, im: 0 },
      z: { re: 5, im: 0 },
    });
    expect(coefficients.slice(1).every((coefficient) => Math.hypot(coefficient.x.re, coefficient.x.im) < 1e-12)).toBe(true);
  });

  it("finds a signed sinusoidal frequency", () => {
    const count = 15;
    const coefficients = dft3(
      Array.from({ length: count }, (_, index) => ({
        x: Math.cos((2 * Math.PI * 3 * index) / count),
        y: Math.sin((2 * Math.PI * 3 * index) / count),
        z: 0,
      })),
    );
    const positive = coefficients.find((coefficient) => coefficient.frequency === 3);

    expect(positive?.x.re).toBeCloseTo(0.5, 12);
    expect(positive?.x.im).toBeCloseTo(0, 12);
    expect(positive?.y.re).toBeCloseTo(0, 12);
    expect(positive?.y.im).toBeCloseTo(-0.5, 12);
  });

  it("reconstructs all original samples and makes endpoints periodic", () => {
    const points = Array.from({ length: 15 }, (_, index) => ({
      x: Math.cos((2 * Math.PI * 3 * index) / 15) + 0.25,
      y: Math.sin((2 * Math.PI * 2 * index) / 15),
      z: Math.cos((2 * Math.PI * index) / 15),
    }));
    const coefficients = dft3(points);

    expect(normalizedRmsReconstructionError(points, coefficients)).toBeLessThan(1e-12);
    const breakdown = normalizedRmsReconstructionBreakdown(points, coefficients);
    expect(breakdown.sampleCount).toBe(15);
    expect(breakdown.squaredReferenceByAxis.x).toBeCloseTo(8.4375, 12);
    expect(breakdown.squaredReferenceByAxis.y).toBeCloseTo(7.5, 12);
    expect(breakdown.squaredReferenceByAxis.z).toBeCloseTo(7.5, 12);
    expect(breakdown.squaredReferenceSum).toBeCloseTo(23.4375, 12);
    expect(reconstruct3(coefficients, 1)).toEqual(reconstruct3(coefficients, 0));
    expect(safeMaxHarmonicPairs(15)).toBe(7);
  });
});

describe("analysis", () => {
  it("reports closure gap and retains a periodic-exclusive endpoint", () => {
    const analysis = analyzeCurve([sample(0, 0, 0), sample(3, 4, 0)], { sampleCount: 8 });

    expect(analysis.closureGap).toBe(5);
    expect(analysis.closure).toEqual({
      start: { x: 0, y: 0, z: 0 },
      end: { x: 3, y: 4, z: 0 },
      delta: { x: 3, y: 4, z: 0 },
      squaredDistance: 25,
      gap: 5,
    });
    expect(analysis.endpoint).toBe("periodic-exclusive");
    expect(analysis.resampled).toHaveLength(8);
    expect(analysis.scale.scale).toBe(2.5);
  });
});

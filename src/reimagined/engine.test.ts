import { describe, expect, it } from "vitest";
import { chain, reconstruct, resampleClosed, transform, type Harmonic } from "./engine";

describe("resampleClosed", () => {
  it("samples the explicit closing segment without duplicating the endpoint", () => {
    const samples = resampleClosed(
      [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }],
      4,
    );

    expect(samples).toEqual([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ]);
    expect(samples.at(-1)).not.toEqual(samples[0]);
  });
});

describe("transform and reconstruct", () => {
  it("reconstructs every periodic source sample from its complete DFT", () => {
    const count = 15;
    const source = Array.from({ length: count }, (_, index) => {
      const angle = (2 * Math.PI * index) / count;
      return {
        x: 0.2 + 0.7 * Math.cos(2 * angle) + 0.15 * Math.cos(5 * angle),
        y: -0.1 + 0.7 * Math.sin(2 * angle) - 0.15 * Math.sin(5 * angle),
      };
    });
    const harmonics = transform(source);

    for (let index = 0; index < count; index += 1) {
      const point = reconstruct(harmonics, harmonics.length, index / count);
      expect(point.x).toBeCloseTo(source[index].x, 10);
      expect(point.y).toBeCloseTo(source[index].y, 10);
    }
    expect(reconstruct(harmonics, harmonics.length, 1)).toEqual(
      reconstruct(harmonics, harmonics.length, 0),
    );
  });
});

describe("chain", () => {
  it("shows the origin, then one cumulative endpoint per selected coefficient", () => {
    const harmonics: Harmonic[] = [
      { frequency: 0, re: 1, im: -2, amplitude: Math.sqrt(5), phase: 0 },
      { frequency: 1, re: 2, im: 0, amplitude: 2, phase: 0 },
    ];

    const endpoints = chain(harmonics, 2, 0.25);
    expect(endpoints).toHaveLength(3);
    expect(endpoints[0]).toEqual({ x: 0, y: 0 });
    expect(endpoints[1]).toEqual({ x: 1, y: -2 });
    expect(endpoints[2].x).toBeCloseTo(1, 12);
    expect(endpoints[2].y).toBeCloseTo(0, 12);
  });
});

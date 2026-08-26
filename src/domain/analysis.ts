import { distance3, normalizeCurve, resampleUniformArcLength } from "./curve";
import { dft3 } from "./fourier";
import type { AnalyzeCurveOptions, CurveAnalysis, CurveSample } from "./types";

const DEFAULT_SAMPLE_COUNT = 256;
const MAX_SAMPLE_COUNT = 512;

/**
 * Prepare a stroke for a periodic DFT. The final input point is not duplicated.
 * Its jump back to the first point is represented by closureGap.
 */
export function analyzeCurve(
  samples: readonly CurveSample[],
  options: AnalyzeCurveOptions = {},
): CurveAnalysis {
  const source = samples.map((sample) => ({ ...sample }));
  const { normalized, scale } = normalizeCurve(source);
  const sampleCount = clampSampleCount(options.sampleCount ?? DEFAULT_SAMPLE_COUNT);
  const resampled = resampleUniformArcLength(normalized, source.length === 0 ? 0 : sampleCount);
  const first = source[0] ?? { x: 0, y: 0, z: 0 };
  const last = source.at(-1);
  const end = last ?? first;
  const closureDelta = {
    x: end.x - first.x,
    y: end.y - first.y,
    z: end.z - first.z,
  };
  const closureGap = source.length > 1 ? distance3(first, end) : 0;

  return {
    source,
    normalized,
    resampled,
    coefficients: dft3(resampled),
    closure: {
      start: { x: first.x, y: first.y, z: first.z },
      end: { x: end.x, y: end.y, z: end.z },
      delta: closureDelta,
      squaredDistance: closureDelta.x ** 2 + closureDelta.y ** 2 + closureDelta.z ** 2,
      gap: closureGap,
    },
    closureGap,
    scale,
    endpoint: "periodic-exclusive",
  };
}

function clampSampleCount(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_SAMPLE_COUNT;
  }
  return Math.min(MAX_SAMPLE_COUNT, Math.max(1, Math.floor(value)));
}

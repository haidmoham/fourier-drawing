/** Presentation-only names for the renderer-independent curve domain. */
import {
  analyzeCurve,
  appendDistanceFiltered,
  normalizedRmsReconstructionBreakdown,
  normalizedRmsReconstructionError,
  reconstruct3,
  safeMaxHarmonicPairs,
  type CurveAnalysis,
  type CurveSample,
  type RmsErrorBreakdown,
  type Vec3,
} from "../domain";

export type FourierAnalysis = CurveAnalysis;
export { type CurveSample, type Vec3 };

export function appendCurveSample(
  samples: readonly CurveSample[],
  position: Vec3,
  minimumDistance = 0.045,
  timestamp = performance.now(),
): CurveSample[] {
  return appendDistanceFiltered(samples, { ...position, timestamp }, minimumDistance);
}

export function analyzeFourier(
  samples: readonly CurveSample[],
  sampleCount = Math.max(1, Math.min(256, samples.length * 3)),
): FourierAnalysis {
  return analyzeCurve(samples, { sampleCount });
}

export function maxHarmonicPairs(analysis: FourierAnalysis): number {
  return safeMaxHarmonicPairs(analysis.resampled.length);
}

export function reconstructAt(
  analysis: FourierAnalysis,
  t: number,
  harmonicPairs = maxHarmonicPairs(analysis),
): Vec3 {
  const normalized = reconstruct3(analysis.coefficients, t, harmonicPairs);
  return {
    x: analysis.scale.center.x + normalized.x * analysis.scale.scale,
    y: analysis.scale.center.y + normalized.y * analysis.scale.scale,
    z: analysis.scale.center.z + normalized.z * analysis.scale.scale,
  };
}

export function reconstructCurve(
  analysis: FourierAnalysis,
  harmonicPairs = maxHarmonicPairs(analysis),
  count = Math.max(64, Math.min(384, analysis.resampled.length * 2)),
): Vec3[] {
  return Array.from({ length: count }, (_, index) => reconstructAt(analysis, index / count, harmonicPairs));
}

export function normalizedReconstructionError(
  analysis: FourierAnalysis,
  harmonicPairs = maxHarmonicPairs(analysis),
): number {
  return normalizedRmsReconstructionError(analysis.resampled, analysis.coefficients, harmonicPairs);
}

export function reconstructionErrorBreakdown(
  analysis: FourierAnalysis,
  harmonicPairs = maxHarmonicPairs(analysis),
): RmsErrorBreakdown {
  return normalizedRmsReconstructionBreakdown(analysis.resampled, analysis.coefficients, harmonicPairs);
}

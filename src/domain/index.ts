export { analyzeCurve } from "./analysis";
export {
  appendDistanceFiltered,
  distance3,
  normalizeCurve,
  resampleUniformArcLength,
} from "./curve";
export {
  dft3,
  normalizedRmsError,
  normalizedRmsErrorBreakdown,
  normalizedRmsReconstructionBreakdown,
  normalizedRmsReconstructionError,
  reconstruct3,
  safeMaxHarmonicPairs,
} from "./fourier";
export type {
  AnalyzeCurveOptions,
  ClosureBreakdown,
  Complex,
  CurveAnalysis,
  CurveSample,
  FourierCoefficient,
  NormalizedCurve,
  RmsErrorBreakdown,
  ScaleMetadata,
  Vec3,
} from "./types";

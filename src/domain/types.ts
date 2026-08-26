/** A renderer-independent three-dimensional vector. */
export type Vec3 = Readonly<{
  x: number;
  y: number;
  z: number;
}>;

/** A complex number, stored as real and imaginary components. */
export type Complex = Readonly<{
  re: number;
  im: number;
}>;

/** One captured curve point. Timestamps are preserved during processing. */
export type CurveSample = Readonly<{
  x: number;
  y: number;
  z: number;
  timestamp: number;
}>;

/** The three-coordinate coefficient for one signed Fourier frequency. */
export type FourierCoefficient = Readonly<{
  frequency: number;
  x: Complex;
  y: Complex;
  z: Complex;
}>;

/** The terms used by the relative Euclidean RMS error calculation. */
export type RmsErrorBreakdown = Readonly<{
  sampleCount: number;
  squaredErrorByAxis: Vec3;
  squaredReferenceByAxis: Vec3;
  squaredErrorSum: number;
  squaredReferenceSum: number;
  normalizedRms: number;
}>;

/** The source-space vector that closes the final sample back to the first. */
export type ClosureBreakdown = Readonly<{
  start: Vec3;
  end: Vec3;
  delta: Vec3;
  squaredDistance: number;
  gap: number;
}>;

export type ScaleMetadata = Readonly<{
  center: Vec3;
  /** Maximum source distance from center. A degenerate curve uses scale 1. */
  scale: number;
  isDegenerate: boolean;
}>;

export type NormalizedCurve = Readonly<{
  normalized: CurveSample[];
  scale: ScaleMetadata;
}>;

export type CurveAnalysis = Readonly<{
  /** The input copied into an immutable array. */
  source: readonly CurveSample[];
  /** Source points translated to their centroid and divided by scale. */
  normalized: readonly CurveSample[];
  /** Uniform arc-length samples of normalized source points. */
  resampled: readonly CurveSample[];
  coefficients: readonly FourierCoefficient[];
  closure: ClosureBreakdown;
  /** Source-space distance between the final and first sample. */
  closureGap: number;
  scale: ScaleMetadata;
  /** Samples mean t = index / count; t=1 wraps to t=0. */
  endpoint: "periodic-exclusive";
}>;

export type AnalyzeCurveOptions = Readonly<{
  /** Requested DFT sample count. The value is clamped to 1..512. */
  sampleCount?: number;
}>;

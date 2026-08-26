import type { Complex, FourierCoefficient, RmsErrorBreakdown, Vec3 } from "./types";

const TAU = Math.PI * 2;

/**
 * Calculate a direct DFT. Frequencies are signed integers in the order
 * 0, +1, -1, +2, -2, ... . Input is capped at 512 samples by analysis.
 */
export function dft3(samples: readonly Vec3[]): FourierCoefficient[] {
  const count = samples.length;
  if (count === 0) {
    return [];
  }

  return signedFrequencies(count).map((frequency) => {
    let x: Complex = { re: 0, im: 0 };
    let y: Complex = { re: 0, im: 0 };
    let z: Complex = { re: 0, im: 0 };

    for (let index = 0; index < count; index += 1) {
      const angle = (-TAU * frequency * index) / count;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      x = addProduct(x, samples[index].x, cosine, sine);
      y = addProduct(y, samples[index].y, cosine, sine);
      z = addProduct(z, samples[index].z, cosine, sine);
    }

    return {
      frequency,
      x: divide(x, count),
      y: divide(y, count),
      z: divide(z, count),
    };
  });
}

/**
 * Reconstruct one point. t is periodic: t=1 has exactly the same value as t=0.
 * A limit of 0 keeps only DC. Infinity uses every supplied coefficient.
 */
export function reconstruct3(
  coefficients: readonly FourierCoefficient[],
  t: number,
  harmonicPairLimit = Number.POSITIVE_INFINITY,
): Vec3 {
  const phase = t - Math.floor(t);
  const maximum = Math.max(0, harmonicPairLimit);
  let point: Vec3 = { x: 0, y: 0, z: 0 };

  for (const coefficient of coefficients) {
    if (Math.abs(coefficient.frequency) > maximum) {
      continue;
    }
    const angle = TAU * coefficient.frequency * phase;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    point = {
      x: point.x + realProduct(coefficient.x, cosine, sine),
      y: point.y + realProduct(coefficient.y, cosine, sine),
      z: point.z + realProduct(coefficient.z, cosine, sine),
    };
  }
  return point;
}

/** The largest frequency magnitude that can be represented by count samples. */
export function safeMaxHarmonicPairs(sampleCount: number): number {
  return Math.max(0, Math.floor(Math.floor(sampleCount) / 2));
}

/** Relative RMS Euclidean error. Both inputs must have the same length. */
export function normalizedRmsError(
  reference: readonly Vec3[],
  candidate: readonly Vec3[],
): number {
  return normalizedRmsErrorBreakdown(reference, candidate).normalizedRms;
}

/** Return the live terms used by the relative Euclidean RMS calculation. */
export function normalizedRmsErrorBreakdown(
  reference: readonly Vec3[],
  candidate: readonly Vec3[],
): RmsErrorBreakdown {
  if (reference.length !== candidate.length) {
    throw new Error("Reference and candidate sample counts must match.");
  }
  if (reference.length === 0) {
    const zero = { x: 0, y: 0, z: 0 };
    return {
      sampleCount: 0,
      squaredErrorByAxis: zero,
      squaredReferenceByAxis: zero,
      squaredErrorSum: 0,
      squaredReferenceSum: 0,
      normalizedRms: 0,
    };
  }

  let squaredErrorX = 0;
  let squaredErrorY = 0;
  let squaredErrorZ = 0;
  let squaredReferenceX = 0;
  let squaredReferenceY = 0;
  let squaredReferenceZ = 0;
  for (let index = 0; index < reference.length; index += 1) {
    const dx = candidate[index].x - reference[index].x;
    const dy = candidate[index].y - reference[index].y;
    const dz = candidate[index].z - reference[index].z;
    squaredErrorX += dx * dx;
    squaredErrorY += dy * dy;
    squaredErrorZ += dz * dz;
    squaredReferenceX += reference[index].x * reference[index].x;
    squaredReferenceY += reference[index].y * reference[index].y;
    squaredReferenceZ += reference[index].z * reference[index].z;
  }

  const squaredError = squaredErrorX + squaredErrorY + squaredErrorZ;
  const squaredReference = squaredReferenceX + squaredReferenceY + squaredReferenceZ;

  const normalizedRms = squaredReference === 0
    ? (squaredError === 0 ? 0 : Number.POSITIVE_INFINITY)
    : Math.sqrt(squaredError / squaredReference);
  return {
    sampleCount: reference.length,
    squaredErrorByAxis: { x: squaredErrorX, y: squaredErrorY, z: squaredErrorZ },
    squaredReferenceByAxis: { x: squaredReferenceX, y: squaredReferenceY, z: squaredReferenceZ },
    squaredErrorSum: squaredError,
    squaredReferenceSum: squaredReference,
    normalizedRms,
  };
}

/** Reconstruct DFT positions at their original periodic sample times. */
export function normalizedRmsReconstructionError(
  samples: readonly Vec3[],
  coefficients: readonly FourierCoefficient[],
  harmonicPairLimit = Number.POSITIVE_INFINITY,
): number {
  const reconstructed = samples.map((_, index) =>
    reconstruct3(coefficients, index / samples.length, harmonicPairLimit),
  );
  return normalizedRmsError(samples, reconstructed);
}

/** Reconstruct at the periodic sample times and expose every RMS term. */
export function normalizedRmsReconstructionBreakdown(
  samples: readonly Vec3[],
  coefficients: readonly FourierCoefficient[],
  harmonicPairLimit = Number.POSITIVE_INFINITY,
): RmsErrorBreakdown {
  const reconstructed = samples.map((_, index) =>
    reconstruct3(coefficients, index / samples.length, harmonicPairLimit),
  );
  return normalizedRmsErrorBreakdown(samples, reconstructed);
}

function signedFrequencies(count: number): number[] {
  const frequencies = [0];
  for (let magnitude = 1; frequencies.length < count; magnitude += 1) {
    frequencies.push(magnitude);
    if (frequencies.length < count) {
      frequencies.push(-magnitude);
    }
  }
  return frequencies;
}

function addProduct(total: Complex, value: number, cosine: number, sine: number): Complex {
  return { re: total.re + value * cosine, im: total.im + value * sine };
}

function divide(value: Complex, divisor: number): Complex {
  return { re: value.re / divisor, im: value.im / divisor };
}

function realProduct(value: Complex, cosine: number, sine: number): number {
  return value.re * cosine - value.im * sine;
}

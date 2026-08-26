import type { CurveSample, NormalizedCurve, Vec3 } from "./types";

export function distance3(a: Vec3, b: Vec3): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

/**
 * Append next only when it is far enough from the last sample.
 * It always returns a new array and never changes the input array.
 */
export function appendDistanceFiltered(
  samples: readonly CurveSample[],
  next: CurveSample,
  minimumDistance = 0,
): CurveSample[] {
  const previous = samples.at(-1);
  const threshold = Number.isFinite(minimumDistance) ? Math.max(0, minimumDistance) : 0;

  if (!previous || distance3(previous, next) >= threshold) {
    return [...samples, next];
  }

  return [...samples];
}

/**
 * Resample an open polyline at equal arc-length distances.
 * The final point is retained. Fourier processing later makes the sequence
 * periodic without adding a duplicate t=1 endpoint.
 */
export function resampleUniformArcLength(
  samples: readonly CurveSample[],
  count: number,
): CurveSample[] {
  const targetCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  if (targetCount === 0 || samples.length === 0) {
    return [];
  }

  if (targetCount === 1 || samples.length === 1) {
    return Array.from({ length: targetCount }, () => copySample(samples[0]));
  }

  const cumulative = [0];
  for (let index = 1; index < samples.length; index += 1) {
    cumulative.push(cumulative[index - 1] + distance3(samples[index - 1], samples[index]));
  }

  const totalLength = cumulative.at(-1) ?? 0;
  if (totalLength === 0) {
    return Array.from({ length: targetCount }, () => copySample(samples[0]));
  }

  const result: CurveSample[] = [];
  let segment = 0;
  for (let index = 0; index < targetCount; index += 1) {
    const target = (totalLength * index) / (targetCount - 1);
    while (segment < samples.length - 2 && cumulative[segment + 1] < target) {
      segment += 1;
    }

    const start = samples[segment];
    const end = samples[segment + 1];
    const segmentLength = cumulative[segment + 1] - cumulative[segment];
    const amount = segmentLength === 0 ? 0 : (target - cumulative[segment]) / segmentLength;
    result.push(interpolateSample(start, end, amount));
  }
  return result;
}

export function normalizeCurve(samples: readonly CurveSample[]): NormalizedCurve {
  if (samples.length === 0) {
    return {
      normalized: [],
      scale: { center: { x: 0, y: 0, z: 0 }, scale: 1, isDegenerate: true },
    };
  }

  const center = samples.reduce<Vec3>(
    (total, sample) => ({
      x: total.x + sample.x / samples.length,
      y: total.y + sample.y / samples.length,
      z: total.z + sample.z / samples.length,
    }),
    { x: 0, y: 0, z: 0 },
  );
  const radius = samples.reduce((maximum, sample) => Math.max(maximum, distance3(sample, center)), 0);
  const isDegenerate = radius === 0;
  const scale = isDegenerate ? 1 : radius;

  return {
    normalized: samples.map((sample) => ({
      x: (sample.x - center.x) / scale,
      y: (sample.y - center.y) / scale,
      z: (sample.z - center.z) / scale,
      timestamp: sample.timestamp,
    })),
    scale: { center, scale, isDegenerate },
  };
}

function interpolateSample(start: CurveSample, end: CurveSample, amount: number): CurveSample {
  return {
    x: start.x + (end.x - start.x) * amount,
    y: start.y + (end.y - start.y) * amount,
    z: start.z + (end.z - start.z) * amount,
    timestamp: start.timestamp + (end.timestamp - start.timestamp) * amount,
  };
}

function copySample(sample: CurveSample): CurveSample {
  return { ...sample };
}

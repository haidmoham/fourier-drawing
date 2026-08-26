import type { Vec3 } from "../domain";

export type CurveContactInterval = Readonly<{
  centerPathPosition: number;
  endPathPosition: number;
  intervalLength: number;
  startPathPosition: number;
  strength: number;
}>;

export type CurveContact = Readonly<{
  intervals: readonly CurveContactInterval[];
  intervalLength: number;
  strength: number;
}>;

type ArcInterval = {
  end: number;
  start: number;
};

/** Return every continuous part of a polyline inside a sphere around a point. */
export function curveContactAtPoint(
  point: Vec3,
  curve: readonly Vec3[],
  radius: number,
): CurveContact | null {
  if (curve.length < 2 || radius <= 0) {
    return null;
  }

  const arcIntervals: ArcInterval[] = [];
  let traversedLength = 0;
  for (let index = 1; index < curve.length; index += 1) {
    const start = curve[index - 1];
    const end = curve[index];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dz = end.z - start.z;
    const squaredLength = dx * dx + dy * dy + dz * dz;
    const segmentLength = Math.sqrt(squaredLength);
    if (segmentLength === 0) {
      continue;
    }

    const mx = start.x - point.x;
    const my = start.y - point.y;
    const mz = start.z - point.z;
    const linearCoefficient = 2 * (mx * dx + my * dy + mz * dz);
    const constantCoefficient = mx * mx + my * my + mz * mz - radius * radius;
    const discriminant = linearCoefficient * linearCoefficient - 4 * squaredLength * constantCoefficient;
    if (discriminant >= 0) {
      const root = Math.sqrt(discriminant);
      const entry = Math.max(0, (-linearCoefficient - root) / (2 * squaredLength));
      const exit = Math.min(1, (-linearCoefficient + root) / (2 * squaredLength));
      if (exit > entry) {
        arcIntervals.push({
          start: traversedLength + entry * segmentLength,
          end: traversedLength + exit * segmentLength,
        });
      }
    }
    traversedLength += segmentLength;
  }

  if (arcIntervals.length === 0 || traversedLength === 0) {
    return null;
  }

  const mergedIntervals = mergeTouchingIntervals(arcIntervals);
  const diameter = radius * 2;
  const intervals = mergedIntervals.map(({ start, end }) => {
    const intervalLength = end - start;
    return {
      startPathPosition: start / traversedLength,
      endPathPosition: end / traversedLength,
      centerPathPosition: ((start + end) * 0.5) / traversedLength,
      intervalLength,
      strength: Math.min(1, intervalLength / diameter),
    };
  });
  const intervalLength = intervals.reduce((total, interval) => total + interval.intervalLength, 0);
  return {
    intervals,
    intervalLength,
    strength: Math.min(1, intervalLength / diameter),
  };
}

function mergeTouchingIntervals(intervals: readonly ArcInterval[]): ArcInterval[] {
  const merged: ArcInterval[] = [];
  for (const interval of intervals) {
    const previous = merged.at(-1);
    if (previous && interval.start <= previous.end + Number.EPSILON * 16) {
      previous.end = Math.max(previous.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}

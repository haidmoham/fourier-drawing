/** A two-dimensional point expressed in the drawing's local coordinate space. */
export type Point = Readonly<{
  x: number;
  y: number;
}>;

/**
 * One complex Fourier coefficient. Its vector rotates `frequency` times for
 * each trip around the drawing; `re` and `im` are its Cartesian components.
 */
export type Harmonic = Readonly<{
  frequency: number;
  re: number;
  im: number;
  amplitude: number;
  phase: number;
}>;

const TAU = Math.PI * 2;

/**
 * Redistribute a path at equal distances around its closed perimeter.
 *
 * The segment from the last supplied point back to the first is always part of
 * the perimeter. The returned samples use times `0/count` through
 * `(count - 1)/count`, so the first point is never repeated as a duplicate
 * endpoint.
 */
export function resampleClosed(points: readonly Point[], count: number): Point[] {
  const sampleCount = usableCount(count);
  if (sampleCount === 0 || points.length === 0) {
    return [];
  }
  if (points.length === 1) {
    return Array.from({ length: sampleCount }, () => copyPoint(points[0]));
  }

  const lengths: number[] = [];
  let perimeter = 0;
  for (let index = 0; index < points.length; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    lengths.push(length);
    perimeter += length;
  }

  if (perimeter === 0) {
    return Array.from({ length: sampleCount }, () => copyPoint(points[0]));
  }

  const samples: Point[] = [];
  let segment = 0;
  let distanceBeforeSegment = 0;
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const targetDistance = (perimeter * sample) / sampleCount;
    while (
      segment < lengths.length - 1
      && targetDistance > distanceBeforeSegment + lengths[segment]
    ) {
      distanceBeforeSegment += lengths[segment];
      segment += 1;
    }

    const start = points[segment];
    const end = points[(segment + 1) % points.length];
    const progress = lengths[segment] === 0
      ? 0
      : (targetDistance - distanceBeforeSegment) / lengths[segment];
    samples.push({
      x: start.x + (end.x - start.x) * progress,
      y: start.y + (end.y - start.y) * progress,
    });
  }
  return samples;
}

/**
 * Compute the complex DFT of a periodic drawing.
 *
 * Coefficients are calculated in signed-frequency order (`0, +1, -1, ...`),
 * then arranged from the largest visible contribution to the smallest. DC
 * stays first so that the first link in a harmonic chain is the drawing's
 * center offset.
 */
export function transform(points: readonly Point[]): Harmonic[] {
  if (points.length === 0) {
    return [];
  }

  const frequencies = signedFrequencies(points.length);
  const coefficients = frequencies.map((frequency, index) => {
    let re = 0;
    let im = 0;
    for (let sample = 0; sample < points.length; sample += 1) {
      const point = points[sample];
      const angle = (TAU * frequency * sample) / points.length;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      re += point.x * cosine + point.y * sine;
      im += point.y * cosine - point.x * sine;
    }
    re /= points.length;
    im /= points.length;
    return {
      frequency,
      re,
      im,
      amplitude: Math.hypot(re, im),
      phase: Math.atan2(im, re),
      order: index,
    };
  });

  return coefficients
    .sort((left, right) => {
      if (left.frequency === 0) return -1;
      if (right.frequency === 0) return 1;
      return right.amplitude - left.amplitude || left.order - right.order;
    })
    .map(({ order: _order, ...coefficient }) => coefficient);
}

/**
 * Return each cumulative endpoint in a harmonic chain at time `t`.
 * `count` includes DC and is clamped to the supplied coefficient length. The
 * first point is the origin; every later point adds exactly one rotating term.
 */
export function chain(
  harmonics: readonly Harmonic[],
  count: number,
  t: number,
): Point[] {
  const termCount = Math.min(usableCount(count), harmonics.length);
  const phase = periodicTime(t);
  const endpoints: Point[] = [{ x: 0, y: 0 }];
  let current = endpoints[0];

  for (let index = 0; index < termCount; index += 1) {
    const harmonic = harmonics[index];
    const angle = TAU * harmonic.frequency * phase;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    current = {
      x: current.x + harmonic.re * cosine - harmonic.im * sine,
      y: current.y + harmonic.re * sine + harmonic.im * cosine,
    };
    endpoints.push(current);
  }
  return endpoints;
}

/** The final endpoint of `chain`, i.e. the reconstructed drawing position. */
export function reconstruct(
  harmonics: readonly Harmonic[],
  count: number,
  t: number,
): Point {
  const endpoints = chain(harmonics, count, t);
  return endpoints[endpoints.length - 1];
}

/** Create a compact closed source curve for the first-view demonstrations. */
export function exampleCurve(
  name: "orbit" | "flower" | "heart",
  count = 240,
): Point[] {
  const sampleCount = Math.max(3, usableCount(count));
  return Array.from({ length: sampleCount }, (_, index) => {
    const angle = (TAU * index) / sampleCount;
    if (name === "orbit") {
      return { x: 0.84 * Math.cos(angle), y: 0.84 * Math.sin(angle) };
    }
    if (name === "flower") {
      const radius = 0.42 + 0.36 * Math.cos(5 * angle);
      return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
    }

    const sine = Math.sin(angle);
    return {
      x: (16 * sine * sine * sine) / 17,
      y: (13 * Math.cos(angle) - 5 * Math.cos(2 * angle) - 2 * Math.cos(3 * angle) - Math.cos(4 * angle)) / 17,
    };
  });
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

function periodicTime(t: number): number {
  return Number.isFinite(t) ? t - Math.floor(t) : 0;
}

function usableCount(count: number): number {
  return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
}

function copyPoint(point: Point): Point {
  return { x: point.x, y: point.y };
}

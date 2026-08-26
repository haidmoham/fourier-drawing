export type Point = Readonly<{
  x: number;
  y: number;
}>;

/**
 * Add a point only when it is meaningfully distant from the previous sample.
 * This keeps fast pointer input from producing redundant samples.
 */
export function appendSample(
  samples: readonly Point[],
  next: Point,
  minimumDistance = 2,
): Point[] {
  const previous = samples.at(-1);

  if (!previous || distance(previous, next) >= minimumDistance) {
    return [...samples, next];
  }

  return [...samples];
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function canClosePath(samples: readonly Point[]): boolean {
  return samples.length > 2;
}

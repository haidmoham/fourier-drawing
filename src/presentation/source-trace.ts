/** Returns trace intensity after a linear fade. */
export function traceStrengthAfterFade(
  strength: number,
  elapsedMs: number,
  fadeDurationMs: number,
): number {
  if (fadeDurationMs <= 0) {
    return 0;
  }
  const fade = Math.max(0, elapsedMs) / fadeDurationMs;
  return Math.max(0, strength - fade);
}

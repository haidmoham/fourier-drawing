const CYCLE_DURATION_MS = 28_000;

/** Keep every presentation of harmonic motion on the same periodic clock. */
export function harmonicPhaseAt(timestampMs: number): number {
  return (timestampMs % CYCLE_DURATION_MS) / CYCLE_DURATION_MS;
}

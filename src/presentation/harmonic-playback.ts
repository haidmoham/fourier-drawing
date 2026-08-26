export type HarmonicPlaybackSnapshot = Readonly<{
  harmonicPairs: number;
  stepIndex: number;
  steps: readonly number[];
  isAuto: boolean;
}>;

export class HarmonicPlayback {
  private steps = [0];
  private stepIndex = 0;
  private isAuto = false;
  private automaticStepStartedAt = performance.now();

  public constructor(private readonly automaticStepDuration = 1_800) {}

  public configure(maximum: number, preferredPairs = this.currentPairs()): void {
    this.steps = powerOfTwoSteps(maximum);
    this.stepIndex = nearestStepIndex(this.steps, preferredPairs);
  }

  public reset(maximum = 0, preferredPairs = 0): void {
    this.isAuto = false;
    this.configure(maximum, preferredPairs);
  }

  public select(stepIndex: number): void {
    this.isAuto = false;
    this.stepIndex = clampStepIndex(this.steps, stepIndex);
  }

  public step(direction: -1 | 1): void {
    this.select(this.stepIndex + direction);
  }

  public toggleAuto(now: number): void {
    if (this.isAuto) {
      this.isAuto = false;
      return;
    }
    this.startAuto(now);
  }

  public startAuto(now: number, advanceFromZero = false): void {
    if (advanceFromZero && this.stepIndex === 0 && this.steps.length > 1) {
      this.stepIndex = 1;
    }
    this.isAuto = true;
    this.automaticStepStartedAt = now;
  }

  /** Start a new visible playback sequence, regardless of previous playback state. */
  public playFromBeginning(now: number): void {
    this.stepIndex = Math.min(1, this.steps.length - 1);
    this.isAuto = this.steps.length > 1;
    this.automaticStepStartedAt = now;
  }

  public stopAuto(): void {
    this.isAuto = false;
  }

  public tick(now: number): boolean {
    if (!this.isAuto || this.steps.length < 2) {
      return false;
    }
    const elapsed = now - this.automaticStepStartedAt;
    if (elapsed < this.automaticStepDuration) {
      return false;
    }
    const elapsedSteps = Math.floor(elapsed / this.automaticStepDuration);
    this.automaticStepStartedAt += elapsedSteps * this.automaticStepDuration;
    this.stepIndex = (this.stepIndex + elapsedSteps) % this.steps.length;
    return true;
  }

  public snapshot(): HarmonicPlaybackSnapshot {
    return {
      harmonicPairs: this.currentPairs(),
      stepIndex: this.stepIndex,
      steps: this.steps,
      isAuto: this.isAuto,
    };
  }

  private currentPairs(): number {
    return this.steps[this.stepIndex] ?? 0;
  }
}

function powerOfTwoSteps(maximum: number): number[] {
  const safeMaximum = Math.max(0, Math.floor(maximum));
  const steps = [0];
  for (let pairs = 1; pairs <= safeMaximum; pairs *= 2) {
    steps.push(pairs);
  }
  if (steps.at(-1) !== safeMaximum) {
    steps.push(safeMaximum);
  }
  return steps;
}

function nearestStepIndex(steps: readonly number[], preferredPairs: number): number {
  let nearestIndex = 0;
  for (let index = 1; index < steps.length; index += 1) {
    if (Math.abs(steps[index] - preferredPairs) < Math.abs(steps[nearestIndex] - preferredPairs)) {
      nearestIndex = index;
    }
  }
  return nearestIndex;
}

function clampStepIndex(steps: readonly number[], stepIndex: number): number {
  const roundedIndex = Number.isFinite(stepIndex) ? Math.round(stepIndex) : 0;
  return Math.min(Math.max(0, roundedIndex), Math.max(0, steps.length - 1));
}

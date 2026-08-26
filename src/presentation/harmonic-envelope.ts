import katex from "katex";
import type { FourierAnalysis } from "./domain-adapter";
import { harmonicPhaseAt } from "./harmonic-motion";
import { VISUAL_PALETTE } from "./visual-palette";

const TAU = Math.PI * 2;
const ENVELOPE_SAMPLE_COUNT = 160;
const VIEWBOX_WIDTH = 1000;
const BASELINE_Y = 50;
const AMPLITUDE_HEIGHT = 39;

type EnvelopeElements = Readonly<{
  details: HTMLDetailsElement;
  cosinePath: SVGPathElement;
  sinePath: SVGPathElement;
  phaseDelta: SVGGElement;
  formula: HTMLElement;
  sigmaBounds: HTMLElement;
  sigmaFoldSymbol: HTMLElement;
  status: HTMLElement;
}>;

type EnvelopeSample = Readonly<{
  cosineMagnitude: number;
  sineMagnitude: number;
}>;

export class HarmonicEnvelope {
  private hasAnalysis = false;

  private constructor(private readonly elements: EnvelopeElements) {
    const formula = String.raw`\widehat{\mathbf p}_M(t)=\mathbf c_0+\color{${VISUAL_PALETTE.reconstruction.css}}{\underbrace{\sum\Re(\mathbf c_k)\cos(2\pi kt)}_{\mathbf C_M(t)}}+\color{${VISUAL_PALETTE.raw.css}}{\underbrace{-\sum\Im(\mathbf c_k)\sin(2\pi kt)}_{\mathbf S_M(t)}}`;
    katex.render(formula, this.elements.formula, { displayMode: false, throwOnError: false });
    katex.render(String.raw`\sum`, this.elements.sigmaFoldSymbol, { displayMode: false, throwOnError: false });
    katex.render(
      String.raw`-M\leq k\leq M,\quad k\neq0`,
      this.elements.sigmaBounds,
      { displayMode: false, throwOnError: false },
    );
  }

  public static from(root: ParentNode): HarmonicEnvelope {
    return new HarmonicEnvelope({
      details: requiredElement<HTMLDetailsElement>(root, "#harmonic-envelope"),
      cosinePath: requiredElement<SVGPathElement>(root, "#cosine-envelope"),
      sinePath: requiredElement<SVGPathElement>(root, "#sine-envelope"),
      phaseDelta: requiredElement<SVGGElement>(root, "#harmonic-phase-delta"),
      formula: requiredElement(root, "#harmonic-envelope-formula"),
      sigmaBounds: requiredElement(root, "#sigma-bounds-formula"),
      sigmaFoldSymbol: requiredElement(root, "#sigma-fold-symbol"),
      status: requiredElement(root, "#harmonic-envelope-status"),
    });
  }

  public update(analysis: FourierAnalysis | null, harmonicPairs: number): void {
    this.hasAnalysis = analysis !== null;
    this.elements.details.hidden = !this.hasAnalysis;
    if (!analysis) {
      this.elements.cosinePath.setAttribute("d", baselinePath());
      this.elements.sinePath.setAttribute("d", baselinePath());
      this.elements.status.textContent = "waiting for a curve";
      return;
    }

    const samples = sampleEnvelope(analysis, harmonicPairs);
    const maximum = Math.max(0, ...samples.flatMap((sample) => [sample.cosineMagnitude, sample.sineMagnitude]));
    this.elements.cosinePath.setAttribute("d", envelopePath(samples, "cosineMagnitude", maximum, -1));
    this.elements.sinePath.setAttribute("d", envelopePath(samples, "sineMagnitude", maximum, 1));
    this.elements.status.textContent = harmonicPairs === 0 ? "M = 0 · dc only" : `M = ${harmonicPairs}`;
  }

  public render(timestampMs: number): void {
    if (!this.hasAnalysis || !this.elements.details.open) {
      return;
    }
    const x = 10 + harmonicPhaseAt(timestampMs) * (VIEWBOX_WIDTH - 20);
    this.elements.phaseDelta.setAttribute("transform", `translate(${x.toFixed(2)} 0)`);
  }
}

function sampleEnvelope(analysis: FourierAnalysis, harmonicPairs: number): EnvelopeSample[] {
  const maximumFrequency = Math.max(0, Math.floor(harmonicPairs));
  const positiveCoefficients = analysis.coefficients.filter(
    (coefficient) => coefficient.frequency > 0 && coefficient.frequency <= maximumFrequency,
  );
  return Array.from({ length: ENVELOPE_SAMPLE_COUNT }, (_, index) => {
    const t = index / (ENVELOPE_SAMPLE_COUNT - 1);
    let cosineX = 0;
    let cosineY = 0;
    let cosineZ = 0;
    let sineX = 0;
    let sineY = 0;
    let sineZ = 0;
    for (const coefficient of positiveCoefficients) {
      const angle = TAU * coefficient.frequency * t;
      const pairWeight = coefficient.frequency * 2 === analysis.resampled.length ? 1 : 2;
      const cosine = Math.cos(angle) * pairWeight * analysis.scale.scale;
      const sine = -Math.sin(angle) * pairWeight * analysis.scale.scale;
      cosineX += coefficient.x.re * cosine;
      cosineY += coefficient.y.re * cosine;
      cosineZ += coefficient.z.re * cosine;
      sineX += coefficient.x.im * sine;
      sineY += coefficient.y.im * sine;
      sineZ += coefficient.z.im * sine;
    }
    return {
      cosineMagnitude: Math.hypot(cosineX, cosineY, cosineZ),
      sineMagnitude: Math.hypot(sineX, sineY, sineZ),
    };
  });
}

function envelopePath(
  samples: readonly EnvelopeSample[],
  key: keyof EnvelopeSample,
  maximum: number,
  direction: -1 | 1,
): string {
  if (maximum === 0) {
    return baselinePath();
  }
  const points = samples.map((sample, index) => {
    const x = (index / (samples.length - 1)) * VIEWBOX_WIDTH;
    const y = BASELINE_Y + direction * (sample[key] / maximum) * AMPLITUDE_HEIGHT;
    return `${x.toFixed(2)} ${y.toFixed(2)}`;
  });
  return `M 0 ${BASELINE_Y} L ${points.join(" L ")} L ${VIEWBOX_WIDTH} ${BASELINE_Y} Z`;
}

function baselinePath(): string {
  return `M 0 ${BASELINE_Y} L ${VIEWBOX_WIDTH} ${BASELINE_Y} Z`;
}

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`The harmonic envelope is missing ${selector}.`);
  }
  return element;
}

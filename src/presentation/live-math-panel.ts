import katex from "katex";
import "katex/dist/katex.min.css";
import type { ClosureBreakdown, RmsErrorBreakdown } from "../domain";
import { VISUAL_PALETTE } from "./visual-palette";

type LiveMathElements = Readonly<{
  periodicFormula: HTMLElement;
  closureFormula: HTMLElement;
  rmsFormula: HTMLElement;
  errorSum: HTMLElement;
  referenceSum: HTMLElement;
  sampleCount: HTMLElement;
  harmonicValue: HTMLElement;
  resolutionValue: HTMLElement;
  errorValue: HTMLElement;
  closureValue: HTMLElement;
  closureDeltaX: HTMLElement;
  closureDeltaY: HTMLElement;
  closureDeltaZ: HTMLElement;
  rmsErrorX: HTMLElement;
  rmsErrorY: HTMLElement;
  rmsErrorZ: HTMLElement;
  rmsReferenceX: HTMLElement;
  rmsReferenceY: HTMLElement;
  rmsReferenceZ: HTMLElement;
}>;

export type LiveMathSnapshot = Readonly<{
  hasAnalysis: boolean;
  harmonicPairs: number;
  sampleCount: number;
  error: RmsErrorBreakdown | null;
  closure: ClosureBreakdown | null;
}>;

export class LiveMathPanel {
  private renderedPeriodicTex = "";
  private renderedClosureTex = "";
  private renderedRmsTex = "";

  private constructor(private readonly elements: LiveMathElements) {}

  public static from(root: ParentNode): LiveMathPanel {
    return new LiveMathPanel({
      periodicFormula: requiredElement(root, "#periodic-formula"),
      closureFormula: requiredElement(root, "#closure-formula"),
      rmsFormula: requiredElement(root, "#rms-formula"),
      errorSum: requiredElement(root, "#rms-error-sum"),
      referenceSum: requiredElement(root, "#rms-reference-sum"),
      sampleCount: requiredElement(root, "#rms-sample-count"),
      harmonicValue: requiredElement(root, "#math-harmonic-value"),
      resolutionValue: requiredElement(root, "#math-resolution-value"),
      errorValue: requiredElement(root, "#math-error-value"),
      closureValue: requiredElement(root, "#math-closure-value"),
      closureDeltaX: requiredElement(root, "#closure-delta-x"),
      closureDeltaY: requiredElement(root, "#closure-delta-y"),
      closureDeltaZ: requiredElement(root, "#closure-delta-z"),
      rmsErrorX: requiredElement(root, "#rms-error-x"),
      rmsErrorY: requiredElement(root, "#rms-error-y"),
      rmsErrorZ: requiredElement(root, "#rms-error-z"),
      rmsReferenceX: requiredElement(root, "#rms-reference-x"),
      rmsReferenceY: requiredElement(root, "#rms-reference-y"),
      rmsReferenceZ: requiredElement(root, "#rms-reference-z"),
    });
  }

  public render(snapshot: LiveMathSnapshot): void {
    const { hasAnalysis, harmonicPairs, sampleCount, error, closure } = snapshot;
    const closureTex = String.raw`\color{${VISUAL_PALETTE.closure.css}}{g}=\lVert\color{${VISUAL_PALETTE.raw.css}}{\mathbf p_{L-1}}-\color{${VISUAL_PALETTE.raw.css}}{\mathbf p_0}\rVert_2=\sqrt{\color{${VISUAL_PALETTE.axisX.css}}{(\Delta x)^2}+\color{${VISUAL_PALETTE.axisY.css}}{(\Delta y)^2}+\color{${VISUAL_PALETTE.axisZ.css}}{(\Delta z)^2}}`;
    const periodicTex = String.raw`\widehat{\mathbf p}_{\color{${VISUAL_PALETTE.reconstruction.css}}{M}}(t_j)=\sum_{k=-\color{${VISUAL_PALETTE.reconstruction.css}}{M}}^{\color{${VISUAL_PALETTE.reconstruction.css}}{M}}\mathbf c_k e^{i2\pi k t_j},\quad t_j=\frac{j}{\color{${VISUAL_PALETTE.raw.css}}{N}}`;
    const rmsTex = String.raw`\begin{aligned}\color{${VISUAL_PALETTE.residual.css}}{\operatorname{NRMSE}}_{\color{${VISUAL_PALETTE.reconstruction.css}}{M}}&=\frac{\operatorname{RMS}(\color{${VISUAL_PALETTE.reconstruction.css}}{\widehat{\mathbf p}}-\color{${VISUAL_PALETTE.raw.css}}{\mathbf p})}{\operatorname{RMS}(\color{${VISUAL_PALETTE.raw.css}}{\mathbf p})}\\&=\frac{\sqrt{\frac{1}{N}\sum_j\lVert\color{${VISUAL_PALETTE.reconstruction.css}}{\widehat{\mathbf p}_j}-\color{${VISUAL_PALETTE.raw.css}}{\mathbf p_j}\rVert_2^2}}{\sqrt{\frac{1}{N}\sum_j\lVert\color{${VISUAL_PALETTE.raw.css}}{\mathbf p_j}\rVert_2^2}}\\&=\sqrt{\frac{\sum_j\lVert\color{${VISUAL_PALETTE.reconstruction.css}}{\widehat{\mathbf p}_j}-\color{${VISUAL_PALETTE.raw.css}}{\mathbf p_j}\rVert_2^2}{\sum_j\lVert\color{${VISUAL_PALETTE.raw.css}}{\mathbf p_j}\rVert_2^2}}\end{aligned}`;

    if (closureTex !== this.renderedClosureTex) {
      katex.render(closureTex, this.elements.closureFormula, { displayMode: true, throwOnError: false });
      this.renderedClosureTex = closureTex;
    }
    if (periodicTex !== this.renderedPeriodicTex) {
      katex.render(periodicTex, this.elements.periodicFormula, { displayMode: true, throwOnError: false });
      this.renderedPeriodicTex = periodicTex;
    }
    if (rmsTex !== this.renderedRmsTex) {
      katex.render(rmsTex, this.elements.rmsFormula, { displayMode: true, throwOnError: false });
      this.renderedRmsTex = rmsTex;
    }

    this.elements.errorSum.textContent = error ? formatCalculationValue(error.squaredErrorSum) : "—";
    this.elements.referenceSum.textContent = error ? formatCalculationValue(error.squaredReferenceSum) : "—";
    this.elements.sampleCount.textContent = error ? String(error.sampleCount) : "—";
    setChangingValue(this.elements.harmonicValue, hasAnalysis ? String(harmonicPairs) : "—");
    setChangingValue(this.elements.resolutionValue, hasAnalysis ? String(sampleCount) : "—");
    setChangingValue(this.elements.errorValue, error ? formatCalculationValue(error.normalizedRms) : "—");
    setChangingValue(this.elements.closureValue, closure ? formatCalculationValue(closure.gap) : "—");
    setChangingValue(this.elements.closureDeltaX, closure ? formatCalculationValue(closure.delta.x) : "—");
    setChangingValue(this.elements.closureDeltaY, closure ? formatCalculationValue(closure.delta.y) : "—");
    setChangingValue(this.elements.closureDeltaZ, closure ? formatCalculationValue(closure.delta.z) : "—");
    setChangingValue(this.elements.rmsErrorX, error ? formatCalculationValue(error.squaredErrorByAxis.x) : "—");
    setChangingValue(this.elements.rmsErrorY, error ? formatCalculationValue(error.squaredErrorByAxis.y) : "—");
    setChangingValue(this.elements.rmsErrorZ, error ? formatCalculationValue(error.squaredErrorByAxis.z) : "—");
    setChangingValue(this.elements.rmsReferenceX, error ? formatCalculationValue(error.squaredReferenceByAxis.x) : "—");
    setChangingValue(this.elements.rmsReferenceY, error ? formatCalculationValue(error.squaredReferenceByAxis.y) : "—");
    setChangingValue(this.elements.rmsReferenceZ, error ? formatCalculationValue(error.squaredReferenceByAxis.z) : "—");
  }
}

function requiredElement(root: ParentNode, selector: string): HTMLElement {
  const element = root.querySelector<HTMLElement>(selector);
  if (!element) {
    throw new Error(`The live math panel is missing ${selector}.`);
  }
  return element;
}

function setChangingValue(element: HTMLElement, value: string): void {
  if (element.textContent === value) {
    return;
  }
  element.textContent = value;
  element.classList.remove("value-changed");
  element.getBoundingClientRect();
  element.classList.add("value-changed");
}

export function formatCalculationValue(value: number): string {
  if (!Number.isFinite(value)) {
    return value === Number.POSITIVE_INFINITY ? "∞" : "—";
  }
  if (value === 0) {
    return "0";
  }
  return Math.abs(value) >= 1_000 || Math.abs(value) < 0.001
    ? value.toExponential(3)
    : value.toFixed(4);
}

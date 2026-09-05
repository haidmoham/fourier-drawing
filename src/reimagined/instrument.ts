import {
  chain,
  exampleCurve,
  reconstruct,
  resampleClosed,
  transform,
  type Harmonic,
  type Point,
} from "./engine";

export type InstrumentState = Readonly<{
  terms: number;
  maxTerms: number;
  phase: number;
  playing: boolean;
  drawing: boolean;
  error: number;
  harmonics: Harmonic[];
  selected: number | null;
  hasDrawing: boolean;
}>;

type Mode = "draw" | "explore";
type Panel = Readonly<{ x: number; y: number; width: number; height: number }>;

const COLORS = ["#c2b39c", "#ff7557", "#6c9df5", "#b1c35d", "#c49bda", "#e2aa52", "#56bdad"];
const PAPER = "#f5f1e8";
const TAU = Math.PI * 2;
const SAMPLE_COUNT = 256;

/**
 * A small Canvas renderer around the pure Fourier functions.  The type-only
 * imports above disappear after TypeScript checks this file; at runtime the
 * browser only receives the math functions and this event-driven controller.
 */
export class Instrument {
  private readonly context: CanvasRenderingContext2D;
  private readonly media = window.matchMedia("(prefers-reduced-motion: reduce)");
  private readonly onPointerDown = (event: PointerEvent): void => this.beginStroke(event);
  private readonly onPointerMove = (event: PointerEvent): void => this.extendStroke(event);
  private readonly onPointerUp = (event: PointerEvent): void => this.finishStroke(event);
  private readonly onWindowResize = (): void => this.resize();
  private source: Point[] = [];
  private sourceIsOpen = false;
  private sampled: Point[] = [];
  private harmonics: Harmonic[] = [];
  private reconstructionLoop: Point[] = [];
  private errorValue = 0;
  private terms = 0;
  private phase = 0;
  private speed = 0.11;
  private playing = false;
  private drawing = false;
  private mode: Mode = "explore";
  private selected: number | null = null;
  private activePointer: number | null = null;
  private pendingStroke: Point[] = [];
  private frame = 0;
  private previousFrameTime = 0;
  private pixelRatio = 1;
  private width = 1;
  private height = 1;

  public constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onChange: (state: InstrumentState) => void,
  ) {
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas 2D is required for the Fourier instrument.");
    }
    this.context = context;
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
    window.addEventListener("resize", this.onWindowResize);
    this.resize();
    this.clear();
  }

  public setTerms(count: number): void {
    this.terms = this.clampTerms(count);
    this.selected = this.selected !== null && this.selected >= this.terms ? null : this.selected;
    this.cacheApproximation();
    this.render();
    this.emit();
  }

  public setPhase(phase: number): void {
    this.playing = false;
    this.phase = periodic(phase);
    this.render();
    this.emit();
  }

  public togglePlay(): void {
    this.playing = !this.playing;
    if (this.playing) this.startAnimation();
    this.render();
    this.emit();
  }

  public setSpeed(speed: number): void {
    if (Number.isFinite(speed)) this.speed = Math.min(4, Math.max(.25, speed)) * .11;
  }

  public setSelected(index: number | null): void {
    this.selected = index !== null && index >= 0 && index < this.terms ? index : null;
    this.render();
    this.emit();
  }

  public setMode(mode: Mode): void {
    this.mode = mode;
    if (mode === "draw") this.playing = false;
    this.render();
    this.emit();
  }

  public loadExample(name: "orbit" | "flower" | "heart"): void {
    this.mode = "explore";
    this.source = exampleCurve(name, SAMPLE_COUNT);
    this.sourceIsOpen = false;
    this.analyzeSource();
    this.terms = this.clampTerms(6);
    this.cacheApproximation();
    this.selected = null;
    this.render();
    this.emit();
  }

  public clear(): void {
    this.playing = false;
    this.source = [];
    this.sourceIsOpen = false;
    this.sampled = [];
    this.harmonics = [];
    this.reconstructionLoop = [];
    this.errorValue = 0;
    this.terms = 0;
    this.phase = 0;
    this.selected = null;
    this.pendingStroke = [];
    this.mode = "draw";
    this.render();
    this.emit();
  }

  public resize(): void {
    const bounds = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, bounds.width || this.canvas.clientWidth || 1);
    this.height = Math.max(1, bounds.height || this.canvas.clientHeight || 1);
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * this.pixelRatio);
    this.canvas.height = Math.round(this.height * this.pixelRatio);
    this.context.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    this.render();
  }

  public dispose(): void {
    cancelAnimationFrame(this.frame);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
    window.removeEventListener("resize", this.onWindowResize);
  }

  private startAnimation(): void {
    if (this.frame) return;
    this.previousFrameTime = 0;
    this.frame = requestAnimationFrame((time) => this.animate(time));
  }

  private animate(time: number): void {
    this.frame = 0;
    if (!this.playing) return;
    if (this.previousFrameTime) {
      const elapsedSeconds = Math.min(0.08, Math.max(0, time - this.previousFrameTime) / 1000);
      this.phase = periodic(this.phase + elapsedSeconds * this.speed);
    }
    this.previousFrameTime = time;
    this.render();
    // The parent may use this high-frequency update only for its phase readout.
    this.emit();
    this.frame = requestAnimationFrame((nextTime) => this.animate(nextTime));
  }

  private beginStroke(event: PointerEvent): void {
    if (event.button !== 0 || this.drawing || this.mode !== "draw" || !this.inSourcePanel(event)) return;
    event.preventDefault();
    this.playing = false;
    this.drawing = true;
    this.activePointer = event.pointerId;
    this.pendingStroke = [this.pointFromEvent(event)];
    this.canvas.setPointerCapture(event.pointerId);
    this.render();
    this.emit();
  }

  private extendStroke(event: PointerEvent): void {
    if (!this.drawing || event.pointerId !== this.activePointer) return;
    const point = this.pointFromEvent(event);
    const last = this.pendingStroke.at(-1);
    if (!last || Math.hypot(point.x - last.x, point.y - last.y) > 0.009) {
      this.pendingStroke.push(point);
      this.render();
    }
  }

  private finishStroke(event: PointerEvent): void {
    if (!this.drawing || event.pointerId !== this.activePointer) return;
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    this.drawing = false;
    this.activePointer = null;
    if (this.pendingStroke.length >= 3) {
      this.source = normalize(this.pendingStroke);
      this.sourceIsOpen = true;
      this.analyzeSource();
      this.terms = this.clampTerms(6);
      this.cacheApproximation();
      this.phase = 0;
      this.selected = null;
      this.mode = "explore";
      if (!this.media.matches) {
        this.playing = true;
        this.startAnimation();
      }
    }
    this.pendingStroke = [];
    this.render();
    this.emit();
  }

  private analyzeSource(): void {
    this.sampled = resampleClosed(this.source, SAMPLE_COUNT);
    this.harmonics = transform(this.sampled);
    this.cacheApproximation();
  }

  private cacheApproximation(): void {
    if (!this.sampled.length || !this.terms) {
      this.reconstructionLoop = [];
      this.errorValue = 0;
      return;
    }
    this.reconstructionLoop = this.reconstructionSamples(193, 1);
    let approximationDistance = 0;
    let sourceDistance = 0;
    const center = reconstruct(this.harmonics, 1, 0);
    for (let index = 0; index < this.sampled.length; index += 1) {
      const actual = this.sampled[index];
      const approximation = reconstruct(this.harmonics, this.terms, index / this.sampled.length);
      approximationDistance += (actual.x - approximation.x) ** 2 + (actual.y - approximation.y) ** 2;
      sourceDistance += (actual.x - center.x) ** 2 + (actual.y - center.y) ** 2;
    }
    this.errorValue = sourceDistance > 0 ? Math.sqrt(approximationDistance / sourceDistance) : 0;
  }

  private state(): InstrumentState {
    return {
      terms: this.terms,
      maxTerms: this.harmonics.length,
      phase: this.phase,
      playing: this.playing,
      drawing: this.drawing,
      error: this.errorValue,
      harmonics: this.harmonics,
      selected: this.selected,
      hasDrawing: this.source.length > 0,
    };
  }

  private emit(): void {
    this.onChange(this.state());
  }

  private render(): void {
    const ctx = this.context;
    ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, this.width, this.height);
    const [sourcePanel, sumPanel] = this.panels();
    this.drawSource(sourcePanel);
    if (this.source.length) this.drawChain(sumPanel);
    this.drawEndpointBridge(sourcePanel, sumPanel);
  }

  private panels(): [Panel, Panel] {
    if (!this.source.length) {
      const whole = { x: 14, y: 14, width: Math.max(1, this.width - 28), height: Math.max(1, this.height - 28) };
      return [whole, whole];
    }
    const inset = this.width >= 650 ? 18 : 14;
    const gap = this.width >= 650 ? 18 : 14;
    if (this.width >= 650) {
      const panelWidth = Math.max(1, (this.width - inset * 2 - gap) / 2);
      return [
        { x: inset, y: inset, width: panelWidth, height: Math.max(1, this.height - inset * 2) },
        { x: inset + panelWidth + gap, y: inset, width: panelWidth, height: Math.max(1, this.height - inset * 2) },
      ];
    }
    const panelHeight = Math.max(1, (this.height - inset * 2 - gap) / 2);
    return [
      { x: inset, y: inset, width: Math.max(1, this.width - inset * 2), height: panelHeight },
      { x: inset, y: inset + panelHeight + gap, width: Math.max(1, this.width - inset * 2), height: panelHeight },
    ];
  }

  private drawSource(panel: Panel): void {
    const ctx = this.context;
    this.drawPanelGround(panel, this.source.length ? "your curve" : "");
    const scale = this.curveScale(panel);
    if (!this.source.length && !this.drawing) {
      ctx.fillStyle = "rgba(37,34,30,.56)";
      ctx.font = `italic ${Math.min(86, panel.width * .13)}px "DM Serif Display", Georgia, serif`;
      ctx.fillStyle = "#e34c29";
      ctx.textAlign = "center";
      ctx.fillText("draw on me.", panel.x + panel.width / 2, panel.y + panel.height / 2 - 3);
      ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillStyle = "#77786c";
      ctx.fillText("press, drag, let go.", panel.x + panel.width / 2, panel.y + panel.height / 2 + 30);
      return;
    }
    if (this.source.length) {
      this.strokePath(this.source, panel, scale, "rgba(37,34,30,.24)", 1.4);
      if (this.sourceIsOpen) this.dashedSeam(this.source, panel, scale);
    }
    if (this.harmonics.length) {
      this.strokePath(this.reconstructionLoop, panel, scale, "rgba(71,116,191,.17)", 1.1);
      this.strokePartialPath(this.reconstructionLoop, panel, scale, Math.max(1, Math.ceil(this.phase * (this.reconstructionLoop.length - 1))), COLORS[1], 2.2);
      const endpoint = reconstruct(this.harmonics, this.terms, this.phase);
      const projected = project(endpoint, panel, scale);
      ctx.fillStyle = COLORS[1];
      ctx.beginPath();
      ctx.arc(projected.x, projected.y, 4.3, 0, TAU);
      ctx.fill();
    }
    if (this.drawing && this.pendingStroke.length > 1) {
      this.strokePath(this.pendingStroke, panel, scale, COLORS[0], 2.2);
    }
  }

  private drawChain(panel: Panel): void {
    const ctx = this.context;
    this.drawPanelGround(panel, "the moving sum", true);
    if (!this.harmonics.length) {
      ctx.fillStyle = "rgba(245,241,232,.64)";
      ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textAlign = "center";
      ctx.fillText("waves will appear here", panel.x + panel.width / 2, panel.y + panel.height / 2 + 4);
      return;
    }
    const endpoints = chain(this.harmonics, this.terms, this.phase);
    const scale = this.chainScale(panel);
    const center = { x: panel.x + panel.width / 2, y: panel.y + panel.height / 2 };
    this.strokeCenteredPath(this.reconstructionLoop, center, scale, "rgba(196,222,255,.27)", 1.15);
    ctx.lineCap = "round";
    for (let index = 0; index < this.terms; index += 1) {
      const start = endpoints[index];
      const end = endpoints[index + 1];
      const harmonic = this.harmonics[index];
      const color = COLORS[index % COLORS.length];
      const focus = this.selected === null || this.selected === index;
      const alpha = focus ? 0.94 : 0.16;
      const origin = { x: center.x + start.x * scale, y: center.y - start.y * scale };
      const point = { x: center.x + end.x * scale, y: center.y - end.y * scale };
      if (harmonic.frequency !== 0) {
        ctx.strokeStyle = withAlpha(color, focus ? .68 : .22);
        ctx.lineWidth = focus ? 1.2 : 0.9;
        ctx.beginPath();
        ctx.arc(origin.x, origin.y, harmonic.amplitude * scale, 0, TAU);
        ctx.stroke();
      }
      ctx.strokeStyle = withAlpha(color, alpha);
      ctx.lineWidth = focus ? 2.15 : 1.15;
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
      ctx.fillStyle = withAlpha(color, alpha);
      ctx.beginPath();
      ctx.arc(point.x, point.y, focus ? 2.7 : 1.6, 0, TAU);
      ctx.fill();
      if (this.selected === index) {
        ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = point.x > center.x ? "left" : "right";
        ctx.fillText(`f ${signed(harmonic.frequency)}`, point.x + (point.x > center.x ? 8 : -8), point.y - 8);
      }
    }
    const end = endpoints.at(-1) ?? { x: 0, y: 0 };
    ctx.fillStyle = COLORS[1];
    ctx.beginPath();
    ctx.arc(center.x + end.x * scale, center.y - end.y * scale, 4.4, 0, TAU);
    ctx.fill();
  }

  private drawPanelGround(panel: Panel, label: string, dark = false): void {
    const ctx = this.context;
    const ground = dark ? "#292c29" : "rgba(255,255,255,.24)";
    const line = dark ? "rgba(245,241,232,.17)" : "rgba(37,34,30,.09)";
    const axis = dark ? "rgba(245,241,232,.11)" : "rgba(37,34,30,.07)";
    const dot = dark ? "rgba(245,241,232,.22)" : "rgba(37,34,30,.13)";
    const text = dark ? "rgba(245,241,232,.78)" : "rgba(37,34,30,.66)";
    ctx.fillStyle = ground;
    ctx.fillRect(panel.x, panel.y, panel.width, panel.height);
    ctx.strokeStyle = line;
    ctx.lineWidth = 1;
    ctx.strokeRect(panel.x + .5, panel.y + .5, panel.width - 1, panel.height - 1);
    const centerX = panel.x + panel.width / 2;
    const centerY = panel.y + panel.height / 2;
    ctx.strokeStyle = axis;
    ctx.beginPath();
    ctx.moveTo(panel.x + 12, centerY + .5);
    ctx.lineTo(panel.x + panel.width - 12, centerY + .5);
    ctx.moveTo(centerX + .5, panel.y + 12);
    ctx.lineTo(centerX + .5, panel.y + panel.height - 12);
    ctx.stroke();
    ctx.fillStyle = dot;
    for (let horizontal = 1; horizontal < 7; horizontal += 1) {
      for (let vertical = 1; vertical < 6; vertical += 1) {
        ctx.beginPath();
        ctx.arc(panel.x + (panel.width * horizontal) / 7, panel.y + (panel.height * vertical) / 6, .85, 0, TAU);
        ctx.fill();
      }
    }
    ctx.fillStyle = text;
    ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "left";
    ctx.fillText(label, panel.x + 12, panel.y + 19);
  }

  private strokePath(points: readonly Point[], panel: Panel, scale: number, color: string, width: number): void {
    if (points.length < 2) return;
    const ctx = this.context;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    const first = project(points[0], panel, scale);
    ctx.moveTo(first.x, first.y);
    for (let index = 1; index < points.length; index += 1) {
      const point = project(points[index], panel, scale);
      ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();
  }

  private strokePartialPath(points: readonly Point[], panel: Panel, scale: number, end: number, color: string, width: number): void {
    if (points.length < 2) return;
    const ctx = this.context;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    const first = project(points[0], panel, scale);
    ctx.moveTo(first.x, first.y);
    for (let index = 1; index <= end; index += 1) {
      const point = project(points[Math.min(index, points.length - 1)], panel, scale);
      ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();
  }

  private strokeCenteredPath(points: readonly Point[], center: Point, scale: number, color: string, width: number): void {
    if (points.length < 2) return;
    const ctx = this.context;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(center.x + points[0].x * scale, center.y - points[0].y * scale);
    for (let index = 1; index < points.length; index += 1) {
      ctx.lineTo(center.x + points[index].x * scale, center.y - points[index].y * scale);
    }
    ctx.stroke();
  }

  private drawEndpointBridge(sourcePanel: Panel, sumPanel: Panel): void {
    if (!this.harmonics.length) return;
    const endpoint = reconstruct(this.harmonics, this.terms, this.phase);
    const source = project(endpoint, sourcePanel, this.curveScale(sourcePanel));
    const sumScale = this.chainScale(sumPanel);
    const sum = { x: sumPanel.x + sumPanel.width / 2 + endpoint.x * sumScale, y: sumPanel.y + sumPanel.height / 2 - endpoint.y * sumScale };
    const ctx = this.context;
    ctx.strokeStyle = "rgba(108,157,245,.28)";
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 5]);
    ctx.beginPath();
    ctx.moveTo(source.x, source.y);
    ctx.lineTo(sum.x, sum.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private dashedSeam(points: readonly Point[], panel: Panel, scale: number): void {
    if (points.length < 2) return;
    const ctx = this.context;
    const first = project(points[0], panel, scale);
    const last = project(points.at(-1)!, panel, scale);
    ctx.strokeStyle = "rgba(37,34,30,.34)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(first.x, first.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private reconstructionSamples(count: number, endPhase: number): Point[] {
    return Array.from({ length: count }, (_, index) => reconstruct(this.harmonics, this.terms, (index * endPhase) / Math.max(1, count - 1)));
  }

  private curveScale(panel: Panel): number {
    if (!this.source.length) return Math.min(panel.width, panel.height) * .38;
    const extent = Math.max(.7, ...this.source.flatMap((point) => [Math.abs(point.x), Math.abs(point.y)]));
    return Math.min(panel.width, panel.height) * .38 / extent;
  }

  private chainScale(panel: Panel): number {
    const radius = this.harmonics.slice(0, this.terms).reduce((total, harmonic) => total + harmonic.amplitude, 0);
    return Math.min(panel.width, panel.height) * .37 / Math.max(.35, radius);
  }

  private pointFromEvent(event: PointerEvent): Point {
    const bounds = this.canvas.getBoundingClientRect();
    const [panel] = this.panels();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    const localX = (x - panel.x - panel.width / 2) / (Math.min(panel.width, panel.height) * .38);
    const localY = -(y - panel.y - panel.height / 2) / (Math.min(panel.width, panel.height) * .38);
    return { x: Math.max(-1.2, Math.min(1.2, localX)), y: Math.max(-1.2, Math.min(1.2, localY)) };
  }

  private inSourcePanel(event: PointerEvent): boolean {
    const bounds = this.canvas.getBoundingClientRect();
    const [panel] = this.panels();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    return x >= panel.x && x <= panel.x + panel.width && y >= panel.y && y <= panel.y + panel.height;
  }

  private clampTerms(count: number): number {
    if (!this.harmonics.length) return 0;
    return Math.min(this.harmonics.length, Math.max(1, Math.round(Number.isFinite(count) ? count : 1)));
  }
}

function project(point: Point, panel: Panel, scale: number): Point {
  return { x: panel.x + panel.width / 2 + point.x * scale, y: panel.y + panel.height / 2 - point.y * scale };
}

function normalize(points: readonly Point[]): Point[] {
  const total = points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
  const centerX = total.x / points.length;
  const centerY = total.y / points.length;
  const extent = Math.max(.001, ...points.map((point) => Math.max(Math.abs(point.x - centerX), Math.abs(point.y - centerY))));
  return points.map((point) => ({ x: (point.x - centerX) * .88 / extent, y: (point.y - centerY) * .88 / extent }));
}

function periodic(value: number): number {
  return Number.isFinite(value) ? value - Math.floor(value) : 0;
}

function withAlpha(hex: string, alpha: number): string {
  const bounded = Math.round(Math.min(1, Math.max(0, alpha)) * 255).toString(16).padStart(2, "0");
  return `${hex}${bounded}`;
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

import * as THREE from "three";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import type { Vec3 } from "../domain";
import type { CurveContact } from "./curve-contact";
import { traceStrengthAfterFade } from "./source-trace";
import { VISUAL_PALETTE } from "./visual-palette";

export const SOURCE_CORE_OPACITY = 0.8;

/** Raw-curve tuning lives here so visual iteration does not touch scene behavior. */
export const SOURCE_AURORA_TUNING = {
  cycleDurationMs: 56_000,
  breathDurationMs: 12_000,
  contactColorExponent: 2.8,
  contactGlowWidth: 0.055,
  opacityBreathDepth: 0.16,
  traceFadeMs: 600,
  widthBreathDepth: 0.05,
  spatialCycles: 0.62,
  layers: [
    {
      lineWidth: 24,
      opacity: 0.22,
      phaseOffset: 0,
      reactsToContact: true,
      renderOrder: 19,
      restingChroma: 0,
      restingTarget: "surface",
    },
    {
      lineWidth: 12,
      opacity: 0.46,
      phaseOffset: 0.075,
      reactsToContact: true,
      renderOrder: 20,
      restingChroma: 0,
      restingTarget: "surface",
    },
    {
      lineWidth: 5.6,
      opacity: 0.96,
      phaseOffset: 0.035,
      reactsToContact: true,
      renderOrder: 25,
      restingChroma: 0,
      restingTarget: "raw",
    },
  ],
  // One ordered pigment ring is shared by the probe and its deposited trace.
  pigmentRing: [0xec5848, 0xf4c41c, 0x22a589, 0x12bcca, 0x2a48da, 0xb81eae],
} as const;

type AuraGeometryBinding = {
  readonly buffer: THREE.InterleavedBuffer;
  readonly layerIndex: number;
  readonly pointColors: Float32Array;
};

export class SourceAurora {
  public readonly materials: readonly LineMaterial[];

  private readonly pigments = SOURCE_AURORA_TUNING.pigmentRing.map((value) => new THREE.Color(value));
  private readonly activePigment = new THREE.Color();
  private readonly cursorColor = new THREE.Color();
  private readonly rawColor = new THREE.Color(VISUAL_PALETTE.raw.three);
  private readonly surfaceColor = new THREE.Color(0xf3f1e9);
  private readonly mixedColor = new THREE.Color();
  private readonly reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  private geometryBindings: readonly AuraGeometryBinding[] = [];
  private lastUpdateMs: number | null = null;
  private pathPositions: Float32Array<ArrayBufferLike> = new Float32Array();
  private traceColors: Float32Array<ArrayBufferLike> = new Float32Array();
  private traceStrengths: Float32Array<ArrayBufferLike> = new Float32Array();

  public constructor() {
    this.materials = SOURCE_AURORA_TUNING.layers.map(({ lineWidth, opacity }) => new LineMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      opacity,
      linewidth: lineWidth,
      depthTest: false,
      depthWrite: false,
    }));
  }

  public setGeometries(geometries: readonly LineGeometry[], points: readonly Vec3[]): void {
    const pointCount = points.length;
    this.geometryBindings = geometries.map((geometry, layerIndex) => {
      const pointColors = new Float32Array(pointCount * 3);
      geometry.setColors(pointColors);
      const colorStart = geometry.getAttribute("instanceColorStart");
      if (!(colorStart instanceof THREE.InterleavedBufferAttribute)) {
        throw new TypeError("Source aura geometry is missing interleaved vertex colors.");
      }
      return { buffer: colorStart.data, layerIndex, pointColors };
    });
    this.pathPositions = normalizedArcPositions(points);
    this.traceColors = new Float32Array(pointCount * 3);
    this.traceStrengths = new Float32Array(pointCount);
    this.lastUpdateMs = null;
  }

  public clearGeometries(): void {
    this.geometryBindings = [];
    this.lastUpdateMs = null;
    this.pathPositions = new Float32Array();
    this.traceColors = new Float32Array();
    this.traceStrengths = new Float32Array();
  }

  public update(timestampMs: number, contact: CurveContact | null, carrierPhase: number | null): void {
    const motionEnabled = !this.reducedMotion.matches;
    const basePhase = this.reducedMotion.matches
      ? 0
      : (timestampMs % SOURCE_AURORA_TUNING.cycleDurationMs) / SOURCE_AURORA_TUNING.cycleDurationMs;
    const breathWave = motionEnabled
      ? Math.sin((timestampMs / SOURCE_AURORA_TUNING.breathDurationMs) * Math.PI * 2)
      : 0;
    colorAtPhase(this.pigments, carrierPhase ?? basePhase, this.activePigment);
    const traceActivity = this.updateTrace(timestampMs, contact, this.activePigment);
    this.materials.forEach((material, layerIndex) => {
      const layer = SOURCE_AURORA_TUNING.layers[layerIndex];
      const contactBoost = layer.reactsToContact ? 1 + traceActivity * 0.75 : 1;
      material.opacity = Math.min(1, layer.opacity
        * (1 + breathWave * SOURCE_AURORA_TUNING.opacityBreathDepth)
        * contactBoost);
      material.linewidth = layer.lineWidth * (1 + breathWave * SOURCE_AURORA_TUNING.widthBreathDepth);
    });
    this.geometryBindings.forEach(({ buffer, layerIndex, pointColors }) => {
      const layer = SOURCE_AURORA_TUNING.layers[layerIndex];
      const pointCount = pointColors.length / 3;
      for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
        const response = layer.reactsToContact
          ? amplifyContactColor(this.traceStrengths[pointIndex] ?? 0)
          : 0;
        const chroma = THREE.MathUtils.lerp(layer.restingChroma, 1, response);
        const color = this.mixedColor.fromArray(this.traceColors, pointIndex * 3);
        const restingTarget = layer.restingTarget === "raw" ? this.rawColor : this.surfaceColor;
        color.lerp(restingTarget, 1 - chroma);
        color.toArray(pointColors, pointIndex * 3);
      }
      // SAFETY: LineGeometry.setColors always creates this buffer as a Float32Array.
      copyPointColorsToSegments(pointColors, buffer.array as Float32Array);
      buffer.needsUpdate = true;
    });
    const cursorLayer = SOURCE_AURORA_TUNING.layers[1] ?? SOURCE_AURORA_TUNING.layers[0];
    colorAtPhase(
      this.pigments,
      basePhase + SOURCE_AURORA_TUNING.spatialCycles + cursorLayer.phaseOffset,
      this.cursorColor,
    );
  }

  public copyCursorColor(target: THREE.Color): void {
    target.copy(this.cursorColor);
  }

  public copyActivePigment(target: THREE.Color): void {
    target.copy(this.activePigment);
  }

  public setResolution(resolution: THREE.Vector2): void {
    this.materials.forEach((material) => material.resolution.copy(resolution));
  }

  public dispose(): void {
    this.materials.forEach((material) => material.dispose());
  }

  private updateTrace(timestampMs: number, contact: CurveContact | null, pigment: THREE.Color): number {
    const elapsedMs = this.lastUpdateMs === null ? 0 : Math.max(0, timestampMs - this.lastUpdateMs);
    let activity = 0;
    for (let pointIndex = 0; pointIndex < this.traceStrengths.length; pointIndex += 1) {
      let strength = traceStrengthAfterFade(
        this.traceStrengths[pointIndex],
        elapsedMs,
        SOURCE_AURORA_TUNING.traceFadeMs,
      );
      const pathPosition = this.pathPositions[pointIndex] ?? 0;
      for (const interval of contact?.intervals ?? []) {
        const distance = distanceToInterval(pathPosition, interval.startPathPosition, interval.endPathPosition);
        const envelope = softEnvelope(distance, SOURCE_AURORA_TUNING.contactGlowWidth);
        const deposit = envelope * interval.strength;
        if (deposit >= strength && deposit > 0) {
          strength = deposit;
          pigment.toArray(this.traceColors, pointIndex * 3);
        }
      }
      this.traceStrengths[pointIndex] = strength;
      activity = Math.max(activity, strength);
    }
    this.lastUpdateMs = timestampMs;
    return amplifyContactColor(activity);
  }
}

function colorAtPhase(pigments: readonly THREE.Color[], phase: number, target: THREE.Color): THREE.Color {
  const position = THREE.MathUtils.euclideanModulo(phase, 1) * pigments.length;
  const fromIndex = Math.floor(position);
  const amount = THREE.MathUtils.smoothstep(position - fromIndex, 0, 1);
  return target.lerpColors(pigments[fromIndex], pigments[(fromIndex + 1) % pigments.length], amount);
}

function distanceToInterval(position: number, start: number, end: number): number {
  if (position < start) {
    return start - position;
  }
  if (position > end) {
    return position - end;
  }
  return 0;
}

function softEnvelope(distance: number, width: number): number {
  const normalizedDistance = Math.min(1, distance / width);
  return Math.cos(normalizedDistance * Math.PI * 0.5) ** 2;
}

function amplifyContactColor(strength: number): number {
  return 1 - (1 - THREE.MathUtils.clamp(strength, 0, 1)) ** SOURCE_AURORA_TUNING.contactColorExponent;
}

function normalizedArcPositions(points: readonly Vec3[]): Float32Array {
  const positions = new Float32Array(points.length);
  let totalLength = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    totalLength += Math.hypot(current.x - previous.x, current.y - previous.y, current.z - previous.z);
    positions[index] = totalLength;
  }
  if (totalLength > 0) {
    for (let index = 1; index < positions.length; index += 1) {
      positions[index] /= totalLength;
    }
  }
  return positions;
}

function copyPointColorsToSegments(pointColors: Float32Array, segmentColors: Float32Array): void {
  const segmentCount = Math.max(0, pointColors.length / 3 - 1);
  for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
    const pointOffset = segmentIndex * 3;
    const segmentOffset = segmentIndex * 6;
    segmentColors[segmentOffset] = pointColors[pointOffset];
    segmentColors[segmentOffset + 1] = pointColors[pointOffset + 1];
    segmentColors[segmentOffset + 2] = pointColors[pointOffset + 2];
    segmentColors[segmentOffset + 3] = pointColors[pointOffset + 3];
    segmentColors[segmentOffset + 4] = pointColors[pointOffset + 4];
    segmentColors[segmentOffset + 5] = pointColors[pointOffset + 5];
  }
}

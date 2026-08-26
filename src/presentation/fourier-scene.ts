import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import type { Vec3 } from "../domain";
import { curveContactAtPoint } from "./curve-contact";
import { harmonicPhaseAt } from "./harmonic-motion";
import { ReconstructionProbe } from "./reconstruction-probe";
import { SourceAurora, SOURCE_AURORA_TUNING, SOURCE_CORE_OPACITY } from "./source-aurora";
import { VISUAL_PALETTE } from "./visual-palette";

const GRID_EXTENT = 160;
const TIP_CONTACT_RADIUS = 0.14;

type ReconstructionMotion = Readonly<{
  phase: number;
  position: Vec3;
}>;

/** Renders only source data and state-derived reconstruction motion. */
export class FourierScene {
  public readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly instrument = new THREE.Group();
  private readonly gridLayer = new THREE.Group();
  private readonly pathLayer = new THREE.Group();
  private readonly gridGeometry = new THREE.PlaneGeometry(GRID_EXTENT, GRID_EXTENT);
  private readonly gridMaterials: THREE.ShaderMaterial[] = [];
  private readonly sourceAurora = new SourceAurora();
  private readonly sourceMaterial = new LineMaterial({
    color: VISUAL_PALETTE.raw.three,
    transparent: true,
    opacity: SOURCE_CORE_OPACITY,
    linewidth: 2.1,
    depthTest: false,
    depthWrite: false,
  });
  private readonly reconstructionHaloMaterial = new LineMaterial({
    color: VISUAL_PALETTE.halo.three,
    transparent: true,
    opacity: 0.045,
    linewidth: 5,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
  });
  private readonly reconstructionCoreMaterial = new LineMaterial({
    color: VISUAL_PALETTE.reconstruction.three,
    transparent: true,
    opacity: 0.2,
    linewidth: 1.45,
    depthTest: false,
    depthWrite: false,
  });
  private readonly cursorGeometry = new THREE.SphereGeometry(0.035, 12, 8);
  private readonly cursorMaterial = new THREE.MeshBasicMaterial({ color: VISUAL_PALETTE.raw.three });
  private readonly cursor = new THREE.Mesh(this.cursorGeometry, this.cursorMaterial);
  private readonly probe = new ReconstructionProbe(TIP_CONTACT_RADIUS);
  private readonly probePigment = new THREE.Color();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2();
  private readonly drawingPlane = new THREE.Plane();
  private readonly planePoint = new THREE.Vector3();
  private readonly planeNormal = new THREE.Vector3();
  private readonly rayHit = new THREE.Vector3();
  private readonly lineResolution = new THREE.Vector2();
  private sourceAuraLines: Line2[] = [];
  private rawPoints: readonly Vec3[] = [];
  private rawLine: Line2 | null = null;
  private reconstructionHalo: Line2 | null = null;
  private reconstructionCore: Line2 | null = null;
  private reconstructionPoints: readonly Vec3[] = [];
  private reconstructionVisible = false;

  public constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly mount: HTMLElement,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.scene.add(this.instrument);
    this.instrument.add(this.gridLayer, this.pathLayer);
    this.addGraphPlanes();
    this.cursor.visible = false;
    this.cursor.renderOrder = 26;
    this.pathLayer.add(this.cursor, this.probe.object);
  }

  public setDrawingPlaneFromCamera(anchor: Vec3): void {
    this.camera.updateMatrixWorld();
    this.instrument.updateMatrixWorld(true);
    this.planePoint.set(anchor.x, anchor.y, anchor.z);
    this.instrument.localToWorld(this.planePoint);
    this.camera.getWorldDirection(this.planeNormal);
    this.drawingPlane.setFromNormalAndCoplanarPoint(this.planeNormal, this.planePoint);
  }

  public pointFromPointer(event: PointerEvent, fallback: Vec3): Vec3 {
    const bounds = this.canvas.getBoundingClientRect();
    const width = Math.max(1, bounds.width);
    const height = Math.max(1, bounds.height);
    this.pointerNdc.set(
      ((event.clientX - bounds.left) / width) * 2 - 1,
      -((event.clientY - bounds.top) / height) * 2 + 1,
    );
    this.camera.updateMatrixWorld();
    this.instrument.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const intersection = this.raycaster.ray.intersectPlane(this.drawingPlane, this.rayHit);
    if (!intersection) {
      return fallback;
    }
    const localHit = this.instrument.worldToLocal(this.rayHit.clone());
    return { x: localHit.x, y: localHit.y, z: localHit.z };
  }

  public updateRawPath(samples: readonly Vec3[], cursorPosition: Vec3, isDrawing: boolean): void {
    this.removeRawPath();
    if (!samples.length) {
      this.cursor.visible = false;
      return;
    }
    this.rawPoints = samples.map(({ x, y, z }) => ({ x, y, z }));
    this.sourceAuraLines = this.sourceAurora.materials.map((material, index) => {
      const line = thickLine(samples, material, false);
      line.renderOrder = SOURCE_AURORA_TUNING.layers[index].renderOrder;
      return line;
    });
    this.sourceAurora.setGeometries(
      // SAFETY: thickLine constructs every line in this array with LineGeometry.
      this.sourceAuraLines.map((line) => line.geometry as LineGeometry),
      samples,
    );
    this.rawLine = thickLine(samples, this.sourceMaterial, false);
    this.rawLine.renderOrder = 24;
    this.pathLayer.add(...this.sourceAuraLines, this.rawLine);
    this.cursor.position.set(cursorPosition.x, cursorPosition.y, cursorPosition.z);
    this.cursor.visible = isDrawing;
  }

  public updateReconstruction(points: readonly Vec3[] | null): void {
    this.removeReconstruction();
    this.reconstructionPoints = points ?? [];
    this.reconstructionVisible = this.reconstructionPoints.length > 1 && hasExtent(this.reconstructionPoints);
    if (!this.reconstructionVisible) {
      return;
    }
    this.reconstructionHalo = thickLine(this.reconstructionPoints, this.reconstructionHaloMaterial, true);
    this.reconstructionHalo.renderOrder = 5;
    this.reconstructionCore = thickLine(this.reconstructionPoints, this.reconstructionCoreMaterial, true);
    this.reconstructionCore.renderOrder = 6;
    this.pathLayer.add(this.reconstructionHalo, this.reconstructionCore);
  }

  public hideCursor(): void {
    this.cursor.visible = false;
  }

  public resize(): void {
    const bounds = this.mount.getBoundingClientRect();
    const width = Math.max(1, bounds.width);
    const height = Math.max(1, bounds.height);
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.getDrawingBufferSize(this.lineResolution);
    this.updateLineResolutions();
  }

  public render(timestampMs: number): void {
    const motion = this.updateReconstructionMotion(timestampMs);
    const contact = motion
      ? curveContactAtPoint(motion.position, this.rawPoints, TIP_CONTACT_RADIUS)
      : null;
    this.sourceAurora.update(timestampMs, contact, motion?.phase ?? null);
    this.sourceAurora.copyCursorColor(this.cursorMaterial.color);
    this.sourceAurora.copyActivePigment(this.probePigment);
    this.probe.update(timestampMs, contact?.strength ?? 0, this.probePigment);
    this.renderer.render(this.scene, this.camera);
  }

  public dispose(): void {
    this.removeRawPath();
    this.removeReconstruction();
    this.gridGeometry.dispose();
    this.gridMaterials.forEach((material) => material.dispose());
    this.sourceAurora.dispose();
    this.sourceMaterial.dispose();
    this.reconstructionHaloMaterial.dispose();
    this.reconstructionCoreMaterial.dispose();
    this.cursorGeometry.dispose();
    this.cursorMaterial.dispose();
    this.probe.dispose();
    this.renderer.dispose();
  }

  private updateReconstructionMotion(now: number): ReconstructionMotion | null {
    if (!this.reconstructionVisible) {
      this.probe.setVisible(false);
      return null;
    }
    const phase = harmonicPhaseAt(now);
    const tipPosition = pointOnLoop(this.reconstructionPoints, phase);
    this.probe.setPosition(tipPosition);
    this.probe.setVisible(true);
    return { phase, position: tipPosition };
  }

  private updateLineResolutions(): void {
    this.sourceAurora.setResolution(this.lineResolution);
    this.sourceMaterial.resolution.copy(this.lineResolution);
    this.reconstructionHaloMaterial.resolution.copy(this.lineResolution);
    this.reconstructionCoreMaterial.resolution.copy(this.lineResolution);
  }

  private addGraphPlanes(): void {
    this.addGraphPlane(0, 0, 0);
    this.addGraphPlane(Math.PI / 2, 0, 0);
    this.addGraphPlane(0, Math.PI / 2, 0);
  }

  private addGraphPlane(rotationX: number, rotationY: number, rotationZ: number): void {
    const material = graphGridMaterial();
    const plane = new THREE.Mesh(this.gridGeometry, material);
    plane.rotation.set(rotationX, rotationY, rotationZ);
    plane.renderOrder = 0;
    this.gridMaterials.push(material);
    this.gridLayer.add(plane);
  }

  private removePathObject(object: Line2 | null): void {
    if (!object) {
      return;
    }
    this.pathLayer.remove(object);
    object.geometry.dispose();
  }

  private removeRawPath(): void {
    this.sourceAurora.clearGeometries();
    this.rawPoints = [];
    this.sourceAuraLines.forEach((line) => this.removePathObject(line));
    this.sourceAuraLines = [];
    this.removePathObject(this.rawLine);
    this.rawLine = null;
  }

  private removeReconstruction(): void {
    this.removePathObject(this.reconstructionHalo);
    this.removePathObject(this.reconstructionCore);
    this.reconstructionHalo = null;
    this.reconstructionCore = null;
    this.reconstructionPoints = [];
    this.reconstructionVisible = false;
    this.probe.setVisible(false);
  }
}

function graphGridMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      gridColor: { value: new THREE.Color(VISUAL_PALETTE.grid.three) },
      axisColor: { value: new THREE.Color(VISUAL_PALETTE.gridAxis.three) },
      cellSize: { value: 0.5 },
      majorCellSize: { value: 2.5 },
      fadeStart: { value: 46 },
      fadeEnd: { value: 76 },
    },
    vertexShader: `
      varying vec2 vPlanePosition;

      void main() {
        vPlanePosition = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 gridColor;
      uniform vec3 axisColor;
      uniform float cellSize;
      uniform float majorCellSize;
      uniform float fadeStart;
      uniform float fadeEnd;
      varying vec2 vPlanePosition;

      float gridLine(vec2 coordinate, float spacing) {
        vec2 distanceToLine = abs(fract(coordinate / spacing - 0.5) - 0.5);
        vec2 lineWidth = fwidth(coordinate / spacing) * 1.1;
        float xLine = 1.0 - smoothstep(0.0, lineWidth.x, distanceToLine.x);
        float yLine = 1.0 - smoothstep(0.0, lineWidth.y, distanceToLine.y);
        return max(xLine, yLine);
      }

      void main() {
        float minor = gridLine(vPlanePosition, cellSize);
        float major = gridLine(vPlanePosition, majorCellSize);
        vec2 axisWidth = max(fwidth(vPlanePosition) * 1.25, vec2(0.003));
        float horizontalAxis = 1.0 - smoothstep(0.0, axisWidth.y, abs(vPlanePosition.y));
        float verticalAxis = 1.0 - smoothstep(0.0, axisWidth.x, abs(vPlanePosition.x));
        float axis = max(horizontalAxis, verticalAxis);
        float edgeFade = 1.0 - smoothstep(fadeStart, fadeEnd, length(vPlanePosition));
        float alpha = (minor * 0.045 + major * 0.018 + axis * 0.07) * edgeFade;
        vec3 color = mix(gridColor, axisColor, clamp(axis * 0.55, 0.0, 1.0));
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
}

function thickLine(points: readonly Vec3[], material: LineMaterial, closed: boolean): Line2 {
  const geometry = new LineGeometry();
  setLinePoints(geometry, closed && points.length > 1 ? [...points, points[0]] : points);
  return new Line2(geometry, material);
}

function setLinePoints(geometry: LineGeometry, points: readonly Vec3[]): void {
  const positions: number[] = [];
  for (const point of points) {
    positions.push(point.x, point.y, point.z);
  }
  geometry.setPositions(positions);
}

function hasExtent(points: readonly Vec3[]): boolean {
  const first = points[0];
  return points.some((point) => point.x !== first.x || point.y !== first.y || point.z !== first.z);
}

function pointOnLoop(points: readonly Vec3[], phase: number): Vec3 {
  const length = points.length;
  const wrappedPhase = THREE.MathUtils.euclideanModulo(phase, 1);
  const position = wrappedPhase * length;
  const lowerIndex = Math.floor(position) % length;
  const upperIndex = (lowerIndex + 1) % length;
  const blend = position - Math.floor(position);
  const lower = points[lowerIndex];
  const upper = points[upperIndex];
  return {
    x: THREE.MathUtils.lerp(lower.x, upper.x, blend),
    y: THREE.MathUtils.lerp(lower.y, upper.y, blend),
    z: THREE.MathUtils.lerp(lower.z, upper.z, blend),
  };
}

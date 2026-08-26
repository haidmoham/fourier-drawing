import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import type { Vec3 } from "../domain";
import { VISUAL_PALETTE } from "./visual-palette";

export class FourierScene {
  public readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly instrument = new THREE.Group();
  private readonly pathLayer = new THREE.Group();
  private readonly referenceGeometries: THREE.BufferGeometry[] = [];
  private readonly cueMaterial = new THREE.LineBasicMaterial({ color: 0x8b9aa2, transparent: true, opacity: 0.2 });
  private readonly xAxisMaterial = new THREE.LineBasicMaterial({ color: VISUAL_PALETTE.axisX.three, transparent: true, opacity: 0.52 });
  private readonly yAxisMaterial = new THREE.LineBasicMaterial({ color: VISUAL_PALETTE.axisY.three, transparent: true, opacity: 0.52 });
  private readonly zAxisMaterial = new THREE.LineBasicMaterial({ color: VISUAL_PALETTE.axisZ.three, transparent: true, opacity: 0.52 });
  private readonly gridMaterial = new THREE.LineBasicMaterial({ color: 0x4c6168, transparent: true, opacity: 0.22 });
  private readonly rawMaterial = new THREE.LineBasicMaterial({ color: VISUAL_PALETTE.raw.three, transparent: true, opacity: 0.88, depthWrite: false });
  private readonly seamMaterial = new THREE.LineDashedMaterial({
    color: VISUAL_PALETTE.closure.three,
    transparent: true,
    opacity: 0.68,
    dashSize: 0.09,
    gapSize: 0.075,
    depthWrite: false,
  });
  private readonly reconstructionHaloMaterial = new LineMaterial({
    color: VISUAL_PALETTE.halo.three,
    transparent: true,
    opacity: 0.38,
    linewidth: 16,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
  });
  private readonly reconstructionCoreMaterial = new LineMaterial({
    color: VISUAL_PALETTE.reconstruction.three,
    transparent: true,
    opacity: 0.98,
    linewidth: 3.5,
    depthTest: true,
    depthWrite: false,
  });
  private readonly cursorGeometry = new THREE.SphereGeometry(0.055, 12, 8);
  private readonly cursorMaterial = new THREE.MeshBasicMaterial({ color: 0xf8e1b0 });
  private readonly cursor = new THREE.Mesh(this.cursorGeometry, this.cursorMaterial);
  private readonly endpointGeometry = new THREE.SphereGeometry(0.045, 12, 8);
  private readonly endpointMaterial = new THREE.MeshBasicMaterial({ color: VISUAL_PALETTE.raw.three });
  private readonly startEndpoint = new THREE.Mesh(this.endpointGeometry, this.endpointMaterial);
  private readonly endEndpoint = new THREE.Mesh(this.endpointGeometry, this.endpointMaterial);
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2();
  private readonly drawingPlane = new THREE.Plane();
  private readonly planePoint = new THREE.Vector3();
  private readonly planeNormal = new THREE.Vector3();
  private readonly rayHit = new THREE.Vector3();
  private readonly lineResolution = new THREE.Vector2();
  private rawLine: THREE.Line | null = null;
  private reconstructionHalo: Line2 | null = null;
  private reconstructionCore: Line2 | null = null;
  private seamLine: THREE.Line | null = null;

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
    this.renderer.toneMappingExposure = 1.05;
    this.scene.add(this.instrument);
    this.instrument.add(this.pathLayer);
    this.scene.add(new THREE.HemisphereLight(0xd9e6e4, 0x11151b, 1.5));
    const keyLight = new THREE.DirectionalLight(0xf4c68b, 2.2);
    keyLight.position.set(4, 7, 5);
    this.scene.add(keyLight);
    this.addReferenceCues();
    this.cursor.visible = false;
    this.startEndpoint.visible = false;
    this.endEndpoint.visible = false;
    this.pathLayer.add(this.cursor, this.startEndpoint, this.endEndpoint);
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
    this.removePathObject(this.rawLine);
    this.removePathObject(this.seamLine);
    this.rawLine = null;
    this.seamLine = null;
    if (!samples.length) {
      this.cursor.visible = false;
      this.startEndpoint.visible = false;
      this.endEndpoint.visible = false;
      return;
    }
    this.rawLine = standardLine(samples, this.rawMaterial);
    this.rawLine.renderOrder = 4;
    this.pathLayer.add(this.rawLine);
    this.cursor.position.set(cursorPosition.x, cursorPosition.y, cursorPosition.z);
    this.cursor.visible = isDrawing;
    const first = samples[0];
    const last = samples.at(-1) ?? first;
    this.startEndpoint.position.set(first.x, first.y, first.z);
    this.endEndpoint.position.set(last.x, last.y, last.z);
    this.startEndpoint.visible = true;
    this.endEndpoint.visible = samples.length > 1;
    if (samples.length > 2) {
      this.seamLine = standardLine([last, first], this.seamMaterial);
      this.seamLine.computeLineDistances();
      this.seamLine.renderOrder = 3;
      this.pathLayer.add(this.seamLine);
    }
  }

  public updateReconstruction(points: readonly Vec3[] | null): void {
    this.removeReconstruction();
    if (!points || points.length < 2) {
      return;
    }
    this.reconstructionHalo = new Line2(reconstructionGeometry(points), this.reconstructionHaloMaterial);
    this.reconstructionHalo.computeLineDistances();
    this.reconstructionHalo.renderOrder = 9;
    this.reconstructionCore = new Line2(reconstructionGeometry(points), this.reconstructionCoreMaterial);
    this.reconstructionCore.computeLineDistances();
    this.reconstructionCore.renderOrder = 10;
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
    this.reconstructionHaloMaterial.resolution.copy(this.lineResolution);
    this.reconstructionCoreMaterial.resolution.copy(this.lineResolution);
  }

  public render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  public dispose(): void {
    this.removePathObject(this.rawLine);
    this.removePathObject(this.seamLine);
    this.removeReconstruction();
    this.referenceGeometries.forEach((geometry) => geometry.dispose());
    this.cueMaterial.dispose();
    this.xAxisMaterial.dispose();
    this.yAxisMaterial.dispose();
    this.zAxisMaterial.dispose();
    this.gridMaterial.dispose();
    this.rawMaterial.dispose();
    this.seamMaterial.dispose();
    this.reconstructionHaloMaterial.dispose();
    this.reconstructionCoreMaterial.dispose();
    this.cursorGeometry.dispose();
    this.cursorMaterial.dispose();
    this.endpointGeometry.dispose();
    this.endpointMaterial.dispose();
    this.renderer.dispose();
  }

  private removePathObject(object: THREE.Line | Line2 | null): void {
    if (!object) {
      return;
    }
    this.pathLayer.remove(object);
    object.geometry.dispose();
  }

  private removeReconstruction(): void {
    this.removePathObject(this.reconstructionHalo);
    this.removePathObject(this.reconstructionCore);
    this.reconstructionHalo = null;
    this.reconstructionCore = null;
  }

  private addReferenceCues(): void {
    const size = 4.7;
    const divisions = 10;
    const positions: Vec3[] = [];
    for (let index = 0; index <= divisions; index += 1) {
      const offset = -size / 2 + (size * index) / divisions;
      positions.push({ x: offset, y: -size / 2, z: 0 }, { x: offset, y: size / 2, z: 0 });
      positions.push({ x: -size / 2, y: offset, z: 0 }, { x: size / 2, y: offset, z: 0 });
    }
    this.addReferenceLineSegments(positions, this.gridMaterial);
    this.addReferenceLineSegments([
      { x: -size / 2, y: 0, z: 0 }, { x: size / 2, y: 0, z: 0 },
    ], this.xAxisMaterial);
    this.addReferenceLineSegments([
      { x: 0, y: -size / 2, z: 0 }, { x: 0, y: size / 2, z: 0 },
    ], this.yAxisMaterial);
    this.addReferenceLineSegments([
      { x: 0, y: 0, z: -size / 2 }, { x: 0, y: 0, z: size / 2 },
    ], this.zAxisMaterial);
    const corners = [-size / 2, size / 2];
    const boxPoints: Vec3[] = [];
    for (const x of corners) {
      for (const y of corners) {
        boxPoints.push({ x, y, z: -size / 2 }, { x, y, z: size / 2 });
      }
    }
    for (const x of corners) {
      for (const z of corners) {
        boxPoints.push({ x, y: -size / 2, z }, { x, y: size / 2, z });
      }
    }
    for (const y of corners) {
      for (const z of corners) {
        boxPoints.push({ x: -size / 2, y, z }, { x: size / 2, y, z });
      }
    }
    this.addReferenceLineSegments(boxPoints, this.cueMaterial);
  }

  private addReferenceLineSegments(points: readonly Vec3[], material: THREE.Material): void {
    const geometry = bufferGeometry(points);
    this.referenceGeometries.push(geometry);
    this.instrument.add(new THREE.LineSegments(geometry, material));
  }
}

function bufferGeometry(points: readonly Vec3[]): THREE.BufferGeometry {
  const positions = new Float32Array(points.length * 3);
  points.forEach((point, index) => {
    positions[index * 3] = point.x;
    positions[index * 3 + 1] = point.y;
    positions[index * 3 + 2] = point.z;
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return geometry;
}

function standardLine(points: readonly Vec3[], material: THREE.Material): THREE.Line {
  return new THREE.Line(bufferGeometry(points), material);
}

function reconstructionGeometry(points: readonly Vec3[]): LineGeometry {
  const geometry = new LineGeometry();
  const closedPoints = points.length > 1 ? [...points, points[0]] : points;
  const positions: number[] = [];
  for (const point of closedPoints) {
    positions.push(point.x, point.y, point.z);
  }
  geometry.setPositions(positions);
  return geometry;
}

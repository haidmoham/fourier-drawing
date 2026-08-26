import * as THREE from "three";
import type { Vec3 } from "../domain";

export const RECONSTRUCTION_PROBE_TUNING = {
  contactHalfLifeMs: 100,
  contactScaleGain: 0.18,
  sensorBaseOpacity: 0.14,
  sensorContactOpacityGain: 0.12,
} as const;

/** A pigment-bearing marker for the current reconstruction sample. */
export class ReconstructionProbe {
  public readonly object = new THREE.Group();

  private readonly sensorMaterial = probeMaterial(0.1);
  private readonly keylineMaterial = new THREE.MeshBasicMaterial({
    color: 0x173238,
    transparent: true,
    opacity: 1,
    depthTest: false,
    depthWrite: false,
  });
  private readonly faceMaterial = probeMaterial(1);
  private readonly sensor: THREE.Mesh;
  private readonly keyline = new THREE.Mesh(
    new THREE.SphereGeometry(0.085, 20, 12),
    this.keylineMaterial,
  );
  private readonly face = new THREE.Mesh(
    new THREE.SphereGeometry(0.064, 20, 12),
    this.faceMaterial,
  );
  private readonly nucleus = new THREE.Mesh(
    new THREE.SphereGeometry(0.022, 16, 10),
    new THREE.MeshBasicMaterial({
      color: 0xf8f4e8,
      transparent: true,
      opacity: 1,
      depthTest: false,
      depthWrite: false,
    }),
  );
  private readonly reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  private contactEnergy = 0;
  private lastUpdateMs: number | null = null;

  public constructor(contactRadius: number) {
    this.sensor = new THREE.Mesh(
      new THREE.SphereGeometry(contactRadius, 20, 12),
      this.sensorMaterial,
    );
    this.sensor.renderOrder = 28;
    this.keyline.renderOrder = 29;
    this.face.renderOrder = 30;
    this.nucleus.renderOrder = 31;
    this.object.visible = false;
    this.object.add(this.sensor, this.keyline, this.face, this.nucleus);
  }

  public setPosition(position: Vec3): void {
    this.object.position.set(position.x, position.y, position.z);
  }

  public setVisible(visible: boolean): void {
    this.object.visible = visible;
    if (!visible) {
      this.contactEnergy = 0;
      this.lastUpdateMs = null;
    }
  }

  public update(timestampMs: number, contactStrength: number, pigment: THREE.Color): void {
    const elapsedMs = this.lastUpdateMs === null ? 0 : Math.max(0, timestampMs - this.lastUpdateMs);
    const release = 2 ** (-elapsedMs / RECONSTRUCTION_PROBE_TUNING.contactHalfLifeMs);
    this.contactEnergy = this.reducedMotion.matches
      ? 0
      : Math.max(contactStrength, this.contactEnergy * release);
    this.sensorMaterial.color.copy(pigment);
    this.faceMaterial.color.copy(pigment);
    this.sensorMaterial.opacity = RECONSTRUCTION_PROBE_TUNING.sensorBaseOpacity
      + this.contactEnergy * RECONSTRUCTION_PROBE_TUNING.sensorContactOpacityGain;
    this.sensor.scale.setScalar(1 + this.contactEnergy * RECONSTRUCTION_PROBE_TUNING.contactScaleGain);
    this.lastUpdateMs = timestampMs;
  }

  public dispose(): void {
    this.sensor.geometry.dispose();
    this.keyline.geometry.dispose();
    this.face.geometry.dispose();
    this.nucleus.geometry.dispose();
    this.sensorMaterial.dispose();
    this.keylineMaterial.dispose();
    this.faceMaterial.dispose();
    this.nucleus.material.dispose();
  }
}

function probeMaterial(opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity,
    depthTest: false,
    depthWrite: false,
  });
}

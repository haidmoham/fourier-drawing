import * as THREE from "three";

export class OrbitCameraController {
  private readonly target = new THREE.Vector3();
  private readonly orbit: THREE.Spherical;
  private readonly initialOrbit: THREE.Spherical;
  private readonly initialDistance: number;
  private distance: number;
  private pointerId: number | null = null;
  private previousX = 0;
  private previousY = 0;

  public constructor(
    private readonly camera: THREE.PerspectiveCamera,
    initialPosition: THREE.Vector3,
    private readonly minimumDistance = 5,
    private readonly maximumDistance = 28,
    private readonly zoomSensitivity = 0.0015,
    private readonly orbitSensitivity = 0.005,
  ) {
    this.distance = initialPosition.length();
    this.orbit = new THREE.Spherical().setFromVector3(initialPosition);
    this.initialOrbit = this.orbit.clone();
    this.initialDistance = this.distance;
    this.updateCamera();
  }

  public begin(pointerId: number, clientX: number, clientY: number): void {
    this.pointerId = pointerId;
    this.previousX = clientX;
    this.previousY = clientY;
  }

  public ownsPointer(pointerId: number): boolean {
    return pointerId === this.pointerId;
  }

  public activePointerId(): number | null {
    return this.pointerId;
  }

  public move(pointerId: number, clientX: number, clientY: number): boolean {
    if (!this.ownsPointer(pointerId)) {
      return false;
    }
    const deltaX = clientX - this.previousX;
    const deltaY = clientY - this.previousY;
    this.previousX = clientX;
    this.previousY = clientY;
    this.orbit.theta -= deltaX * this.orbitSensitivity;
    this.orbit.phi -= deltaY * this.orbitSensitivity;
    this.updateCamera();
    return true;
  }

  public end(pointerId: number): boolean {
    if (!this.ownsPointer(pointerId)) {
      return false;
    }
    this.pointerId = null;
    return true;
  }

  public cancel(): void {
    this.pointerId = null;
  }

  public reset(): void {
    this.pointerId = null;
    this.distance = this.initialDistance;
    this.orbit.copy(this.initialOrbit);
    this.updateCamera();
  }

  public zoom(deltaY: number): void {
    this.distance = THREE.MathUtils.clamp(
      this.distance * Math.exp(deltaY * this.zoomSensitivity),
      this.minimumDistance,
      this.maximumDistance,
    );
    this.updateCamera();
  }

  private updateCamera(): void {
    this.orbit.radius = this.distance;
    this.orbit.makeSafe();
    this.camera.position.setFromSpherical(this.orbit).add(this.target);
    this.camera.lookAt(this.target);
  }
}

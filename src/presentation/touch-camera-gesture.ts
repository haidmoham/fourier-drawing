/**
 * Tracks the contacts that started a touch camera gesture.
 *
 * A camera gesture cannot adopt a replacement contact. This prevents a new
 * midpoint or pinch distance from producing a jump after one finger lifts.
 */
export class TouchCameraGesture {
  private readonly contactIds = new Set<number>();
  private cameraActive = false;
  private locked = false;

  public trackContact(pointerId: number): boolean {
    if (this.cameraActive || this.locked || this.contactIds.has(pointerId)) {
      return false;
    }
    this.contactIds.add(pointerId);
    return true;
  }

  public beginCamera(): boolean {
    if (this.contactIds.size !== 2 || this.locked) {
      return false;
    }
    this.cameraActive = true;
    return true;
  }

  public releaseContact(pointerId: number): boolean {
    if (!this.contactIds.delete(pointerId)) {
      return false;
    }
    if (this.cameraActive && this.contactIds.size > 0) {
      this.locked = true;
    }
    if (this.contactIds.size === 0) {
      this.cameraActive = false;
      this.locked = false;
    }
    return true;
  }

  public canMoveCamera(): boolean {
    return this.cameraActive && !this.locked && this.contactIds.size === 2;
  }

  public blocksDesktopDrawing(): boolean {
    return this.contactIds.size > 0 || this.cameraActive || this.locked;
  }

  public reset(): void {
    this.contactIds.clear();
    this.cameraActive = false;
    this.locked = false;
  }
}

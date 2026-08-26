import { describe, expect, it } from "vitest";
import { TouchCameraGesture } from "./touch-camera-gesture";

describe("TouchCameraGesture", () => {
  it("locks a two-contact gesture after one original contact lifts", () => {
    const gesture = new TouchCameraGesture();

    expect(gesture.trackContact(10)).toBe(true);
    expect(gesture.trackContact(11)).toBe(true);
    expect(gesture.beginCamera()).toBe(true);
    expect(gesture.canMoveCamera()).toBe(true);

    gesture.releaseContact(10);

    expect(gesture.canMoveCamera()).toBe(false);
    expect(gesture.trackContact(12)).toBe(false);
    expect(gesture.blocksDesktopDrawing()).toBe(true);

    gesture.releaseContact(11);

    expect(gesture.blocksDesktopDrawing()).toBe(false);
    expect(gesture.trackContact(12)).toBe(true);
  });
});

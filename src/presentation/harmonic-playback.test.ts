import { describe, expect, it } from "vitest";
import { HarmonicPlayback } from "./harmonic-playback";

describe("harmonic playback", () => {
  it("steps through powers of two and advances only while auto mode is active", () => {
    const playback = new HarmonicPlayback(100);
    playback.reset(16, 0);

    expect(playback.snapshot().steps).toEqual([0, 1, 2, 4, 8, 16]);
    playback.step(1);
    expect(playback.snapshot().harmonicPairs).toBe(1);

    playback.toggleAuto(1_000);
    expect(playback.tick(1_099)).toBe(false);
    expect(playback.tick(1_100)).toBe(true);
    expect(playback.snapshot().harmonicPairs).toBe(2);

    playback.select(4);
    expect(playback.snapshot()).toMatchObject({ harmonicPairs: 8, isAuto: false });
  });

  it("can start auto playback on the first visible harmonic", () => {
    const playback = new HarmonicPlayback(1_800);
    playback.reset(16, 0);

    playback.startAuto(1_000, true);

    expect(playback.snapshot()).toMatchObject({ harmonicPairs: 1, isAuto: true });
    expect(playback.tick(2_799)).toBe(false);
    expect(playback.tick(2_800)).toBe(true);
    expect(playback.snapshot().harmonicPairs).toBe(2);
  });

  it("restarts a visible sequence from one play action", () => {
    const playback = new HarmonicPlayback(1_800);
    playback.reset(16, 0);

    playback.playFromBeginning(1_000);
    expect(playback.snapshot()).toMatchObject({ harmonicPairs: 1, isAuto: true });

    expect(playback.tick(2_800)).toBe(true);
    expect(playback.snapshot().harmonicPairs).toBe(2);

    playback.playFromBeginning(3_000);
    expect(playback.snapshot()).toMatchObject({ harmonicPairs: 1, isAuto: true });
    expect(playback.tick(4_799)).toBe(false);
    expect(playback.tick(4_800)).toBe(true);
  });
});

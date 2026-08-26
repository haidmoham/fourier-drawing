import { describe, expect, it } from "vitest";
import { curveContactAtPoint } from "./curve-contact";

describe("curveContactAtPoint", () => {
  it("measures one continuous contact interval across polyline segments", () => {
    const contact = curveContactAtPoint(
      { x: 0, y: 0, z: 0 },
      [
        { x: -1, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
      ],
      0.25,
    );

    expect(contact).not.toBeNull();
    expect(contact?.intervals).toHaveLength(1);
    expect(contact?.intervalLength).toBeCloseTo(0.5);
    expect(contact?.strength).toBeCloseTo(1);
    expect(contact?.intervals[0].startPathPosition).toBeCloseTo(0.375);
    expect(contact?.intervals[0].endPathPosition).toBeCloseTo(0.625);
  });

  it("returns no contact when the sphere misses the curve", () => {
    expect(curveContactAtPoint(
      { x: 0, y: 1, z: 0 },
      [{ x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }],
      0.25,
    )).toBeNull();
  });
});

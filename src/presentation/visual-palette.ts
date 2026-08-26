type VisualColor = Readonly<{
  css: `#${string}`;
  three: number;
}>;

export const VISUAL_PALETTE = {
  axisX: { css: "#ff7f6e", three: 0xff7f6e },
  axisY: { css: "#7de08a", three: 0x7de08a },
  axisZ: { css: "#73a7ff", three: 0x73a7ff },
  closure: { css: "#f5d76e", three: 0xf5d76e },
  halo: { css: "#37f6ff", three: 0x37f6ff },
  raw: { css: "#f0c27b", three: 0xf0c27b },
  reconstruction: { css: "#6ed8ce", three: 0x6ed8ce },
  residual: { css: "#ff9fc5", three: 0xff9fc5 },
} as const satisfies Record<string, VisualColor>;

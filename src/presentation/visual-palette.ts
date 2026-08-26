type VisualColor = Readonly<{
  css: `#${string}`;
  three: number;
}>;

/** The source rests as cool graphite. Fourier state carries the active color. */
export const VISUAL_PALETTE = {
  axisX: { css: "#c94e43", three: 0xc94e43 },
  axisY: { css: "#378946", three: 0x378946 },
  axisZ: { css: "#3f6fc2", three: 0x3f6fc2 },
  closure: { css: "#8f7600", three: 0x8f7600 },
  grid: { css: "#8a9a9d", three: 0x8a9a9d },
  gridAxis: { css: "#5c777d", three: 0x5c777d },
  halo: { css: "#68c8c9", three: 0x68c8c9 },
  raw: { css: "#535d60", three: 0x535d60 },
  reconstruction: { css: "#147d82", three: 0x147d82 },
  residual: { css: "#b73d6d", three: 0xb73d6d },
  sourceUnderlay: { css: "#aeb6b5", three: 0xaeb6b5 },
} as const satisfies Record<string, VisualColor>;

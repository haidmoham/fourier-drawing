# flowers

A p5.js reinterpretation of https://flowers.shin86.dev for the Sol vs Astra comparison.

Keep the original visual grammar: cream paper, folds, fine botanical contours,
translucent coral and cool pigment, a gathered bouquet, and two quiet mode buttons.
This version uses fuller petals, irregular pigment deposits, pooled edges, and
stems that share each flower's moving attachment point. The source is independent
of the existing Fourier Drawing app and `toy`.

Run `npm install`, then `npm run dev`. Run `npm run build` to check TypeScript
and create the static site. The local preview uses http://127.0.0.1:4190.

Bloom spreads pigment along the petals. Ripple spreads pigment out from each
flower's center. Both controls replay the reveal. Move across the bouquet to
bend nearby flowers. Tap the paper to start a small local wave. Reduced-motion
settings show the complete bouquet without motion. Hidden tabs stop drawing.

`FlowerSpec`, `Point`, and `Mode` exist only during TypeScript checking. Vite
removes them from the browser code. The p5 instance, event listeners, and cached
`p5.Graphics` objects run as JavaScript. The sketch uses the browser's 2D canvas
context for paths, gradients, and clipping. It does not use Three.js.

Deployment target: https://flowers.shin86.dev.
Vercel project: `flowers`. Deploy this directory with
`npx vercel --prod`. Keep it separate from the parent project's deployment.

Validation: strict TypeScript and production build passed. Desktop and 390 × 844
layouts were inspected. Both mode buttons update their pressed state. No browser
errors were observed. A source review identified and fixed first-tap coordinates.

The production revision gathers the flowers more closely. It enlarges the coral
flower and adds deeper blue and magenta accents, darker throats, curved pale veins,
and stronger pigment deposits. The original paper and mode controls remain.
The earlier comparison is available at https://newflowers.shin86.dev.

The bouquet revision compresses the flower centers into a rounded overlapping
cluster. Stems converge at a fine twine binding and continue below the viewport.
Their roots follow the bottom edge on resize. Green leaves sit directly beneath
the flower mass.

The evening version keeps this flower geometry. On desktop, the coral focal
point sits at the lower-left thirds intersection. On phones, the bouquet uses
the lower horizontal third. The approved flower scale stays stable.
Warm light and sparse autumn leaves provide
atmosphere. The experience is wordless. Touch the canvas or focus it and press
Enter or Space to receive the bouquet. Only the bloom, ripple, and piano icons
remain. Controls retain accessible names without visible text or tooltips.

The optional piano uses original synthesized voicings. It starts only after a
click. It stops when switched off and pauses when the tab is hidden. Audio lives
in `src/evening.ts`. The p5 sketch owns the wordless handoff. Reduced-motion
mode omits the handoff motion and leaf drift.

The expanded autumn layer fills the upper frame with translucent maple foliage
and fine branches. Ochre and rust washes surround a soft amber light. Fallen
leaves balance the lower-right edge. The canopy is cached in the paper layer.
Eight drifting leaves fade out near the bouquet. The approved flower geometry,
lower-third anchor, and wordless controls remain unchanged.

The hierarchy revision enlarges the bouquet. The gathered upper stems stay
compact while their roots extend to the bottom. Warm light centers on the flowers. The canopy has fewer
leaves, 57% layer opacity, and a small blur. This keeps autumn in the surrounding
space while the sharp, saturated flower mass carries the most visual weight.

Reference: https://flowers.shin86.dev/sketch.js and
https://flowers.shin86.dev/style.css. p5.js is bundled locally at version 1.11.3.

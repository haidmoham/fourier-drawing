# Fourier Drawing

Draw a line and explore the rotating components that reconstruct it. This local reimagining puts the Fourier sum on the stage: a paper drawing surface sits beside a view of its epicycles, with synchronized points connecting the two.

## Use

Press and drag on the opening canvas, then release to reveal the reconstruction and wave controls. Choose **draw** for another stroke, or try a bloom, orbit, or heart. Clear returns to the blank canvas. Change the number of waves, pause playback, or scrub the loop. Select a circle directly or one of the first six wave graphs to inspect its radius, frequency, starting angle, live x/y projection, and partial addition into the complete tracing point. The first wave is selected after drawing.

The curve is resampled at 256 equally spaced arc-length positions, including the closing segment for an open stroke. A complex discrete Fourier transform decomposes x + iy into rotating terms. The center position is always included; remaining terms are added in descending amplitude order. The error readout is RMS reconstruction distance divided by the centered source RMS radius. Full reconstruction matches the sampled positions to floating-point precision, rather than promising an exact fit to every point of the original hand stroke.

## Run

```sh
npm install
npm run dev -- --host 127.0.0.1 --port 5174
```

```sh
npm test
npm run build
npm run lint
```

## Structure

- `src/reimagined/engine.ts`: pure complex Fourier mathematics and sample curves.
- `src/reimagined/instrument.ts`: canvas drawing, cumulative vectors, playback, and cached reconstruction analysis.
- `src/reimagined/main.ts`: typed DOM controls and harmonic graphs.
- `src/reimagined/style.css`: responsive visual design.

The previous 3D domain and presentation modules remain in the repository, but the page entrypoint uses the 2D instrument. TypeScript interfaces describe points and state during checking; they disappear from the browser bundle. Canvas drawing and event listeners are runtime browser APIs.

Reduced-motion preference starts the instrument paused. Touch and mouse drawing use pointer capture. On narrow screens the two canvas views stack vertically. The typefaces load from Google Fonts with local fallbacks.

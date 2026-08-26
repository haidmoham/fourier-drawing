# Fourier Drawing

Fourier Drawing is a small Three.js instrument for exploring how a continuous spatial curve becomes a harmonic reconstruction.

Press and drag on the stage to draw. Release to enter the harmonics phase. Press the stage to return to drawing from the last curve point. Use the wheel to move the camera along its current viewing axis. Middle-drag to orbit the camera around the origin. Each drawing phase captures a camera-facing sketch plane through the last curve point. Pivot before continuing to extend the curve through a new spatial plane. The harmonics phase starts at the DC term and exposes checkpoints at 1, 2, 4, 8, and subsequent powers of two. Use the arrows or indexed slider to step manually. Auto mode loops through the same checkpoints. The periodic-resolution control recomputes the DFT samples, reconstruction, and live normalized RMS terms. The dashed segment is the explicit periodic seam used by the reconstruction. The raw hand path remains stable while playback controls the visually loud Fourier overlay.

The inspector reports input state, source and resampled counts, harmonic-pair count, closure gap, and normalized reconstruction error. Reset clears the only curve and starts a fresh run.

The interface asks for a drawing before it presents the derivations. Its visible color layer maps amber to raw samples, cyan to reconstruction, pink to residual error, yellow to closure, and coral/green/blue to the x/y/z components. Detailed closure and normalized RMS derivations remain behind an explicit disclosure control.

## Run locally

```sh
npm install
npm run dev
```

Run the existing tests with `npm test` and create a production build with `npm run build`.

`src/presentation/domain-adapter.ts` is a renderer-facing compatibility facade over the renderer-independent `src/domain` API. It keeps Three.js types out of the domain contract. Camera orbit, harmonic playback, and KaTeX rendering live in separate presentation modules so `src/main.ts` remains the composition layer.

Start visual prototypes in `src/styles/tokens.css` for interface colors and `src/presentation/visual-palette.ts` for Three.js and KaTeX colors. The separate files make palette experiments local and keep the mathematical color mapping consistent across CSS, rendered formulas, and the 3D scene.

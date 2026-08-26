import * as THREE from "three";
import "./style.css";
import { FourierScene } from "./presentation/fourier-scene";
import { HarmonicPlayback } from "./presentation/harmonic-playback";
import { formatCalculationValue, LiveMathPanel } from "./presentation/live-math-panel";
import { OrbitCameraController } from "./presentation/orbit-camera-controller";
import {
  analyzeFourier,
  appendCurveSample,
  maxHarmonicPairs,
  reconstructionErrorBreakdown,
  reconstructCurve,
  type CurveSample,
  type FourierAnalysis,
  type Vec3,
} from "./presentation/domain-adapter";

const harmonicSliderElement = document.querySelector<HTMLInputElement>("#harmonic-slider");
const canvasElement = document.querySelector<HTMLCanvasElement>("#drawing-canvas");
const resetButtonElement = document.querySelector<HTMLButtonElement>("#reset");
const hintElement = document.querySelector<HTMLElement>("#hint");
const inputStateElement = document.querySelector<HTMLElement>("#input-state");
const sourceSamplesElement = document.querySelector<HTMLElement>("#source-samples");
const resampledCountElement = document.querySelector<HTMLElement>("#resampled-count");
const harmonicCountElement = document.querySelector<HTMLOutputElement>("#harmonic-count");
const closureGapElement = document.querySelector<HTMLElement>("#closure-gap");
const rmsErrorElement = document.querySelector<HTMLElement>("#rms-error");
const previousStepElement = document.querySelector<HTMLButtonElement>("#step-previous");
const nextStepElement = document.querySelector<HTMLButtonElement>("#step-next");
const autoPlaybackElement = document.querySelector<HTMLButtonElement>("#auto-playback");
const resolutionSliderElement = document.querySelector<HTMLInputElement>("#resolution-slider");
const resolutionCountElement = document.querySelector<HTMLOutputElement>("#resolution-count");
const mathDetailsElement = document.querySelector<HTMLDetailsElement>(".math-details");
const drawCtaElements = [...document.querySelectorAll<HTMLButtonElement>("[data-draw-cta]")];

if (!canvasElement || !resetButtonElement || !hintElement || !inputStateElement || !sourceSamplesElement
  || !resampledCountElement || !harmonicCountElement || !closureGapElement || !rmsErrorElement
  || !harmonicSliderElement || !previousStepElement || !nextStepElement || !autoPlaybackElement
  || !resolutionSliderElement || !resolutionCountElement || !mathDetailsElement || drawCtaElements.length === 0) {
  throw new Error("The Fourier instrument could not be initialized.");
}

const canvas = canvasElement;
const resetButton = resetButtonElement;
const hint = hintElement;
const inputState = inputStateElement;
const sourceSamples = sourceSamplesElement;
const resampledCount = resampledCountElement;
const harmonicCount = harmonicCountElement;
const closureGap = closureGapElement;
const rmsError = rmsErrorElement;
const harmonicSlider = harmonicSliderElement;
const previousStepButton = previousStepElement;
const nextStepButton = nextStepElement;
const autoPlaybackButton = autoPlaybackElement;
const resolutionSlider = resolutionSliderElement;
const resolutionCount = resolutionCountElement;
const mathDetails = mathDetailsElement;
const liveMathPanel = LiveMathPanel.from(document);
const mountElement = canvas.parentElement;
if (!mountElement) {
  throw new Error("The Fourier instrument has no mount element.");
}
const mount = mountElement;

const fourierScene = new FourierScene(canvas, mount);
const camera = fourierScene.camera;
const orbitCamera = new OrbitCameraController(camera, new THREE.Vector3(7.4, 6.2, 9.2));

type InstrumentState = "READY" | "DRAWING" | "HARMONICS";

let samples: CurveSample[] = [];
let analysis: FourierAnalysis | null = null;
let state: InstrumentState = "READY";
let pointerId: number | null = null;
let currentPosition: Vec3 = { x: 0, y: 0, z: 0 };
let currentPairs = 0;
let periodicResolution = 2 ** Number(resolutionSlider.value);
const playback = new HarmonicPlayback();
let raf = 0;

function harmonicMaximum(): number {
  return analysis ? maxHarmonicPairs(analysis) : 0;
}

function syncHarmonicControl(preferredPairs = currentPairs): void {
  playback.configure(harmonicMaximum(), preferredPairs);
  const playbackState = playback.snapshot();
  currentPairs = playbackState.harmonicPairs;
  const controlsEnabled = state === "HARMONICS" && analysis !== null;
  harmonicSlider.min = "0";
  harmonicSlider.max = String(Math.max(0, playbackState.steps.length - 1));
  harmonicSlider.step = "1";
  harmonicSlider.disabled = !controlsEnabled;
  harmonicSlider.value = String(playbackState.stepIndex);
  previousStepButton.disabled = !controlsEnabled || playbackState.stepIndex === 0;
  nextStepButton.disabled = !controlsEnabled || playbackState.stepIndex === playbackState.steps.length - 1;
  autoPlaybackButton.disabled = !controlsEnabled || playbackState.steps.length < 2;
  autoPlaybackButton.ariaPressed = String(playbackState.isAuto);
  autoPlaybackButton.textContent = playbackState.isAuto ? "Auto on" : "Auto off";
}

function setHarmonicCount(value: string): void {
  harmonicCount.value = value;
  harmonicCount.textContent = value;
}

function setResolutionCount(value: string): void {
  resolutionCount.value = value;
  resolutionCount.textContent = value;
}

function updateInspector(): void {
  const playbackState = playback.snapshot();
  inputState.textContent = state;
  inputState.dataset.state = state === "DRAWING" ? "active" : "idle";
  sourceSamples.textContent = String(samples.length);
  resampledCount.textContent = String(analysis?.resampled.length ?? 0);
  setHarmonicCount(analysis
    ? `${currentPairs} pairs · ${playbackState.stepIndex + 1}/${playbackState.steps.length}`
    : "—");
  setResolutionCount(`${periodicResolution} points`);
  closureGap.textContent = analysis ? analysis.closureGap.toFixed(2) : "—";
  const error = analysis && samples.length > 2
    ? reconstructionErrorBreakdown(analysis, currentPairs)
    : null;
  rmsError.textContent = error ? formatCalculationValue(error.normalizedRms) : "—";
  liveMathPanel.render({
    hasAnalysis: analysis !== null,
    harmonicPairs: currentPairs,
    sampleCount: analysis?.resampled.length ?? periodicResolution,
    error,
    closure: analysis?.closure ?? null,
  });
}

function updateRawPath(): void {
  fourierScene.updateRawPath(samples, currentPosition, state === "DRAWING");
}

function updateReconstruction(): void {
  if (!analysis || state !== "HARMONICS") {
    fourierScene.updateReconstruction(null);
    return;
  }
  const points = reconstructCurve(analysis, currentPairs, analysis.resampled.length);
  fourierScene.updateReconstruction(points);
}

function updateAnalysisFromSamples(): void {
  analysis = samples.length > 1 ? analyzeFourier(samples, periodicResolution) : null;
  syncHarmonicControl();
  updateRawPath();
  updateReconstruction();
  updateInspector();
}

function appendPointerBatch(event: PointerEvent): void {
  const coalescedEvents = event.getCoalescedEvents();
  const observations = coalescedEvents.length ? coalescedEvents : [event];
  for (const observation of observations) {
    currentPosition = fourierScene.pointFromPointer(observation, currentPosition);
    samples = appendCurveSample(samples, currentPosition, 0, observation.timeStamp);
  }
  updateAnalysisFromSamples();
}

function showDrawingInvitation(): void {
  for (const callToAction of drawCtaElements) {
    callToAction.hidden = false;
  }
  delete canvas.dataset.awaitingDraw;
}

function dismissDrawingInvitation(): void {
  for (const callToAction of drawCtaElements) {
    callToAction.hidden = true;
  }
  delete canvas.dataset.awaitingDraw;
}

function inviteDrawing(): void {
  dismissDrawingInvitation();
  canvas.dataset.awaitingDraw = "true";
  canvas.focus();
  hint.textContent = "Drag on the stage to draw · release when the curve is ready";
}

function beginDrawing(event: PointerEvent): void {
  event.preventDefault();
  dismissDrawingInvitation();
  state = "DRAWING";
  pointerId = event.pointerId;
  playback.stopAuto();
  fourierScene.updateReconstruction(null);
  harmonicSlider.disabled = true;
  fourierScene.setDrawingPlaneFromCamera(currentPosition);
  canvas.setPointerCapture(event.pointerId);
  appendPointerBatch(event);
  hint.textContent = "Drag to draw · wheel zooms · release to decompose";
  updateInspector();
}

function beginPivot(event: PointerEvent): void {
  event.preventDefault();
  orbitCamera.begin(event.pointerId, event.clientX, event.clientY);
  canvas.dataset.gesture = "pivoting";
  canvas.setPointerCapture(event.pointerId);
}

function moveDrawing(event: PointerEvent): void {
  if (state !== "DRAWING" || event.pointerId !== pointerId) {
    return;
  }
  event.preventDefault();
  appendPointerBatch(event);
}

function movePivot(event: PointerEvent): void {
  if (!orbitCamera.ownsPointer(event.pointerId)) {
    return;
  }
  event.preventDefault();
  orbitCamera.move(event.pointerId, event.clientX, event.clientY);
}

function endPivot(event: PointerEvent): void {
  if (!orbitCamera.end(event.pointerId)) {
    return;
  }
  event.preventDefault();
  delete canvas.dataset.gesture;
  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
}

function handlePointerDown(event: PointerEvent): void {
  if (event.button === 1) {
    beginPivot(event);
  } else if (event.button === 0) {
    beginDrawing(event);
  }
}

function handlePointerMove(event: PointerEvent): void {
  if (orbitCamera.ownsPointer(event.pointerId)) {
    movePivot(event);
  } else {
    moveDrawing(event);
  }
}

function handlePointerEnd(event: PointerEvent): void {
  if (orbitCamera.ownsPointer(event.pointerId)) {
    endPivot(event);
  } else if (event.pointerId === pointerId) {
    pauseDrawing(event);
  }
}

function preventMiddleClick(event: MouseEvent): void {
  if (event.button === 1) {
    event.preventDefault();
  }
}

function enterHarmonics(): boolean {
  if (!analysis || samples.length <= 2) {
    state = "READY";
    harmonicSlider.disabled = true;
    updateInspector();
    return false;
  }
  state = "HARMONICS";
  playback.reset(harmonicMaximum(), 0);
  currentPairs = 0;
  syncHarmonicControl(0);
  updateReconstruction();
  updateInspector();
  return true;
}

function pauseDrawing(event: PointerEvent): void {
  if (state !== "DRAWING" || (pointerId !== null && event.pointerId !== pointerId)) {
    return;
  }
  event.preventDefault();
  appendPointerBatch(event);
  pointerId = null;
  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
  fourierScene.hideCursor();
  const harmonicsReady = enterHarmonics();
  hint.textContent = harmonicsReady
    ? "Harmonics active · adjust the slider or press the stage to continue drawing"
    : "Keep drawing to give the Fourier reconstruction enough shape";
}

function zoomCamera(event: WheelEvent): void {
  event.preventDefault();
  orbitCamera.zoom(event.deltaY);
}

function selectHarmonics(): void {
  if (state !== "HARMONICS" || !analysis) {
    return;
  }
  playback.select(Number(harmonicSlider.value));
  applyPlaybackState();
}

function applyPlaybackState(): void {
  currentPairs = playback.snapshot().harmonicPairs;
  syncHarmonicControl(currentPairs);
  updateReconstruction();
  updateInspector();
}

function stepHarmonics(direction: -1 | 1): void {
  if (state !== "HARMONICS" || !analysis) {
    return;
  }
  playback.step(direction);
  applyPlaybackState();
}

function selectPreviousHarmonics(): void {
  stepHarmonics(-1);
}

function selectNextHarmonics(): void {
  stepHarmonics(1);
}

function toggleAutomaticPlayback(): void {
  if (state !== "HARMONICS" || !analysis) {
    return;
  }
  playback.toggleAuto(performance.now());
  syncHarmonicControl();
  updateInspector();
}

function selectPeriodicResolution(): void {
  const exponent = THREE.MathUtils.clamp(Math.round(Number(resolutionSlider.value)), 4, 9);
  resolutionSlider.value = String(exponent);
  periodicResolution = 2 ** exponent;
  updateAnalysisFromSamples();
}

function reset(): void {
  state = "READY";
  pointerId = null;
  orbitCamera.cancel();
  delete canvas.dataset.gesture;
  currentPosition = { x: 0, y: 0, z: 0 };
  samples = [];
  analysis = null;
  currentPairs = 0;
  playback.reset();
  mathDetails.open = false;
  showDrawingInvitation();
  hint.textContent = "Press and drag to draw · wheel zooms · middle-drag pivots";
  updateAnalysisFromSamples();
}

function resize(): void {
  fourierScene.resize();
}

function updateAutomaticHarmonics(now: number): void {
  if (state !== "HARMONICS" || !analysis || !playback.tick(now)) {
    return;
  }
  applyPlaybackState();
}

function animate(now: number): void {
  raf = requestAnimationFrame(animate);
  updateAutomaticHarmonics(now);
  fourierScene.render();
}

canvas.addEventListener("pointerdown", handlePointerDown);
canvas.addEventListener("pointermove", handlePointerMove);
canvas.addEventListener("pointerup", handlePointerEnd);
canvas.addEventListener("pointercancel", handlePointerEnd);
canvas.addEventListener("wheel", zoomCamera, { passive: false });
canvas.addEventListener("auxclick", preventMiddleClick);
harmonicSlider.addEventListener("input", selectHarmonics);
previousStepButton.addEventListener("click", selectPreviousHarmonics);
nextStepButton.addEventListener("click", selectNextHarmonics);
autoPlaybackButton.addEventListener("click", toggleAutomaticPlayback);
resolutionSlider.addEventListener("input", selectPeriodicResolution);
for (const callToAction of drawCtaElements) {
  callToAction.addEventListener("click", inviteDrawing);
}
resetButton.addEventListener("click", reset);
window.addEventListener("resize", resize);
const observer = new ResizeObserver(resize);
observer.observe(mount);

function cleanup(): void {
  cancelAnimationFrame(raf);
  observer.disconnect();
  canvas.removeEventListener("pointerdown", handlePointerDown);
  canvas.removeEventListener("pointermove", handlePointerMove);
  canvas.removeEventListener("pointerup", handlePointerEnd);
  canvas.removeEventListener("pointercancel", handlePointerEnd);
  canvas.removeEventListener("wheel", zoomCamera);
  canvas.removeEventListener("auxclick", preventMiddleClick);
  harmonicSlider.removeEventListener("input", selectHarmonics);
  previousStepButton.removeEventListener("click", selectPreviousHarmonics);
  nextStepButton.removeEventListener("click", selectNextHarmonics);
  autoPlaybackButton.removeEventListener("click", toggleAutomaticPlayback);
  resolutionSlider.removeEventListener("input", selectPeriodicResolution);
  for (const callToAction of drawCtaElements) {
    callToAction.removeEventListener("click", inviteDrawing);
  }
  resetButton.removeEventListener("click", reset);
  window.removeEventListener("resize", resize);
  fourierScene.dispose();
}

window.addEventListener("beforeunload", cleanup, { once: true });
resize();
reset();
requestAnimationFrame(animate);

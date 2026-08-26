import * as THREE from "three";
import "./style.css";
import { FourierScene } from "./presentation/fourier-scene";
import { HarmonicEnvelope } from "./presentation/harmonic-envelope";
import { HarmonicPlayback } from "./presentation/harmonic-playback";
import { formatCalculationValue, LiveMathPanel } from "./presentation/live-math-panel";
import { OrbitCameraController } from "./presentation/orbit-camera-controller";
import { TouchCameraGesture } from "./presentation/touch-camera-gesture";
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
const resetViewElement = document.querySelector<HTMLButtonElement>("#reset-view");
const drawCtaElements = [...document.querySelectorAll<HTMLButtonElement>("[data-draw-cta]")];

if (!canvasElement || !resetButtonElement || !hintElement || !inputStateElement || !sourceSamplesElement
  || !resampledCountElement || !harmonicCountElement || !closureGapElement || !rmsErrorElement
  || !harmonicSliderElement || !previousStepElement || !nextStepElement || !autoPlaybackElement
  || !resolutionSliderElement || !resolutionCountElement || !mathDetailsElement || !resetViewElement
  || drawCtaElements.length === 0) {
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
const resetViewButton = resetViewElement;
const liveMathPanel = LiveMathPanel.from(document);
const harmonicEnvelope = HarmonicEnvelope.from(document);
const mountElement = canvas.parentElement;
if (!mountElement) {
  throw new Error("The Fourier instrument has no mount element.");
}
const mount = mountElement;

const fourierScene = new FourierScene(canvas, mount);
const camera = fourierScene.camera;
const orbitCamera = new OrbitCameraController(camera, new THREE.Vector3(7.4, 6.2, 9.2));

type InstrumentState = "READY" | "DRAWING" | "HARMONICS";
type TouchPoint = Readonly<{ clientX: number; clientY: number }>;

const MINIMUM_AUTO_HARMONIC_PAIRS = 128;
const MINIMUM_AUTO_SAMPLE_COUNT = MINIMUM_AUTO_HARMONIC_PAIRS * 2;

let samples: CurveSample[] = [];
let analysis: FourierAnalysis | null = null;
let state: InstrumentState = "READY";
let pointerId: number | null = null;
let currentPosition: Vec3 = { x: 0, y: 0, z: 0 };
let currentPairs = 0;
let periodicResolution = 2 ** Number(resolutionSlider.value);
const playback = new HarmonicPlayback();
let raf = 0;
const touchPoints = new Map<number, TouchPoint>();
const touchCameraGesture = new TouchCameraGesture();
let pendingTouchId: number | null = null;
let pendingTouchStart: TouchPoint | null = null;
let previousPinchDistance: number | null = null;

function usesCoarsePointer(): boolean {
  return window.matchMedia("(pointer: coarse)").matches;
}

function resetInteractionInstructions(): void {
  const touchInstructions = usesCoarsePointer();
  hint.textContent = touchInstructions
    ? "one finger draws · two fingers orbit · pinch zooms"
    : "Press and drag to draw · wheel zooms · middle-drag pivots";
  canvas.ariaLabel = touchInstructions
    ? "one finger draws. two fingers orbit. pinch zooms."
    : "Press and drag to draw a curve. Use the mouse wheel to zoom. Middle-drag to orbit around the origin.";
}

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
    harmonicEnvelope.update(null, 0);
    return;
  }
  const points = reconstructCurve(analysis, currentPairs, analysis.resampled.length);
  fourierScene.updateReconstruction(points);
  harmonicEnvelope.update(analysis, currentPairs);
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
  hint.textContent = usesCoarsePointer()
    ? "one finger draws · two fingers orbit · pinch zooms"
    : "Drag to draw · wheel zooms · release to decompose";
  updateInspector();
}

function cancelTouchInteraction(): void {
  const activeOrbitPointerId = orbitCamera.activePointerId();
  orbitCamera.cancel();
  const capturedPointerIds = [...touchPoints.keys()];
  touchPoints.clear();
  pendingTouchId = null;
  pendingTouchStart = null;
  touchCameraGesture.reset();
  if (activeOrbitPointerId !== null && activeOrbitPointerId >= 0 && canvas.hasPointerCapture(activeOrbitPointerId)) {
    canvas.releasePointerCapture(activeOrbitPointerId);
  }
  for (const pointerId of capturedPointerIds) {
    if (canvas.hasPointerCapture(pointerId)) {
      canvas.releasePointerCapture(pointerId);
    }
  }
  previousPinchDistance = null;
  delete canvas.dataset.gesture;
}

function resetView(): void {
  if (state === "DRAWING") {
    return;
  }
  cancelTouchInteraction();
  orbitCamera.reset();
}

function beginPivot(event: PointerEvent): void {
  if (state === "DRAWING") {
    return;
  }
  event.preventDefault();
  orbitCamera.begin(event.pointerId, event.clientX, event.clientY);
  canvas.dataset.gesture = "pivoting";
  canvas.setPointerCapture(event.pointerId);
}

function touchPair(): readonly [TouchPoint, TouchPoint] | null {
  const points = [...touchPoints.values()];
  return points.length < 2 ? null : [points[0], points[1]];
}

function beginTouchCamera(): void {
  const pair = touchPair();
  if (!pair || !touchCameraGesture.beginCamera()) {
    return;
  }
  const [first, second] = pair;
  pendingTouchId = null;
  pendingTouchStart = null;
  previousPinchDistance = Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
  orbitCamera.begin(-1, (first.clientX + second.clientX) / 2, (first.clientY + second.clientY) / 2);
  canvas.dataset.gesture = "pivoting";
}

function beginTouch(event: PointerEvent): void {
  event.preventDefault();
  if (!touchCameraGesture.trackContact(event.pointerId)) {
    return;
  }
  touchPoints.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
  canvas.setPointerCapture(event.pointerId);
  if (touchPoints.size === 1) {
    pendingTouchId = event.pointerId;
    pendingTouchStart = { clientX: event.clientX, clientY: event.clientY };
  } else if (touchPoints.size === 2) {
    beginTouchCamera();
  }
}

function moveTouch(event: PointerEvent): void {
  if (!touchPoints.has(event.pointerId) || state === "DRAWING") {
    return;
  }
  event.preventDefault();
  const nextPoint = { clientX: event.clientX, clientY: event.clientY };
  touchPoints.set(event.pointerId, nextPoint);
  if (!touchCameraGesture.canMoveCamera() && pendingTouchId === event.pointerId && pendingTouchStart) {
    const movement = Math.hypot(nextPoint.clientX - pendingTouchStart.clientX, nextPoint.clientY - pendingTouchStart.clientY);
    if (movement >= 6) {
      touchPoints.clear();
      touchCameraGesture.reset();
      pendingTouchId = null;
      pendingTouchStart = null;
      beginDrawing(event);
    }
    return;
  }
  if (!touchCameraGesture.canMoveCamera()) {
    return;
  }
  const pair = touchPair();
  if (!pair) {
    return;
  }
  const [first, second] = pair;
  const midpointX = (first.clientX + second.clientX) / 2;
  const midpointY = (first.clientY + second.clientY) / 2;
  const nextPinchDistance = Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
  orbitCamera.move(-1, midpointX, midpointY);
  if (previousPinchDistance !== null) {
    orbitCamera.zoom(previousPinchDistance - nextPinchDistance);
  }
  previousPinchDistance = nextPinchDistance;
}

function endTouch(event: PointerEvent): void {
  if (!touchPoints.has(event.pointerId)) {
    return;
  }
  event.preventDefault();
  touchPoints.delete(event.pointerId);
  touchCameraGesture.releaseContact(event.pointerId);
  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
  if (touchPoints.size > 0) {
    return;
  }
  cancelTouchInteraction();
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
  if (state === "DRAWING") {
    return;
  }
  if (event.pointerType === "touch") {
    beginTouch(event);
  } else if (touchCameraGesture.blocksDesktopDrawing()) {
    return;
  } else if (event.button === 1) {
    beginPivot(event);
  } else if (event.button === 0) {
    beginDrawing(event);
  }
}

function handlePointerMove(event: PointerEvent): void {
  if (touchPoints.has(event.pointerId)) {
    moveTouch(event);
  } else if (orbitCamera.ownsPointer(event.pointerId)) {
    movePivot(event);
  } else {
    moveDrawing(event);
  }
}

function handlePointerEnd(event: PointerEvent): void {
  if (touchPoints.has(event.pointerId)) {
    endTouch(event);
  } else if (orbitCamera.ownsPointer(event.pointerId)) {
    endPivot(event);
  } else if (event.pointerId === pointerId) {
    pauseDrawing(event, event.type === "pointerup");
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

function pauseDrawing(event: PointerEvent, appendFinalSample: boolean): void {
  if (state !== "DRAWING" || (pointerId !== null && event.pointerId !== pointerId)) {
    return;
  }
  event.preventDefault();
  if (appendFinalSample) {
    appendPointerBatch(event);
  }
  pointerId = null;
  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
  completeDrawing();
}

function completeDrawing(): void {
  pointerId = null;
  fourierScene.hideCursor();
  const harmonicsReady = enterHarmonics();
  hint.textContent = harmonicsReady
    ? "Harmonics active · adjust the slider or press the stage to continue drawing"
    : "Keep drawing to give the Fourier reconstruction enough shape";
}

function zoomCamera(event: WheelEvent): void {
  event.preventDefault();
  if (state === "DRAWING") {
    return;
  }
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
  const isStartingAuto = !playback.snapshot().isAuto;
  if (isStartingAuto && harmonicMaximum() < MINIMUM_AUTO_HARMONIC_PAIRS) {
    periodicResolution = Math.max(periodicResolution, MINIMUM_AUTO_SAMPLE_COUNT);
    resolutionSlider.value = String(Math.log2(periodicResolution));
    updateAnalysisFromSamples();
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
  const activeDrawingPointerId = pointerId;
  state = "READY";
  pointerId = null;
  if (activeDrawingPointerId !== null && canvas.hasPointerCapture(activeDrawingPointerId)) {
    canvas.releasePointerCapture(activeDrawingPointerId);
  }
  cancelTouchInteraction();
  delete canvas.dataset.gesture;
  currentPosition = { x: 0, y: 0, z: 0 };
  samples = [];
  analysis = null;
  currentPairs = 0;
  playback.reset();
  mathDetails.open = false;
  showDrawingInvitation();
  resetInteractionInstructions();
  updateAnalysisFromSamples();
}

function resize(): void {
  fourierScene.resize();
}

function handleLostPointerCapture(event: PointerEvent): void {
  if (event.pointerId === pointerId) {
    pauseDrawing(event, false);
    return;
  }
  handlePointerEnd(event);
}

function handleVisibilityChange(): void {
  if (!document.hidden) {
    return;
  }
  cancelTouchInteraction();
  if (state === "DRAWING") {
    const activeDrawingPointerId = pointerId;
    pointerId = null;
    if (activeDrawingPointerId !== null && canvas.hasPointerCapture(activeDrawingPointerId)) {
      canvas.releasePointerCapture(activeDrawingPointerId);
    }
    completeDrawing();
  }
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
  harmonicEnvelope.render(now);
  fourierScene.render(now);
}

canvas.addEventListener("pointerdown", handlePointerDown);
canvas.addEventListener("pointermove", handlePointerMove);
canvas.addEventListener("pointerup", handlePointerEnd);
canvas.addEventListener("pointercancel", handlePointerEnd);
canvas.addEventListener("lostpointercapture", handleLostPointerCapture);
canvas.addEventListener("wheel", zoomCamera, { passive: false });
canvas.addEventListener("auxclick", preventMiddleClick);
resetViewButton.addEventListener("click", resetView);
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
window.visualViewport?.addEventListener("resize", resize);
document.addEventListener("visibilitychange", handleVisibilityChange);
const observer = new ResizeObserver(resize);
observer.observe(mount);

function cleanup(): void {
  cancelAnimationFrame(raf);
  observer.disconnect();
  canvas.removeEventListener("pointerdown", handlePointerDown);
  canvas.removeEventListener("pointermove", handlePointerMove);
  canvas.removeEventListener("pointerup", handlePointerEnd);
  canvas.removeEventListener("pointercancel", handlePointerEnd);
  canvas.removeEventListener("lostpointercapture", handleLostPointerCapture);
  canvas.removeEventListener("wheel", zoomCamera);
  canvas.removeEventListener("auxclick", preventMiddleClick);
  resetViewButton.removeEventListener("click", resetView);
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
  window.visualViewport?.removeEventListener("resize", resize);
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  liveMathPanel.dispose();
  fourierScene.dispose();
}

window.addEventListener("beforeunload", cleanup, { once: true });
resize();
reset();
requestAnimationFrame(animate);

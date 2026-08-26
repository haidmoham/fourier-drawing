import "./style.css";
import { appendSample, canClosePath, type Point } from "./lib/path";

const canvasElement = document.querySelector<HTMLCanvasElement>("#drawing-canvas");
const resetButtonElement = document.querySelector<HTMLButtonElement>("#reset");
const hintElement = document.querySelector<HTMLElement>("#hint");

if (!canvasElement || !resetButtonElement || !hintElement) {
  throw new Error("The drawing interface could not be initialized.");
}

const canvas: HTMLCanvasElement = canvasElement;
const resetButton: HTMLButtonElement = resetButtonElement;
const hint: HTMLElement = hintElement;
const renderingContext = canvas.getContext("2d");

if (!renderingContext) {
  throw new Error("Canvas 2D rendering is not supported in this browser.");
}

const context: CanvasRenderingContext2D = renderingContext;

let samples: Point[] = [];
let isDrawing = false;
let isClosed = false;

function resizeCanvas(): void {
  const bounds = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;

  canvas.width = Math.round(bounds.width * scale);
  canvas.height = Math.round(bounds.height * scale);
  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = 2.5;
  context.strokeStyle = "#f1eee5";
  render();
}

function pointFromEvent(event: PointerEvent): Point {
  const bounds = canvas.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
}

function render(): void {
  const { width, height } = canvas.getBoundingClientRect();
  context.clearRect(0, 0, width, height);

  if (samples.length < 1) {
    return;
  }

  context.beginPath();
  context.moveTo(samples[0].x, samples[0].y);
  for (const point of samples.slice(1)) {
    context.lineTo(point.x, point.y);
  }
  if (isClosed) {
    context.closePath();
  }
  context.stroke();
}

function reset(): void {
  samples = [];
  isDrawing = false;
  isClosed = false;
  hint.textContent = "Draw one continuous path. It will close when you release.";
  render();
}

canvas.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  if (isClosed) {
    reset();
  }

  isDrawing = true;
  samples = [pointFromEvent(event)];
  canvas.setPointerCapture(event.pointerId);
  hint.textContent = "Release to close your path.";
  render();
});

canvas.addEventListener("pointermove", (event) => {
  if (!isDrawing) {
    return;
  }

  samples = appendSample(samples, pointFromEvent(event));
  render();
});

function finishPath(event: PointerEvent): void {
  if (!isDrawing) {
    return;
  }

  samples = appendSample(samples, pointFromEvent(event));
  isDrawing = false;
  isClosed = canClosePath(samples);
  hint.textContent = isClosed
    ? `${samples.length} points captured. Fourier transform comes next.`
    : "Add a longer stroke to create a closed path.";
  render();
}

canvas.addEventListener("pointerup", finishPath);
canvas.addEventListener("pointercancel", finishPath);
resetButton.addEventListener("click", reset);

resizeCanvas();
window.addEventListener("resize", resizeCanvas);

import "./style.css";
import { MainPage } from "./MainPage";

const maybeCanvas = document.querySelector<HTMLCanvasElement>("#rootCanvas");
if (maybeCanvas === null) {
  throw new Error("rootCanvas is missing.");
}

const canvas = maybeCanvas;
const maybeContext = canvas.getContext("2d");
if (maybeContext === null) {
  throw new Error("2D canvas is unavailable.");
}

const context = maybeContext;
const logicalWidth = Number(canvas.getAttribute("width"));
const logicalHeight = Number(canvas.getAttribute("height"));

function resizeCanvas(): void {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    return;
  }

  const pixelRatio = window.devicePixelRatio || 1;
  const displayScale = Math.min(rect.width / logicalWidth, rect.height / logicalHeight);
  const backingScale = displayScale * pixelRatio;
  canvas.width = Math.round(logicalWidth * backingScale);
  canvas.height = Math.round(logicalHeight * backingScale);
  context.setTransform(backingScale, 0, 0, backingScale, 0, 0);
}

resizeCanvas();
new ResizeObserver(resizeCanvas).observe(canvas);
window.addEventListener("resize", resizeCanvas);

new MainPage(canvas, context, logicalWidth, logicalHeight);

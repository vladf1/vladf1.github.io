import {
  DEFAULT_FADE_AMOUNT,
  DEFAULT_SPRITE_COUNT,
  FADE_AMOUNT_PER_MS_SCALE,
  createRandom,
  createSprites,
  createWebgpuComputeRenderer
} from "./swarm.js";

const DEFAULT_FRAME_COUNT = 1200;
const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 600;
const FIXED_ELAPSED_MS = 1000 / 60;
const WARMUP_FRAME_COUNT = 6000;
const SAMPLE_COUNT = 5;
const SEED = 0x51a7f00d;

const params = new URLSearchParams(location.search);
const spriteCountInput = document.querySelector("#spriteCount");
const frameCountInput = document.querySelector("#frameCount");
const canvasWidthInput = document.querySelector("#canvasWidth");
const canvasHeightInput = document.querySelector("#canvasHeight");
const runButton = document.querySelector("#runButton");
const status = document.querySelector("#status");
const score = document.querySelector("#score");
const medianFrameTime = document.querySelector("#medianFrameTime");
const sampleRange = document.querySelector("#sampleRange");
const webgpuCanvas = document.querySelector("#webgpuCanvas");

spriteCountInput.value = String(readPositiveInteger(params.get("NumberOfSprites"), DEFAULT_SPRITE_COUNT));
frameCountInput.value = String(readPositiveInteger(params.get("Frames"), DEFAULT_FRAME_COUNT));
canvasWidthInput.value = String(readPositiveInteger(params.get("Width"), DEFAULT_WIDTH));
canvasHeightInput.value = String(readPositiveInteger(params.get("Height"), DEFAULT_HEIGHT));

runButton.addEventListener("click", runBenchmark);
requestAnimationFrame(runBenchmark);

async function runBenchmark() {
  const config = readConfig();
  writeConfigToUrl(config);
  runButton.disabled = true;
  clearResult();
  status.textContent = "Initializing WebGPU...";
  await waitForPaint();

  const sprites = createSprites(config.spriteCount, config.width, config.height, createRandom(SEED));
  const motionState = createMotionState(config);
  const renderer = await createWebgpuComputeRenderer(
    webgpuCanvas,
    config.width,
    config.height,
    config.width,
    config.height,
    sprites,
    motionState
  );

  if (renderer === null) {
    status.textContent = "WebGPU is unavailable in this browser.";
    runButton.disabled = false;
    return;
  }

  status.textContent = `Warming up with ${WARMUP_FRAME_COUNT.toLocaleString()} frames...`;
  await waitForPaint();
  submitFrames(renderer, sprites, motionState, config, WARMUP_FRAME_COUNT);
  await renderer.finish();

  const samplesMsPerFrame = [];
  for (let sample = 0; sample < SAMPLE_COUNT; sample++) {
    status.textContent = `Measuring WebGPU sample ${sample + 1} of ${SAMPLE_COUNT}...`;
    await waitForPaint();
    const started = performance.now();
    submitFrames(renderer, sprites, motionState, config, config.frameCount);
    await renderer.finish();
    samplesMsPerFrame.push((performance.now() - started) / config.frameCount);
  }

  const sortedSamples = samplesMsPerFrame.toSorted((a, b) => a - b);
  const medianMsPerFrame = percentile(sortedSamples, 0.5);
  const result = {
    score: Math.round(1000 / medianMsPerFrame),
    impliedFps: 1000 / medianMsPerFrame,
    medianMsPerFrame,
    minMsPerFrame: sortedSamples[0],
    maxMsPerFrame: sortedSamples.at(-1),
    samplesMsPerFrame,
    sampleCount: SAMPLE_COUNT,
    warmupFrameCount: WARMUP_FRAME_COUNT,
    config
  };

  showResult(result);
  Object.assign(window, { swarm2BenchmarkResult: result });
  status.textContent = `Done. Median of ${SAMPLE_COUNT} samples; ${config.frameCount.toLocaleString()} measured frames per sample.`;
  runButton.disabled = false;
}

function submitFrames(renderer, sprites, motionState, config, frameCount) {
  const fadeAmount = 1 - config.fadeAmountPerMs * FIXED_ELAPSED_MS;
  for (let frame = 0; frame < frameCount; frame++) {
    renderer.drawFrame(sprites, motionState, motionState.repelMode, FIXED_ELAPSED_MS, fadeAmount);
  }
}

function createMotionState(config) {
  return {
    width: config.width,
    height: config.height,
    pointerX: config.width * 0.5,
    pointerY: config.height * 0.5,
    repelMode: false
  };
}

function showResult(result) {
  score.textContent = formatNumber(result.score, 0);
  medianFrameTime.textContent = `${formatNumber(result.medianMsPerFrame, 3)} ms`;
  sampleRange.textContent = `${formatNumber(result.minMsPerFrame, 3)}–${formatNumber(result.maxMsPerFrame, 3)} ms`;
}

function clearResult() {
  score.textContent = "—";
  medianFrameTime.textContent = "—";
  sampleRange.textContent = "—";
}

function percentile(sortedValues, fraction) {
  const index = (sortedValues.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function readConfig() {
  return {
    spriteCount: readPositiveInteger(spriteCountInput.value, DEFAULT_SPRITE_COUNT),
    frameCount: readPositiveInteger(frameCountInput.value, DEFAULT_FRAME_COUNT),
    width: readPositiveInteger(canvasWidthInput.value, DEFAULT_WIDTH),
    height: readPositiveInteger(canvasHeightInput.value, DEFAULT_HEIGHT),
    fadeAmountPerMs: DEFAULT_FADE_AMOUNT * FADE_AMOUNT_PER_MS_SCALE
  };
}

function writeConfigToUrl(config) {
  const query = new URLSearchParams();
  query.set("NumberOfSprites", String(config.spriteCount));
  query.set("Frames", String(config.frameCount));
  query.set("Width", String(config.width));
  query.set("Height", String(config.height));
  history.replaceState(null, "", `${location.pathname}?${query}`);
}

function waitForPaint() {
  return new Promise(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}

function readPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function formatNumber(value, maximumFractionDigits) {
  return value.toLocaleString(undefined, { maximumFractionDigits });
}

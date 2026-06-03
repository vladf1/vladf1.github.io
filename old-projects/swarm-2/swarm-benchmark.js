import {
  DEFAULT_FADE_AMOUNT,
  DEFAULT_SPRITE_COUNT,
  FADE_AMOUNT_PER_MS_SCALE,
  FADE_FRAME_INTERVAL,
  createCpuRenderer,
  createLineVertexBuffer,
  createRandom,
  createSprites,
  createWebgpuComputeRenderer,
  createWebgpuRenderer,
  createWebglRenderer,
  updateSprites
} from "./swarm.js?v=43";

const DEFAULT_FRAME_COUNT = 180;
const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 600;
const FIXED_ELAPSED_MS = 1000 / 60;
const SEED = 0x51a7f00d;

const params = new URLSearchParams(location.search);
const spriteCountInput = document.querySelector("#spriteCount");
const frameCountInput = document.querySelector("#frameCount");
const canvasWidthInput = document.querySelector("#canvasWidth");
const canvasHeightInput = document.querySelector("#canvasHeight");
const runButton = document.querySelector("#runButton");
const status = document.querySelector("#status");
const results = document.querySelector("#results");
const cpuCanvas = document.querySelector("#cpuCanvas");
const webglCanvas = document.querySelector("#webglCanvas");
const webgpuCanvas = document.querySelector("#webgpuCanvas");
const webgpuComputeCanvas = document.querySelector("#webgpuComputeCanvas");

spriteCountInput.value = String(readPositiveInteger(params.get("NumberOfSprites"), DEFAULT_SPRITE_COUNT));
frameCountInput.value = String(readPositiveInteger(params.get("Frames"), DEFAULT_FRAME_COUNT));
canvasWidthInput.value = String(readPositiveInteger(params.get("Width"), DEFAULT_WIDTH));
canvasHeightInput.value = String(readPositiveInteger(params.get("Height"), DEFAULT_HEIGHT));

runButton.addEventListener("click", () => {
  runBenchmark();
});

requestAnimationFrame(() => {
  runBenchmark();
});

async function runBenchmark() {
  const config = readConfig();
  writeConfigToUrl(config);
  runButton.disabled = true;
  results.textContent = "";
  status.textContent = `Running ${config.spriteCount.toLocaleString()} sprites for ${config.frameCount.toLocaleString()} frames...`;
  await waitForPaint();

  const motionResult = runMotionBenchmark(config);
  addResultRow(motionResult, null);
  await waitForPaint();

  const cpuResult = await runRendererBenchmark("Old CPU ImageData", createCpuRenderer, cpuCanvas, config);
  addResultRow(cpuResult, cpuResult);
  await waitForPaint();

  const webglResult = await runRendererBenchmark("New WebGL lines", createWebglRenderer, webglCanvas, config);
  addResultRow(webglResult, cpuResult);
  await waitForPaint();

  const webgpuResult = await runRendererBenchmark("WebGPU lines", createWebgpuRenderer, webgpuCanvas, config);
  addResultRow(webgpuResult, cpuResult);
  await waitForPaint();

  const webgpuComputeResult = await runWebgpuComputeBenchmark(config);
  addResultRow(webgpuComputeResult, cpuResult);
  status.textContent = `Done. WebGL was ${formatSpeedup(cpuResult, webglResult)}, WebGPU render-only was ${webgpuResult.supported ? formatSpeedup(cpuResult, webgpuResult) : "unavailable"}, and WebGPU compute was ${webgpuComputeResult.supported ? formatSpeedup(cpuResult, webgpuComputeResult) : "unavailable"} compared with the old CPU renderer.`;
  runButton.disabled = false;
}

function runMotionBenchmark(config) {
  const sprites = createBenchmarkSprites(config);
  const motionState = createMotionState(config);
  const started = performance.now();

  for (let frame = 0; frame < config.frameCount; frame++) {
    updateSprites(sprites, FIXED_ELAPSED_MS, motionState);
  }

  return createResult("Motion only", performance.now() - started, config);
}

async function runRendererBenchmark(name, createRenderer, canvas, config) {
  const renderer = await createRenderer(canvas, config.width, config.height);
  if (renderer === null) {
    return createSkippedResult(name);
  }

  const sprites = createBenchmarkSprites(config);
  const vertices = createLineVertexBuffer(config.spriteCount);
  const motionState = createMotionState(config);
  let fadeFramesElapsed = 0;
  let fadeElapsedMs = 0;
  const started = performance.now();

  for (let frame = 0; frame < config.frameCount; frame++) {
    fadeFramesElapsed++;
    fadeElapsedMs += FIXED_ELAPSED_MS;
    if (fadeFramesElapsed === FADE_FRAME_INTERVAL) {
      renderer.fade(1 - config.fadeAmountPerMs * fadeElapsedMs);
      fadeFramesElapsed = 0;
      fadeElapsedMs = 0;
    }

    updateSprites(sprites, FIXED_ELAPSED_MS, motionState);
    renderer.drawSprites(sprites, vertices, motionState.repelMode);
  }

  if ("finish" in renderer) {
    await renderer.finish();
  }
  return createResult(name, performance.now() - started, config);
}

async function runWebgpuComputeBenchmark(config) {
  const sprites = createBenchmarkSprites(config);
  const motionState = createMotionState(config);
  const renderer = await createWebgpuComputeRenderer(webgpuComputeCanvas, config.width, config.height, sprites, motionState);
  if (renderer === null) {
    return createSkippedResult("WebGPU compute+lines");
  }

  let fadeFramesElapsed = 0;
  let fadeElapsedMs = 0;
  const started = performance.now();

  for (let frame = 0; frame < config.frameCount; frame++) {
    fadeFramesElapsed++;
    fadeElapsedMs += FIXED_ELAPSED_MS;
    let fadeAmount = null;
    if (fadeFramesElapsed === FADE_FRAME_INTERVAL) {
      fadeAmount = 1 - config.fadeAmountPerMs * fadeElapsedMs;
      fadeFramesElapsed = 0;
      fadeElapsedMs = 0;
    }

    renderer.drawFrame(FIXED_ELAPSED_MS, fadeAmount);
  }

  await renderer.finish();
  return createResult("WebGPU compute+lines", performance.now() - started, config);
}

function createBenchmarkSprites(config) {
  return createSprites(config.spriteCount, config.width, config.height, createRandom(SEED));
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

function createResult(name, totalMs, config) {
  const msPerFrame = totalMs / config.frameCount;
  return {
    name,
    totalMs,
    msPerFrame,
    fps: 1000 / msPerFrame,
    supported: true
  };
}

function createSkippedResult(name) {
  return {
    name,
    totalMs: null,
    msPerFrame: null,
    fps: null,
    supported: false
  };
}

function addResultRow(result, cpuResult) {
  const row = document.createElement("tr");
  const speedup = cpuResult === null || !result.supported ? "--" : `${(cpuResult.msPerFrame / result.msPerFrame).toFixed(2)}x`;
  row.innerHTML = `
    <td>${result.name}</td>
    <td>${formatResultNumber(result.totalMs)}</td>
    <td>${formatResultNumber(result.msPerFrame)}</td>
    <td>${formatResultNumber(result.fps)}</td>
    <td>${speedup}</td>
  `;
  results.append(row);
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

function formatNumber(value) {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 2
  });
}

function formatResultNumber(value) {
  return value === null ? "unavailable" : formatNumber(value);
}

function formatSpeedup(cpuResult, result) {
  const speedup = cpuResult.msPerFrame / result.msPerFrame;
  return speedup >= 1 ? `${speedup.toFixed(2)}x faster` : `${(1 / speedup).toFixed(2)}x slower`;
}

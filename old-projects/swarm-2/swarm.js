import {
  DEFAULT_FADE_AMOUNT,
  DEFAULT_SPRITE_COUNT,
  FADE_AMOUNT_PER_MS_SCALE,
  LINE_FLOATS_PER_SPRITE,
  RendererMode,
  createLineVertexBuffer,
  createSprite,
  createSprites,
  setSpriteInteractionDistances,
  updateSprites
} from "./swarm-common.js";
import { createCpuRenderer } from "./swarm-cpu.js";
import { createWebglRenderer } from "./swarm-webgl.js";
import { createWebgpuComputeRenderer } from "./swarm-webgpu.js";

export * from "./swarm-common.js";
export { createCpuRenderer } from "./swarm-cpu.js";
export { createWebglRenderer } from "./swarm-webgl.js";
export { createWebgpuComputeRenderer } from "./swarm-webgpu.js";

export function readSpriteCount(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SPRITE_COUNT;
}

export function readRendererMode(value) {
  if (value === RendererMode.cpu || value === RendererMode.webgl || value === RendererMode.webgpuCompute) {
    return value;
  }
  return RendererMode.webgpuCompute;
}

export async function startSwarmApp() {
  let canvas = document.querySelector("#swarm");
  const stats = document.querySelector("#stats");
  const pauseButton = document.querySelector("#pauseButton");
  const spriteCountInput = document.querySelector("#spriteCount");
  const rendererModeInput = document.querySelector("#rendererMode");
  let hint = document.querySelector("#hint");

  const params = new URLSearchParams(location.search);
  let spriteCount = readSpriteCount(params.get("NumberOfSprites"));
  let rendererMode = readRendererMode(params.get("Renderer"));
  const fadeAmountPerMs = DEFAULT_FADE_AMOUNT * FADE_AMOUNT_PER_MS_SCALE;
  let canvasWidth = 0;
  let canvasHeight = 0;
  let renderer = null;
  let rendererReady = false;
  let rendererGeneration = 0;
  let activeContextType = null;
  let canvasEventsAbortController = null;
  let lineVertices = null;
  let sprites = [];
  let pointerX = -1;
  let pointerY = -1;
  let repelMode = false;
  let lastAnimated = 0;
  let lastTimed = performance.now();
  let framesRendered = 0;
  let fps = null;
  let paused = false;
  let pendingAnimationFrameId = 0;
  const motionState = {
    width: canvasWidth,
    height: canvasHeight,
    pointerX,
    pointerY,
    repelMode
  };

  async function resize() {
    const rect = canvas.getBoundingClientRect();
    canvasWidth = Math.max(1, Math.floor(rect.width));
    canvasHeight = Math.max(1, Math.floor(rect.height));
    motionState.width = canvasWidth;
    motionState.height = canvasHeight;
    setSpriteInteractionDistances(canvasWidth, canvasHeight);

    if (sprites.length === 0) {
      recreateSprites();
    }
    await resetDrawingSurface();
  }

  function renderFrame(now) {
    pendingAnimationFrameId = 0;
    if (paused) {
      return;
    }
    if (!rendererReady || renderer === null) {
      stats.textContent = "Loading renderer...";
      pendingAnimationFrameId = requestAnimationFrame(renderFrame);
      return;
    }

    const elapsedMs = lastAnimated === 0 ? 0 : now - lastAnimated;
    lastAnimated = now;

    if (now - lastTimed >= 1000) {
      fps = framesRendered;
      framesRendered = 0;
      lastTimed = now;
    }

    const frameFadeAmount = 1 - fadeAmountPerMs * elapsedMs;

    if (rendererMode === RendererMode.webgpuCompute) {
      renderer.drawFrame(elapsedMs, frameFadeAmount);
    } else {
      renderer.fade(frameFadeAmount);
      updateSprites(sprites, elapsedMs, motionState);
      renderer.drawSprites(sprites, lineVertices, repelMode);
    }

    stats.textContent = `FPS: ${fps ?? "--"}`;
    framesRendered++;
    pendingAnimationFrameId = requestAnimationFrame(renderFrame);
  }

  function syncControls() {
    pauseButton.textContent = paused ? "Resume" : "Pause";
    pauseButton.setAttribute("aria-pressed", String(paused));
    spriteCountInput.value = String(spriteCount);
    rendererModeInput.value = rendererMode;
  }

  function setPaused(value) {
    paused = value;
    syncControls();
    if (!paused) {
      startAnimation();
    }
  }

  function startAnimation() {
    if (pendingAnimationFrameId !== 0) {
      return;
    }
    lastAnimated = 0;
    pendingAnimationFrameId = requestAnimationFrame(renderFrame);
  }

  function setSpriteCount(value) {
    const nextSpriteCount = readSpriteCount(value);
    if (nextSpriteCount === spriteCount) {
      spriteCountInput.value = String(spriteCount);
      return;
    }
    spriteCount = nextSpriteCount;
    spriteCountInput.value = String(spriteCount);
    resizeSpritePool();
    if (rendererMode === RendererMode.webgpuCompute) {
      resetDrawingSurface();
    }
    writeConfigToUrl();
  }

  async function setRendererMode(value) {
    const nextRendererMode = readRendererMode(value);
    if (nextRendererMode === rendererMode) {
      rendererModeInput.value = rendererMode;
      return;
    }

    rendererMode = nextRendererMode;
    rendererModeInput.value = rendererMode;
    recreateSprites();
    await resetDrawingSurface();
    writeConfigToUrl();
  }

  function recreateSprites() {
    sprites = createSprites(spriteCount, canvasWidth, canvasHeight, Math.random);
    ensureLineVertexCapacity();
  }

  function resizeSpritePool() {
    if (sprites.length > spriteCount) {
      sprites.length = spriteCount;
      ensureLineVertexCapacity();
      return;
    }

    while (sprites.length < spriteCount) {
      sprites.push(createSprite(Math.random, canvasWidth, canvasHeight));
    }
    ensureLineVertexCapacity();
  }

  async function resetDrawingSurface() {
    const generation = rendererGeneration + 1;
    rendererGeneration = generation;
    rendererReady = false;
    ensureLineVertexCapacity();
    const nextContextType = getRendererContextType(rendererMode);
    if (activeContextType !== null && activeContextType !== nextContextType) {
      replaceCanvasElement();
    }
    renderer = await createRendererForMode(rendererMode);
    if (generation !== rendererGeneration) {
      return;
    }
    if (renderer === null) {
      rendererMode = RendererMode.webgl;
      rendererModeInput.value = rendererMode;
      if (nextContextType !== getRendererContextType(rendererMode)) {
        replaceCanvasElement();
      }
      renderer = await createRendererForMode(rendererMode);
    }
    activeContextType = getRendererContextType(rendererMode);
    lastAnimated = 0;
    lastTimed = performance.now();
    framesRendered = 0;
    fps = null;
    rendererReady = true;
  }

  async function createRendererForMode(mode) {
    if (mode === RendererMode.cpu) {
      return createCpuRenderer(canvas, canvasWidth, canvasHeight);
    }
    if (mode === RendererMode.webgpuCompute) {
      return createWebgpuComputeRenderer(canvas, canvasWidth, canvasHeight, sprites, motionState);
    }
    return createWebglRenderer(canvas, canvasWidth, canvasHeight);
  }

  function getRendererContextType(mode) {
    if (mode === RendererMode.cpu) {
      return "2d";
    }
    if (mode === RendererMode.webgpuCompute) {
      return "webgpu";
    }
    return "webgl";
  }

  function replaceCanvasElement() {
    const nextCanvas = canvas.cloneNode(false);
    canvas.replaceWith(nextCanvas);
    canvas = nextCanvas;
    bindCanvasEvents();
  }

  function writeConfigToUrl() {
    const query = new URLSearchParams();
    query.set("NumberOfSprites", String(spriteCount));
    query.set("Renderer", rendererMode);
    history.replaceState(null, "", `${location.pathname}?${query}`);
  }

  function updatePointer(event) {
    const rect = canvas.getBoundingClientRect();
    pointerX = (event.clientX - rect.left) * canvasWidth / rect.width;
    pointerY = (event.clientY - rect.top) * canvasHeight / rect.height;
    motionState.pointerX = pointerX;
    motionState.pointerY = pointerY;
    fadeHint();
  }

  function fadeHint() {
    hint?.classList.add("is-fading");
    hint = null;
  }

  function clearPointer() {
    pointerX = -1;
    pointerY = -1;
    repelMode = false;
    motionState.pointerX = pointerX;
    motionState.pointerY = pointerY;
    motionState.repelMode = repelMode;
  }

  function handleKeyDown(event) {
    if (event.code !== "Space" || event.repeat || isControlElement(event.target)) {
      return;
    }

    event.preventDefault();
    setPaused(!paused);
  }

  function ensureLineVertexCapacity() {
    if (lineVertices !== null && lineVertices.length >= spriteCount * LINE_FLOATS_PER_SPRITE) {
      return;
    }

    lineVertices = createLineVertexBuffer(spriteCount);
  }

  addEventListener("resize", () => {
    resize();
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => {
      resize();
    });
  }
  addEventListener("keydown", handleKeyDown);
  bindCanvasEvents();
  pauseButton.addEventListener("click", () => setPaused(!paused));
  spriteCountInput.addEventListener("input", () => setSpriteCount(spriteCountInput.value));
  spriteCountInput.addEventListener("change", () => setSpriteCount(spriteCountInput.value));
  rendererModeInput.addEventListener("change", () => {
    setRendererMode(rendererModeInput.value);
  });

  syncControls();
  writeConfigToUrl();
  await resize();
  startAnimation();

  function bindCanvasEvents() {
    canvasEventsAbortController?.abort();
    canvasEventsAbortController = new AbortController();
    const options = { signal: canvasEventsAbortController.signal };
    canvas.addEventListener("pointermove", updatePointer, options);
    canvas.addEventListener("pointerleave", clearPointer, options);
    canvas.addEventListener("pointerdown", event => {
      updatePointer(event);
      repelMode = true;
      motionState.repelMode = repelMode;
      canvas.setPointerCapture(event.pointerId);
    }, options);
    canvas.addEventListener("pointerup", event => {
      repelMode = false;
      motionState.repelMode = repelMode;
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    }, options);
    canvas.addEventListener("pointercancel", clearPointer, options);
  }
}

function isControlElement(target) {
  return target instanceof HTMLButtonElement || target instanceof HTMLInputElement;
}

if (document.querySelector("#swarm")) {
  startSwarmApp();
}

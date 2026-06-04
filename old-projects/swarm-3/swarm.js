import {
  DEFAULT_FADE_AMOUNT,
  DEFAULT_SPRITE_COUNT,
  FADE_AMOUNT_PER_MS_SCALE,
  createSprites
} from "./swarm-common.js";
import { MAX_ATTRACTORS, createWebgpuComputeRenderer } from "./swarm-webgpu.js";

export * from "./swarm-common.js";
export { MAX_ATTRACTORS, createWebgpuComputeRenderer } from "./swarm-webgpu.js";

export function readSpriteCount(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SPRITE_COUNT;
}

export async function startSwarmApp() {
  let canvas = document.querySelector("#swarm");
  const stats = document.querySelector("#stats");
  const pauseButton = document.querySelector("#pauseButton");
  const clearAttractorsButton = document.querySelector("#clearAttractorsButton");
  const spriteCountInput = document.querySelector("#spriteCount");
  let hint = document.querySelector("#hint");

  const params = new URLSearchParams(location.search);
  let spriteCount = readSpriteCount(params.get("NumberOfSprites"));
  const fadeAmountPerMs = DEFAULT_FADE_AMOUNT * FADE_AMOUNT_PER_MS_SCALE;
  let canvasWidth = 0;
  let canvasHeight = 0;
  let renderer = null;
  let rendererReady = false;
  let rendererStatus = "Loading WebGPU...";
  let rendererGeneration = 0;
  let canvasEventsAbortController = null;
  let sprites = [];
  let attractors = [];
  let lastAnimated = 0;
  let lastTimed = performance.now();
  let framesRendered = 0;
  let fps = null;
  let paused = false;
  let pendingAnimationFrameId = 0;
  let lastAttractorDropMs = 0;
  const motionState = {
    width: canvasWidth,
    height: canvasHeight
  };

  function resize() {
    const rect = canvas.getBoundingClientRect();
    canvasWidth = Math.max(1, Math.floor(rect.width));
    canvasHeight = Math.max(1, Math.floor(rect.height));
    motionState.width = canvasWidth;
    motionState.height = canvasHeight;

    if (sprites.length === 0) {
      recreateSprites();
    }
    resetDrawingSurface();
  }

  function renderFrame(now) {
    pendingAnimationFrameId = 0;
    if (paused) {
      return;
    }
    if (!rendererReady || renderer === null) {
      stats.textContent = rendererStatus;
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
    renderer.drawFrame(sprites, motionState, elapsedMs, frameFadeAmount);

    stats.textContent = `FPS: ${fps ?? "--"}\nSize: ${canvasWidth} x ${canvasHeight}\nItems: ${attractors.length}`;
    framesRendered++;
    pendingAnimationFrameId = requestAnimationFrame(renderFrame);
  }

  function syncControls() {
    pauseButton.textContent = paused ? "Resume" : "Pause";
    pauseButton.setAttribute("aria-pressed", String(paused));
    spriteCountInput.value = String(spriteCount);
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
    recreateSprites();
    resetDrawingSurface();
    writeConfigToUrl();
  }

  function recreateSprites() {
    sprites = createSprites(spriteCount, canvasWidth, canvasHeight, Math.random);
  }

  async function resetDrawingSurface() {
    const generation = rendererGeneration + 1;
    rendererGeneration = generation;
    rendererReady = false;
    rendererStatus = "Loading WebGPU...";
    renderer = null;
    try {
      renderer = await withTimeout(
        createWebgpuComputeRenderer(canvas, canvasWidth, canvasHeight, sprites, motionState),
        4000,
        "WebGPU initialization timed out"
      );
    } catch (error) {
      if (generation === rendererGeneration) {
        rendererStatus = error instanceof Error ? error.message : "WebGPU unavailable";
      }
      return;
    }
    if (generation !== rendererGeneration) {
      return;
    }
    if (renderer === null) {
      rendererStatus = getWebgpuUnavailableMessage();
      return;
    }
    renderer.setAttractors(attractors);
    lastAnimated = 0;
    lastTimed = performance.now();
    framesRendered = 0;
    fps = null;
    rendererReady = true;
  }

  function writeConfigToUrl() {
    const query = new URLSearchParams();
    query.set("NumberOfSprites", String(spriteCount));
    history.replaceState(null, "", `${location.pathname}?${query}`);
  }

  function dropAttractor(event) {
    if (isControlElement(event.target)) {
      return;
    }
    event.preventDefault();
    const now = performance.now();
    if (now - lastAttractorDropMs < 350) {
      return;
    }
    lastAttractorDropMs = now;

    const rect = canvas.getBoundingClientRect();
    const point = getEventPoint(event);
    const x = (point.clientX - rect.left) * canvasWidth / rect.width;
    const y = (point.clientY - rect.top) * canvasHeight / rect.height;
    attractors.push({ x, y });
    if (attractors.length > MAX_ATTRACTORS) {
      attractors = attractors.slice(-MAX_ATTRACTORS);
    }
    renderer?.setAttractors(attractors);
    fadeHint();
  }

  function clearAttractors(event) {
    event?.preventDefault();
    event?.stopPropagation();
    attractors = [];
    renderer?.setAttractors(attractors);
  }

  function fadeHint() {
    hint?.classList.add("is-fading");
    hint = null;
  }

  function handleKeyDown(event) {
    if (event.code !== "Space" || event.repeat || isControlElement(event.target)) {
      return;
    }

    event.preventDefault();
    setPaused(!paused);
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
  clearAttractorsButton.addEventListener("click", clearAttractors);
  spriteCountInput.addEventListener("input", () => setSpriteCount(spriteCountInput.value));
  spriteCountInput.addEventListener("change", () => setSpriteCount(spriteCountInput.value));

  syncControls();
  writeConfigToUrl();
  resize();
  startAnimation();

  function bindCanvasEvents() {
    canvasEventsAbortController?.abort();
    canvasEventsAbortController = new AbortController();
    canvas.addEventListener("pointerdown", dropAttractor, { signal: canvasEventsAbortController.signal });
    canvas.addEventListener("touchstart", dropAttractor, { passive: false, signal: canvasEventsAbortController.signal });
    canvas.addEventListener("mousedown", dropAttractor, { signal: canvasEventsAbortController.signal });
  }
}

function getEventPoint(event) {
  return event.touches?.[0] ?? event.changedTouches?.[0] ?? event;
}

function getWebgpuUnavailableMessage() {
  if (!("gpu" in navigator)) {
    return "WebGPU unavailable in this browser.";
  }
  return "WebGPU unavailable.";
}

function withTimeout(promise, timeoutMs, message) {
  return Promise.race([
    promise,
    new Promise((resolve, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs);
    })
  ]);
}

function isControlElement(target) {
  return target instanceof HTMLButtonElement || target instanceof HTMLInputElement;
}

if (document.querySelector("#swarm")) {
  startSwarmApp();
}

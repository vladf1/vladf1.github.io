import {
  DEFAULT_FADE_AMOUNT,
  FADE_AMOUNT_PER_MS_SCALE
} from "./swarm-common.js";
import {
  APPLE_BITE_PERCENT_PER_SECOND,
  MAX_APPLES
} from "./swarm-apples.js";
import { DEFAULT_WORM_COUNT, createWorms } from "./swarm-worms.js";
import { createWebgpuComputeRenderer } from "./swarm-webgpu.js";

export * from "./swarm-common.js";
export * from "./swarm-apples.js";
export * from "./swarm-worms.js";
export { createWebgpuComputeRenderer } from "./swarm-webgpu.js";

export async function startSwarmApp() {
  let canvas = document.querySelector("#swarm");
  const stats = document.querySelector("#stats");
  const pauseButton = document.querySelector("#pauseButton");
  const resetApplesButton = document.querySelector("#resetApplesButton");
  const wormCountInput = document.querySelector("#wormCount");
  const notice = document.querySelector("#notice");
  let hint = document.querySelector("#hint");

  const params = new URLSearchParams(location.search);
  const initialWormCount = Number.parseInt(params.get("NumberOfSprites"), 10);
  let wormCount = Number.isFinite(initialWormCount) && initialWormCount > 0 ? initialWormCount : DEFAULT_WORM_COUNT;
  let appleBitePercentPerSecond = APPLE_BITE_PERCENT_PER_SECOND * DEFAULT_WORM_COUNT / wormCount;
  const fadeAmountPerMs = DEFAULT_FADE_AMOUNT * FADE_AMOUNT_PER_MS_SCALE;
  let canvasWidth = 0;
  let canvasHeight = 0;
  let renderer = null;
  let rendererReady = false;
  let rendererStatus = "Loading WebGPU...";
  let rendererGeneration = 0;
  let worms = [];
  let appleVolumes = [];
  let lastAnimated = 0;
  let lastTimed = performance.now();
  let framesRendered = 0;
  let fps = null;
  let appleStats = "none";
  let paused = false;
  let pendingAnimationFrameId = 0;
  let lastApplePlantMs = 0;
  let noticeTimeoutId = 0;
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

    if (worms.length === 0) {
      recreateWorms();
      resetDrawingSurface();
      return;
    }
    if (rendererReady && renderer !== null) {
      renderer.resize(canvasWidth, canvasHeight);
      return;
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
      renderer.requestAppleSnapshot(syncApplesFromGpu);
    }

    const frameFadeAmount = 1 - fadeAmountPerMs * elapsedMs;
    renderer.drawFrame(worms, motionState, elapsedMs, frameFadeAmount, appleBitePercentPerSecond);

    stats.textContent = `FPS: ${fps ?? "--"}\nApples: ${appleStats}`;
    framesRendered++;
    pendingAnimationFrameId = requestAnimationFrame(renderFrame);
  }

  function syncControls() {
    pauseButton.textContent = paused ? "Resume" : "Pause";
    pauseButton.setAttribute("aria-pressed", String(paused));
    wormCountInput.value = String(wormCount);
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

  function setWormCount(value) {
    const parsed = Number.parseInt(value, 10);
    const nextWormCount = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_WORM_COUNT;
    if (nextWormCount === wormCount) {
      wormCountInput.value = String(wormCount);
      return;
    }
    wormCount = nextWormCount;
    appleBitePercentPerSecond = APPLE_BITE_PERCENT_PER_SECOND * DEFAULT_WORM_COUNT / wormCount;
    wormCountInput.value = String(wormCount);
    recreateWorms();
    resetDrawingSurface();
    writeConfigToUrl();
  }

  function recreateWorms() {
    worms = createWorms(wormCount, canvasWidth, canvasHeight, Math.random);
  }

  async function resetDrawingSurface() {
    const generation = rendererGeneration + 1;
    rendererGeneration = generation;
    rendererReady = false;
    rendererStatus = "Loading WebGPU...";
    renderer = null;
    try {
      renderer = await Promise.race([
        createWebgpuComputeRenderer(canvas, canvasWidth, canvasHeight, worms, motionState),
        new Promise((resolve, reject) => {
          setTimeout(() => reject(new Error("WebGPU initialization timed out")), 4000);
        })
      ]);
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
      rendererStatus = "gpu" in navigator ? "WebGPU unavailable." : "WebGPU unavailable in this browser.";
      return;
    }
    renderer.resetApples();
    appleVolumes = [];
    updateAppleStatsText();
    lastAnimated = 0;
    lastTimed = performance.now();
    framesRendered = 0;
    fps = null;
    rendererReady = true;
  }

  function writeConfigToUrl() {
    const query = new URLSearchParams();
    query.set("NumberOfSprites", String(wormCount));
    history.replaceState(null, "", `${location.pathname}?${query}`);
  }

  function plantApple(event) {
    if (isControlElement(event.target)) {
      return;
    }
    event.preventDefault();
    const now = performance.now();
    if (now - lastApplePlantMs < 350) {
      return;
    }
    lastApplePlantMs = now;

    const rect = canvas.getBoundingClientRect();
    const { x, y } = canvasPointFromEvent(event, rect);
    if (!rendererReady || renderer === null) {
      return;
    }
    if (appleVolumes.length >= MAX_APPLES) {
      showNotice(`Max apples reached (${MAX_APPLES})`);
      return;
    }

    if (!renderer.queueApplePlacement(x, y)) {
      showNotice("Apple queue is full");
      return;
    }

    appleVolumes.push(1);
    updateAppleStatsText();
    hint?.classList.add("is-fading");
    hint = null;
  }

  function updateApplePreview(event) {
    if (!rendererReady || renderer === null || isControlElement(event.target)) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const { x, y } = canvasPointFromEvent(event, rect);
    renderer.setApplePreview(x, y, true);
  }

  function hideApplePreview() {
    renderer?.setApplePreview(0, 0, false);
  }

  function resetApples(event) {
    event?.preventDefault();
    event?.stopPropagation();
    appleVolumes = [];
    updateAppleStatsText();
    renderer?.resetApples();
  }

  function syncApplesFromGpu(snapshot) {
    const nextAppleVolumes = [];
    for (let index = 0; index < MAX_APPLES; index++) {
      const offset = index * 4;
      const volume = snapshot[offset + 2] ?? 0;
      if (volume <= 0) {
        continue;
      }

      nextAppleVolumes.push(volume);
    }
    appleVolumes = nextAppleVolumes;
    updateAppleStatsText();
  }

  function updateAppleStatsText() {
    appleStats = appleVolumes.length === 0 ? "none" : appleVolumes.map(volume => `${Math.round(volume * 100)}%`).join(" ");
  }

  function canvasPointFromEvent(event, rect) {
    const point = event.touches?.[0] ?? event.changedTouches?.[0] ?? event;
    return {
      x: (point.clientX - rect.left) * canvasWidth / rect.width,
      y: (point.clientY - rect.top) * canvasHeight / rect.height
    };
  }

  function showNotice(message) {
    clearTimeout(noticeTimeoutId);
    notice.textContent = message;
    notice.classList.add("is-visible");
    noticeTimeoutId = setTimeout(() => {
      notice.classList.remove("is-visible");
    }, 1400);
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
  canvas.addEventListener("pointermove", updateApplePreview);
  canvas.addEventListener("pointerleave", hideApplePreview);
  canvas.addEventListener("pointercancel", hideApplePreview);
  canvas.addEventListener("pointerdown", plantApple);
  canvas.addEventListener("touchstart", plantApple, { passive: false });
  canvas.addEventListener("mousedown", plantApple);
  pauseButton.addEventListener("click", () => setPaused(!paused));
  resetApplesButton.addEventListener("click", resetApples);
  wormCountInput.addEventListener("input", () => setWormCount(wormCountInput.value));
  wormCountInput.addEventListener("change", () => setWormCount(wormCountInput.value));

  syncControls();
  writeConfigToUrl();
  resize();
  startAnimation();
}

function isControlElement(target) {
  return target instanceof HTMLButtonElement || target instanceof HTMLInputElement;
}

if (document.querySelector("#swarm")) {
  startSwarmApp();
}

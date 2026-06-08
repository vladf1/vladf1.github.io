import * as webgpu from "./swarm-3-webgpu";

type WebgpuRenderer = Awaited<ReturnType<typeof webgpu.createWebgpuComputeRenderer>>;
type AppleState = {
  x: number;
  y: number;
  volume: number;
  radius: number;
};
type RepellentState = {
  x: number;
  y: number;
};

export async function startSwarmApp() {
  const canvas = document.querySelector<HTMLCanvasElement>("#swarm")!;
  const stats = document.querySelector<HTMLDivElement>("#stats")!;
  const pauseButton = document.querySelector<HTMLButtonElement>("#pauseButton")!;
  const resetApplesButton = document.querySelector<HTMLButtonElement>("#resetApplesButton")!;
  const wormCountInput = document.querySelector<HTMLInputElement>("#wormCount")!;
  const crazinessInput = document.querySelector<HTMLInputElement>("#craziness")!;
  const speedInput = document.querySelector<HTMLInputElement>("#speed")!;
  const notice = document.querySelector<HTMLDivElement>("#notice")!;
  let hint = document.querySelector<HTMLDivElement>("#hint");

  const params = new URLSearchParams(location.search);
  const initialWormCount = Number.parseInt(params.get("NumberOfSprites") ?? "", 10);
  const initialCraziness = Number.parseFloat(params.get("Craziness") ?? "");
  const initialSpeed = Number.parseFloat(params.get("Speed") ?? "");
  let wormCount = Math.min(
    Number.isFinite(initialWormCount) && initialWormCount > 0 ? initialWormCount : webgpu.DEFAULT_WORM_COUNT,
    webgpu.MAX_SAFE_WORM_COUNT
  );
  let craziness = clampNumber(
    Number.isFinite(initialCraziness) ? initialCraziness : webgpu.DEFAULT_CRAZINESS,
    webgpu.MIN_CRAZINESS,
    webgpu.MAX_CRAZINESS
  );
  let speed = clampNumber(
    Number.isFinite(initialSpeed) ? initialSpeed : webgpu.DEFAULT_SPEED,
    webgpu.MIN_SPEED,
    webgpu.MAX_SPEED
  );
  let maxWormCount = webgpu.MAX_SAFE_WORM_COUNT;
  let appleBitePercentPerSecond = webgpu.APPLE_BITE_PERCENT_PER_SECOND * webgpu.DEFAULT_WORM_COUNT / wormCount;
  const fadeAmountPerMs = webgpu.DEFAULT_FADE_AMOUNT * webgpu.FADE_AMOUNT_PER_MS_SCALE;
  let canvasWidth = 0;
  let canvasHeight = 0;
  let canvasRenderWidth = 0;
  let canvasRenderHeight = 0;
  let renderer: WebgpuRenderer | null = null;
  let rendererReady = false;
  let rendererStatus = "Loading WebGPU...";
  let rendererGeneration = 0;
  let apples: AppleState[] = [];
  let repellents: RepellentState[] = [];
  let lastAnimated = 0;
  let lastTimed = performance.now();
  let framesRendered = 0;
  let fps: number | null = null;
  let appleStats = "none";
  let paused = false;
  let pendingAnimationFrameId = 0;
  let lastApplePlantMs = 0;
  let lastRepellentPlantMs = 0;
  let noticeTimeoutId = 0;
  let repellentX = 0;
  let repellentY = 0;
  let placingRepellent = false;
  let cursorVisible = false;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    canvasWidth = Math.max(1, Math.floor(rect.width));
    canvasHeight = Math.max(1, Math.floor(rect.height));
    const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
    canvasRenderWidth = Math.max(1, Math.round(canvasWidth * pixelRatio));
    canvasRenderHeight = Math.max(1, Math.round(canvasHeight * pixelRatio));

    if (rendererReady && renderer !== null) {
      renderer.resize(canvasWidth, canvasHeight, canvasRenderWidth, canvasRenderHeight);
      return;
    }
    resetDrawingSurface();
  }

  function renderFrame(now: number) {
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
      if (apples.length > 0) {
        renderer.requestAppleSnapshot(syncApplesFromGpu);
      }
    }

    const frameFadeAmount = 1 - fadeAmountPerMs * elapsedMs;
    let activeRepellentX = repellentX;
    let activeRepellentY = repellentY;
    let activeRepellent = false;
    if (repellents.length > 0) {
      const repellent = repellents[framesRendered % repellents.length]!;
      activeRepellentX = repellent.x;
      activeRepellentY = repellent.y;
      activeRepellent = true;
    }
    try {
      renderer.drawFrame(
        elapsedMs,
        frameFadeAmount,
        appleBitePercentPerSecond,
        craziness,
        speed,
        apples.length > 0,
        activeRepellentX,
        activeRepellentY,
        activeRepellent ? 1 : 0
      );
    } catch (error) {
      rendererReady = false;
      rendererStatus = error instanceof Error ? error.message : "WebGPU frame failed";
      stats.textContent = rendererStatus;
      return;
    }

    updateStatsText();
    framesRendered++;
    pendingAnimationFrameId = requestAnimationFrame(renderFrame);
  }

  function syncControls() {
    pauseButton.textContent = paused ? "Resume" : "Pause";
    pauseButton.setAttribute("aria-pressed", String(paused));
    wormCountInput.value = String(wormCount);
    crazinessInput.value = String(craziness);
    speedInput.value = String(speed);
  }

  function setPaused(value: boolean) {
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

  function setWormCount(value: string) {
    const parsed = Number.parseInt(value, 10);
    const nextWormCount = Math.min(
      Number.isFinite(parsed) && parsed > 0 ? parsed : webgpu.DEFAULT_WORM_COUNT,
      maxWormCount
    );
    if (nextWormCount === wormCount) {
      wormCountInput.value = String(wormCount);
      return;
    }
    if (Number.isFinite(parsed) && parsed > maxWormCount) {
      showNotice(`WebGPU limit: ${maxWormCount.toLocaleString()} worms`);
    }
    wormCount = nextWormCount;
    appleBitePercentPerSecond = webgpu.APPLE_BITE_PERCENT_PER_SECOND * webgpu.DEFAULT_WORM_COUNT / wormCount;
    wormCountInput.value = String(wormCount);
    if (!rendererReady || renderer === null || !renderer.setWormCount(wormCount)) {
      resetDrawingSurface();
    }
    writeConfigToUrl();
  }

  function setCraziness(value: string) {
    const parsed = Number.parseFloat(value);
    craziness = clampNumber(
      Number.isFinite(parsed) ? parsed : webgpu.DEFAULT_CRAZINESS,
      webgpu.MIN_CRAZINESS,
      webgpu.MAX_CRAZINESS
    );
    crazinessInput.value = String(craziness);
    writeConfigToUrl();
  }

  function setSpeed(value: string) {
    const parsed = Number.parseFloat(value);
    speed = clampNumber(
      Number.isFinite(parsed) ? parsed : webgpu.DEFAULT_SPEED,
      webgpu.MIN_SPEED,
      webgpu.MAX_SPEED
    );
    speedInput.value = String(speed);
    writeConfigToUrl();
  }

  async function resetDrawingSurface() {
    const generation = rendererGeneration + 1;
    rendererGeneration = generation;
    rendererReady = false;
    rendererStatus = "Loading WebGPU...";
    renderer = null;
    try {
      renderer = await Promise.race([
        webgpu.createWebgpuComputeRenderer(canvas, canvasWidth, canvasHeight, canvasRenderWidth, canvasRenderHeight, wormCount),
        new Promise<never>((_resolve, reject) => {
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
    maxWormCount = Math.min(renderer.maxSupportedWormCount, webgpu.MAX_SAFE_WORM_COUNT);
    wormCountInput.max = String(maxWormCount);
    renderer.resetApples();
    renderer.device.lost.then((info: GPUDeviceLostInfo) => {
      if (generation !== rendererGeneration) {
        return;
      }
      rendererReady = false;
      renderer = null;
      rendererStatus = `WebGPU device lost: ${info.message || info.reason}`;
      stats.textContent = rendererStatus;
    });
    apples = [];
    renderer.setRepellents(repellents);
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
    query.set("Craziness", formatNumber(craziness));
    query.set("Speed", formatNumber(speed));
    history.replaceState(null, "", `${location.pathname}?${query}`);
  }

  function plantApple(event: PointerEvent | TouchEvent | MouseEvent) {
    if (isControlElement(event.target)) {
      return;
    }
    event.preventDefault();
    if ("shiftKey" in event && event.shiftKey) {
      plantRepellent(event);
      return;
    }

    const now = performance.now();
    if (now - lastApplePlantMs < 350) {
      return;
    }
    lastApplePlantMs = now;

    const rect = canvas.getBoundingClientRect();
    const { x, y } = clampAppleCenter(canvasPointFromEvent(event, rect));
    if (!rendererReady || renderer === null) {
      return;
    }
    if (apples.length >= webgpu.MAX_APPLES) {
      showNotice(`Max apples reached (${webgpu.MAX_APPLES})`);
      return;
    }
    if (overlapsExistingApple(x, y, webgpu.APPLE_MAX_RADIUS)) {
      showNotice("Too close to another apple");
      return;
    }

    if (!renderer.queueApplePlacement(x, y)) {
      showNotice("Apple queue is full");
      return;
    }

    apples.push({ x, y, volume: 1, radius: webgpu.APPLE_MAX_RADIUS });
    updateAppleStatsText();
    dismissHint();
  }

  function plantRepellent(event: PointerEvent | TouchEvent | MouseEvent) {
    const now = performance.now();
    if (now - lastRepellentPlantMs < 350) {
      return;
    }
    lastRepellentPlantMs = now;

    const rect = canvas.getBoundingClientRect();
    const point = canvasPointFromEvent(event, rect);
    if (!rendererReady || renderer === null) {
      return;
    }

    const existingIndex = repellents.findIndex(repellent => {
      const dx = repellent.x - point.x;
      const dy = repellent.y - point.y;
      return dx * dx + dy * dy < 34 * 34;
    });
    if (existingIndex >= 0) {
      repellents.splice(existingIndex, 1);
      renderer.setRepellents(repellents);
      renderer.setApplePreview(0, 0, false);
      showNotice("Repellent removed");
      return;
    }

    if (repellents.length >= webgpu.MAX_REPELLENTS) {
      showNotice(`Max repellents reached (${webgpu.MAX_REPELLENTS})`);
      return;
    }

    const repellent = clampRepellentCenter(point);
    repellents.push(repellent);
    renderer.setRepellents(repellents);
    renderer.setApplePreview(0, 0, false);
    dismissHint();
  }

  function updateApplePreview(event: PointerEvent) {
    if (!rendererReady || renderer === null || isControlElement(event.target)) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const { x, y } = canvasPointFromEvent(event, rect);
    repellentX = x;
    repellentY = y;
    placingRepellent = event.shiftKey;
    cursorVisible = true;
    if (placingRepellent) {
      dismissHint();
    }
    updateStatsText();
    renderer.setApplePreview(x, y, true, placingRepellent);
  }

  function hideApplePreview() {
    placingRepellent = false;
    cursorVisible = false;
    updateStatsText();
    renderer?.setApplePreview(0, 0, false);
  }

  function resetSimulation(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    apples = [];
    repellents = [];
    updateAppleStatsText();
    renderer?.resetApples();
    renderer?.setRepellents(repellents);
  }

  function syncApplesFromGpu(snapshot: Float32Array) {
    const nextApples = [];
    for (let index = 0; index < webgpu.MAX_APPLES; index++) {
      const offset = index * 4;
      const volume = snapshot[offset + 2] ?? 0;
      if (volume <= 0) {
        continue;
      }

      nextApples.push({
        x: snapshot[offset] ?? 0,
        y: snapshot[offset + 1] ?? 0,
        volume,
        radius: snapshot[offset + 3] ?? 0
      });
    }
    apples = nextApples;
    updateAppleStatsText();
  }

  function updateAppleStatsText() {
    appleStats = apples.length === 0 ? "none" : apples.map(apple => `${Math.round(apple.volume * 100)}%`).join(" ");
    updateStatsText();
  }

  function updateStatsText() {
    stats.textContent = `FPS: ${fps ?? "--"}\nApples: ${appleStats}\nMode: ${placingRepellent ? "Placing repellents" : "Placing apples"}`;
  }

  function dismissHint() {
    hint?.classList.add("is-fading");
    hint = null;
  }

  function clampAppleCenter(point: { x: number; y: number }) {
    const minCenter = webgpu.APPLE_MAX_RADIUS;
    return {
      x: Math.max(minCenter, Math.min(point.x, Math.max(canvasWidth - minCenter, minCenter))),
      y: Math.max(minCenter, Math.min(point.y, Math.max(canvasHeight - minCenter, minCenter)))
    };
  }

  function clampRepellentCenter(point: { x: number; y: number }) {
    const minCenter = webgpu.REPELLENT_MARKER_RADIUS;
    return {
      x: Math.max(minCenter, Math.min(point.x, Math.max(canvasWidth - minCenter, minCenter))),
      y: Math.max(minCenter, Math.min(point.y, Math.max(canvasHeight - minCenter, minCenter)))
    };
  }

  function overlapsExistingApple(x: number, y: number, radius: number) {
    return apples.some(apple => {
      const minDistance = apple.radius + radius;
      const dx = apple.x - x;
      const dy = apple.y - y;
      return dx * dx + dy * dy < minDistance * minDistance;
    });
  }

  function canvasPointFromEvent(event: PointerEvent | MouseEvent | TouchEvent, rect: DOMRect) {
    const point = "touches" in event
      ? event.touches[0] ?? event.changedTouches[0]
      : event;
    return {
      x: (point.clientX - rect.left) * canvasWidth / rect.width,
      y: (point.clientY - rect.top) * canvasHeight / rect.height
    };
  }

  function showNotice(message: string) {
    clearTimeout(noticeTimeoutId);
    notice.textContent = message;
    notice.classList.add("is-visible");
    noticeTimeoutId = setTimeout(() => {
      notice.classList.remove("is-visible");
    }, 1400);
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
      placingRepellent = true;
      dismissHint();
      updateStatsText();
      if (cursorVisible) {
        renderer?.setApplePreview(repellentX, repellentY, true, true);
      }
      return;
    }

    if (event.code !== "Space" || event.repeat || isControlElement(event.target)) {
      return;
    }

    event.preventDefault();
    setPaused(!paused);
  }

  function handleKeyUp(event: KeyboardEvent) {
    if (event.code !== "ShiftLeft" && event.code !== "ShiftRight") {
      return;
    }

    placingRepellent = false;
    updateStatsText();
    if (cursorVisible) {
      renderer?.setApplePreview(repellentX, repellentY, true, false);
    }
  }

  addEventListener("resize", resize);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", resize);
  }
  addEventListener("keydown", handleKeyDown);
  addEventListener("keyup", handleKeyUp);
  canvas.addEventListener("pointermove", updateApplePreview);
  canvas.addEventListener("pointerleave", hideApplePreview);
  canvas.addEventListener("pointercancel", hideApplePreview);
  canvas.addEventListener("pointerdown", plantApple);
  canvas.addEventListener("touchstart", plantApple, { passive: false });
  canvas.addEventListener("mousedown", plantApple);
  pauseButton.addEventListener("click", () => setPaused(!paused));
  resetApplesButton.addEventListener("click", resetSimulation);
  wormCountInput.addEventListener("input", () => setWormCount(wormCountInput.value));
  wormCountInput.addEventListener("change", () => setWormCount(wormCountInput.value));
  crazinessInput.addEventListener("input", () => setCraziness(crazinessInput.value));
  crazinessInput.addEventListener("change", () => setCraziness(crazinessInput.value));
  speedInput.addEventListener("input", () => setSpeed(speedInput.value));
  speedInput.addEventListener("change", () => setSpeed(speedInput.value));

  syncControls();
  updateStatsText();
  wormCountInput.max = String(maxWormCount);
  crazinessInput.min = String(webgpu.MIN_CRAZINESS);
  crazinessInput.max = String(webgpu.MAX_CRAZINESS);
  speedInput.min = String(webgpu.MIN_SPEED);
  speedInput.max = String(webgpu.MAX_SPEED);
  if (Number.isFinite(initialWormCount) && initialWormCount > webgpu.MAX_SAFE_WORM_COUNT) {
    showNotice(`WebGPU limit: ${webgpu.MAX_SAFE_WORM_COUNT.toLocaleString()} worms`);
  }
  writeConfigToUrl();
  resize();
  startAnimation();
}

function isControlElement(target: EventTarget | null) {
  return target instanceof HTMLButtonElement || target instanceof HTMLInputElement;
}

function clampNumber(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

if (document.querySelector("#swarm")) {
  startSwarmApp();
}

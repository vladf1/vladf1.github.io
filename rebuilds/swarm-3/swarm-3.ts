const DEFAULT_TRIANGLE_COUNT = 2500;
const MIN_TRIANGLE_COUNT = 10;
const MAX_TRIANGLE_COUNT = 25000;
const MIN_CRAZINESS = 0;
const DEFAULT_CRAZINESS = 1;
const MAX_CRAZINESS = 3;
const MIN_SPEED = 0.1;
const DEFAULT_SPEED = 1;
const MAX_SPEED = 3;
const MAX_APPLES = 64;
const MAX_REPELLENTS = 32;
const APPLE_MAX_RADIUS = 62;
const APPLE_GRAVITY_RADIUS_SCALE = 7.2;
const APPLE_BITE_PER_TRIANGLE_PER_MS = 0.000000075;
const REPELLENT_RADIUS = 300;
const REPELLENT_MARKER_RADIUS = 34;
const REPELLENT_RAYS = 8;
const TWO_PI = Math.PI * 2;

type Point = {
  x: number;
  y: number;
};

type Triangle = Point & {
  angle: number;
  baseSpeed: number;
  color: string;
  size: number;
  wobble: number;
};

type AppleState = Point & {
  volume: number;
  radius: number;
};

type RepellentState = Point;

export function startTriangleSwarmApp() {
  const canvas = document.querySelector<HTMLCanvasElement>("#swarm")!;
  const context = canvas.getContext("2d", { alpha: false })!;
  const stats = document.querySelector<HTMLDivElement>("#stats")!;
  const pauseButton = document.querySelector<HTMLButtonElement>("#pauseButton")!;
  const resetApplesButton = document.querySelector<HTMLButtonElement>("#resetApplesButton")!;
  const triangleCountInput = document.querySelector<HTMLInputElement>("#wormCount")!;
  const crazinessInput = document.querySelector<HTMLInputElement>("#craziness")!;
  const speedInput = document.querySelector<HTMLInputElement>("#speed")!;
  const notice = document.querySelector<HTMLDivElement>("#notice")!;
  let hint = document.querySelector<HTMLDivElement>("#hint");

  const params = new URLSearchParams(location.search);
  const initialTriangleCount = Number.parseInt(params.get("NumberOfSprites") ?? "", 10);
  const initialCraziness = Number.parseFloat(params.get("Craziness") ?? "");
  const initialSpeed = Number.parseFloat(params.get("Speed") ?? "");
  let triangleCount = clampInteger(
    Number.isFinite(initialTriangleCount) && initialTriangleCount > 0 ? initialTriangleCount : DEFAULT_TRIANGLE_COUNT,
    MIN_TRIANGLE_COUNT,
    MAX_TRIANGLE_COUNT
  );
  let craziness = clampNumber(
    Number.isFinite(initialCraziness) ? initialCraziness : DEFAULT_CRAZINESS,
    MIN_CRAZINESS,
    MAX_CRAZINESS
  );
  let speed = clampNumber(
    Number.isFinite(initialSpeed) ? initialSpeed : DEFAULT_SPEED,
    MIN_SPEED,
    MAX_SPEED
  );
  let canvasWidth = 1;
  let canvasHeight = 1;
  let triangles: Triangle[] = [];
  let apples: AppleState[] = [];
  let repellents: RepellentState[] = [];
  let paused = false;
  let pendingAnimationFrameId = 0;
  let lastAnimated = 0;
  let lastTimed = performance.now();
  let framesRendered = 0;
  let fps: number | null = null;
  let appleStats = "none";
  let statsText = "";
  let statsDirty = true;
  let noticeTimeoutId = 0;
  let lastApplePlantMs = 0;
  let lastRepellentPlantMs = 0;
  let cursorX = 0;
  let cursorY = 0;
  let placingRepellent = false;
  let cursorVisible = false;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const nextWidth = Math.max(1, Math.floor(rect.width));
    const nextHeight = Math.max(1, Math.floor(rect.height));
    const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
    canvasWidth = nextWidth;
    canvasHeight = nextHeight;
    canvas.width = Math.max(1, Math.round(nextWidth * pixelRatio));
    canvas.height = Math.max(1, Math.round(nextHeight * pixelRatio));
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    for (const triangle of triangles) {
      triangle.x = clampNumber(triangle.x, 0, canvasWidth);
      triangle.y = clampNumber(triangle.y, 0, canvasHeight);
    }
  }

  function renderFrame(now: number) {
    pendingAnimationFrameId = 0;
    if (paused) {
      return;
    }

    const elapsedMs = lastAnimated === 0 ? 16.6667 : Math.min(48, Math.max(0, now - lastAnimated));
    lastAnimated = now;
    if (now - lastTimed >= 1000) {
      fps = framesRendered;
      framesRendered = 0;
      lastTimed = now;
      statsDirty = true;
    }

    updateAndDraw(elapsedMs);
    if (statsDirty) {
      updateStatsText();
    }
    framesRendered++;
    pendingAnimationFrameId = requestAnimationFrame(renderFrame);
  }

  function updateAndDraw(elapsedMs: number) {
    context.fillStyle = "black";
    context.fillRect(0, 0, canvasWidth, canvasHeight);
    drawApples();
    drawRepellents();

    const appleGravityRadius = APPLE_MAX_RADIUS * APPLE_GRAVITY_RADIUS_SCALE;
    const appleGravityRadiusSquared = appleGravityRadius * appleGravityRadius;
    const repellentRadiusSquared = REPELLENT_RADIUS * REPELLENT_RADIUS;
    const biteScale = DEFAULT_TRIANGLE_COUNT / Math.max(1, triangleCount);
    let applesChanged = false;

    for (const triangle of triangles) {
      triangle.angle += (Math.random() - 0.5) * triangle.wobble * craziness * elapsedMs;
      let steerX = Math.cos(triangle.angle);
      let steerY = Math.sin(triangle.angle);

      for (const apple of apples) {
        if (apple.volume <= 0) {
          continue;
        }
        const dx = apple.x - triangle.x;
        const dy = apple.y - triangle.y;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared < appleGravityRadiusSquared) {
          const distance = Math.max(1, Math.sqrt(distanceSquared));
          const falloff = 1 - distance / appleGravityRadius;
          const pull = falloff * falloff * (0.35 + craziness * 0.13) * Math.sqrt(apple.volume);
          steerX += dx / distance * pull;
          steerY += dy / distance * pull;
          if (distanceSquared < apple.radius * apple.radius) {
            apple.volume -= APPLE_BITE_PER_TRIANGLE_PER_MS * elapsedMs * biteScale;
            applesChanged = true;
          }
        }
      }

      for (const repellent of repellents) {
        const dx = triangle.x - repellent.x;
        const dy = triangle.y - repellent.y;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared > 1 && distanceSquared < repellentRadiusSquared) {
          const distance = Math.sqrt(distanceSquared);
          const falloff = 1 - distance / REPELLENT_RADIUS;
          const push = falloff * falloff * (2.4 + craziness * 0.38);
          steerX += dx / distance * push;
          steerY += dy / distance * push;
        }
      }

      const steerLength = Math.hypot(steerX, steerY) || 1;
      const targetAngle = Math.atan2(steerY / steerLength, steerX / steerLength);
      triangle.angle = turnTowardAngle(triangle.angle, targetAngle, Math.min(1, 0.36 + craziness * 0.12));
      const distance = triangle.baseSpeed * speed * elapsedMs;
      triangle.x += Math.cos(triangle.angle) * distance;
      triangle.y += Math.sin(triangle.angle) * distance;
      bounceTriangle(triangle);
      drawTriangle(triangle);
    }

    if (applesChanged) {
      apples = apples.filter(apple => apple.volume > 0.01);
      updateAppleStatsText();
    }
    drawPreview();
  }

  function drawTriangle(triangle: Triangle) {
    const forwardX = Math.cos(triangle.angle);
    const forwardY = Math.sin(triangle.angle);
    const sideX = -forwardY;
    const sideY = forwardX;
    const nose = triangle.size * 1.35;
    const tail = triangle.size * 0.82;
    const halfWidth = triangle.size * 0.62;
    const tipX = triangle.x + forwardX * nose;
    const tipY = triangle.y + forwardY * nose;
    const tailX = triangle.x - forwardX * tail;
    const tailY = triangle.y - forwardY * tail;

    context.beginPath();
    context.moveTo(tipX, tipY);
    context.lineTo(tailX + sideX * halfWidth, tailY + sideY * halfWidth);
    context.lineTo(tailX - sideX * halfWidth, tailY - sideY * halfWidth);
    context.closePath();
    context.fillStyle = triangle.color;
    context.fill();
  }

  function drawApples() {
    if (apples.length === 0) {
      return;
    }
    for (const apple of apples) {
      const gravityRadius = APPLE_MAX_RADIUS * APPLE_GRAVITY_RADIUS_SCALE;
      context.beginPath();
      context.arc(apple.x, apple.y, gravityRadius, 0, TWO_PI);
      context.strokeStyle = "rgb(255 219 40 / 28%)";
      context.lineWidth = 1;
      context.stroke();

      context.beginPath();
      context.arc(apple.x, apple.y, apple.radius, 0, TWO_PI);
      context.fillStyle = "rgb(255 42 46)";
      context.fill();
      context.lineWidth = 2;
      context.strokeStyle = "rgb(255 238 122)";
      context.stroke();

      context.beginPath();
      context.arc(apple.x - apple.radius * 0.28, apple.y - apple.radius * 0.32, Math.max(4, apple.radius * 0.13), 0, TWO_PI);
      context.fillStyle = "white";
      context.fill();
    }
  }

  function drawRepellents() {
    if (repellents.length === 0) {
      return;
    }
    context.lineWidth = 2;
    context.strokeStyle = "rgb(125 249 255)";
    for (const repellent of repellents) {
      context.beginPath();
      context.arc(repellent.x, repellent.y, REPELLENT_RADIUS, 0, TWO_PI);
      context.stroke();
      drawRepellentBurst(repellent.x, repellent.y);
    }
  }

  function drawRepellentBurst(x: number, y: number) {
    context.lineWidth = 3;
    context.strokeStyle = "rgb(184 245 255)";
    for (let rayIndex = 0; rayIndex < REPELLENT_RAYS; rayIndex++) {
      const angle = rayIndex / REPELLENT_RAYS * TWO_PI;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + Math.cos(angle) * REPELLENT_MARKER_RADIUS, y + Math.sin(angle) * REPELLENT_MARKER_RADIUS);
      context.stroke();
    }
  }

  function drawPreview() {
    if (!cursorVisible) {
      return;
    }
    if (placingRepellent) {
      context.lineWidth = 2;
      context.strokeStyle = "rgb(125 249 255)";
      context.beginPath();
      context.arc(cursorX, cursorY, REPELLENT_RADIUS, 0, TWO_PI);
      context.stroke();
      drawRepellentBurst(cursorX, cursorY);
      return;
    }

    context.lineWidth = 2;
    context.strokeStyle = "rgb(255 230 40)";
    context.beginPath();
    context.arc(cursorX, cursorY, APPLE_MAX_RADIUS * APPLE_GRAVITY_RADIUS_SCALE, 0, TWO_PI);
    context.stroke();
    context.strokeStyle = "rgb(255 64 78)";
    context.beginPath();
    context.arc(cursorX, cursorY, APPLE_MAX_RADIUS, 0, TWO_PI);
    context.stroke();
  }

  function bounceTriangle(triangle: Triangle) {
    if (triangle.x < 0) {
      triangle.x = 0;
      triangle.angle = Math.PI - triangle.angle;
    } else if (triangle.x > canvasWidth) {
      triangle.x = canvasWidth;
      triangle.angle = Math.PI - triangle.angle;
    }
    if (triangle.y < 0) {
      triangle.y = 0;
      triangle.angle = -triangle.angle;
    } else if (triangle.y > canvasHeight) {
      triangle.y = canvasHeight;
      triangle.angle = -triangle.angle;
    }
  }

  function setTriangleCount(value: string) {
    const parsed = Number.parseInt(value, 10);
    const requestedCount = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TRIANGLE_COUNT;
    const nextTriangleCount = clampInteger(requestedCount, MIN_TRIANGLE_COUNT, MAX_TRIANGLE_COUNT);
    if (requestedCount > MAX_TRIANGLE_COUNT) {
      showNotice(`Canvas limit: ${MAX_TRIANGLE_COUNT.toLocaleString()} triangles`);
    }
    triangleCount = nextTriangleCount;
    triangleCountInput.value = String(triangleCount);
    while (triangles.length < triangleCount) {
      triangles.push(createTriangle());
    }
    if (triangles.length > triangleCount) {
      triangles.length = triangleCount;
    }
    writeConfigToUrl();
  }

  function setCraziness(value: string, updateUrl = true) {
    const parsed = Number.parseFloat(value);
    craziness = clampNumber(Number.isFinite(parsed) ? parsed : DEFAULT_CRAZINESS, MIN_CRAZINESS, MAX_CRAZINESS);
    crazinessInput.value = String(craziness);
    if (updateUrl) {
      writeConfigToUrl();
    }
  }

  function setSpeed(value: string, updateUrl = true) {
    const parsed = Number.parseFloat(value);
    speed = clampNumber(Number.isFinite(parsed) ? parsed : DEFAULT_SPEED, MIN_SPEED, MAX_SPEED);
    speedInput.value = String(speed);
    if (updateUrl) {
      writeConfigToUrl();
    }
  }

  function createTriangle(): Triangle {
    const hue = Math.floor(Math.random() * 360);
    const saturation = Math.floor(78 + Math.random() * 22);
    const lightness = Math.floor(52 + Math.random() * 16);
    return {
      x: Math.random() * canvasWidth,
      y: Math.random() * canvasHeight,
      angle: Math.random() * TWO_PI,
      baseSpeed: 0.035 + Math.random() * 0.125,
      color: `hsl(${hue}, ${saturation}%, ${lightness}%)`,
      size: 2.4 + Math.random() * 4.4,
      wobble: 0.002 + Math.random() * 0.011
    };
  }

  function plantApple(event: PointerEvent) {
    if (isControlElement(event.target)) {
      return;
    }
    event.preventDefault();
    if (event.shiftKey) {
      plantRepellent(event);
      return;
    }

    const now = performance.now();
    if (now - lastApplePlantMs < 300) {
      return;
    }
    lastApplePlantMs = now;
    if (apples.length >= MAX_APPLES) {
      showNotice(`Max apples reached (${MAX_APPLES})`);
      return;
    }

    const { x, y } = clampAppleCenter(canvasPointFromEvent(event));
    if (overlapsExistingApple(x, y, APPLE_MAX_RADIUS)) {
      showNotice("Too close to another apple");
      return;
    }
    apples.push({ x, y, volume: 1, radius: APPLE_MAX_RADIUS });
    updateAppleStatsText();
    dismissHint();
  }

  function plantRepellent(event: PointerEvent) {
    const now = performance.now();
    if (now - lastRepellentPlantMs < 300) {
      return;
    }
    lastRepellentPlantMs = now;
    const point = canvasPointFromEvent(event);
    const existingIndex = repellents.findIndex(repellent => {
      const dx = repellent.x - point.x;
      const dy = repellent.y - point.y;
      return dx * dx + dy * dy < REPELLENT_MARKER_RADIUS * REPELLENT_MARKER_RADIUS;
    });
    if (existingIndex >= 0) {
      repellents.splice(existingIndex, 1);
      showNotice("Repellent removed");
      return;
    }
    if (repellents.length >= MAX_REPELLENTS) {
      showNotice(`Max repellents reached (${MAX_REPELLENTS})`);
      return;
    }
    repellents.push(clampRepellentCenter(point));
    dismissHint();
  }

  function updatePreview(event: PointerEvent) {
    if (isControlElement(event.target)) {
      return;
    }
    const point = canvasPointFromEvent(event);
    cursorX = point.x;
    cursorY = point.y;
    placingRepellent = event.shiftKey;
    cursorVisible = true;
    if (placingRepellent) {
      dismissHint();
    }
    updateStatsText();
  }

  function hidePreview() {
    placingRepellent = false;
    cursorVisible = false;
    updateStatsText();
  }

  function resetSimulation(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    apples = [];
    repellents = [];
    updateAppleStatsText();
  }

  function syncControls() {
    pauseButton.textContent = paused ? "Resume" : "Pause";
    pauseButton.setAttribute("aria-pressed", String(paused));
    triangleCountInput.value = String(triangleCount);
    triangleCountInput.min = String(MIN_TRIANGLE_COUNT);
    triangleCountInput.max = String(MAX_TRIANGLE_COUNT);
    crazinessInput.value = String(craziness);
    crazinessInput.min = String(MIN_CRAZINESS);
    crazinessInput.max = String(MAX_CRAZINESS);
    speedInput.value = String(speed);
    speedInput.min = String(MIN_SPEED);
    speedInput.max = String(MAX_SPEED);
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

  function writeConfigToUrl() {
    const query = new URLSearchParams();
    query.set("NumberOfSprites", String(triangleCount));
    query.set("Craziness", formatNumber(craziness));
    query.set("Speed", formatNumber(speed));
    const nextUrl = `${location.pathname}?${query}`;
    if (nextUrl !== `${location.pathname}${location.search}`) {
      history.replaceState(null, "", nextUrl);
    }
  }

  function updateAppleStatsText() {
    appleStats = apples.length === 0 ? "none" : apples.map(apple => `${Math.max(0, Math.round(apple.volume * 100))}%`).join(" ");
    updateStatsText();
  }

  function updateStatsText() {
    const nextStatsText = `FPS: ${fps ?? "--"}\nApples: ${appleStats}\nMode: ${placingRepellent ? "Placing repellents" : "Placing apples"}`;
    if (nextStatsText !== statsText) {
      stats.textContent = nextStatsText;
      statsText = nextStatsText;
    }
    statsDirty = false;
  }

  function dismissHint() {
    hint?.remove();
    hint = null;
  }

  function canvasPointFromEvent(event: PointerEvent): Point {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * canvasWidth / rect.width,
      y: (event.clientY - rect.top) * canvasHeight / rect.height
    };
  }

  function clampAppleCenter(point: Point): Point {
    const minCenter = APPLE_MAX_RADIUS;
    return {
      x: clampNumber(point.x, minCenter, Math.max(canvasWidth - minCenter, minCenter)),
      y: clampNumber(point.y, minCenter, Math.max(canvasHeight - minCenter, minCenter))
    };
  }

  function clampRepellentCenter(point: Point): Point {
    const minCenter = REPELLENT_MARKER_RADIUS;
    return {
      x: clampNumber(point.x, minCenter, Math.max(canvasWidth - minCenter, minCenter)),
      y: clampNumber(point.y, minCenter, Math.max(canvasHeight - minCenter, minCenter))
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

  function showNotice(message: string) {
    clearTimeout(noticeTimeoutId);
    notice.textContent = message;
    notice.classList.add("is-visible");
    noticeTimeoutId = window.setTimeout(() => {
      notice.classList.remove("is-visible");
    }, 1400);
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
      placingRepellent = true;
      dismissHint();
      updateStatsText();
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
  }

  addEventListener("resize", resize);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", resize);
  }
  addEventListener("keydown", handleKeyDown);
  addEventListener("keyup", handleKeyUp);
  canvas.addEventListener("pointermove", updatePreview);
  canvas.addEventListener("pointerleave", hidePreview);
  canvas.addEventListener("pointercancel", hidePreview);
  canvas.addEventListener("pointerdown", plantApple);
  pauseButton.addEventListener("click", () => setPaused(!paused));
  resetApplesButton.addEventListener("click", resetSimulation);
  triangleCountInput.addEventListener("input", () => setTriangleCount(triangleCountInput.value));
  triangleCountInput.addEventListener("change", () => setTriangleCount(triangleCountInput.value));
  crazinessInput.addEventListener("input", () => setCraziness(crazinessInput.value, false));
  crazinessInput.addEventListener("change", () => setCraziness(crazinessInput.value));
  speedInput.addEventListener("input", () => setSpeed(speedInput.value, false));
  speedInput.addEventListener("change", () => setSpeed(speedInput.value));

  resize();
  syncControls();
  if (Number.isFinite(initialTriangleCount) && initialTriangleCount > MAX_TRIANGLE_COUNT) {
    showNotice(`Canvas limit: ${MAX_TRIANGLE_COUNT.toLocaleString()} triangles`);
  }
  setTriangleCount(String(triangleCount));
  updateStatsText();
  startAnimation();
}

function isControlElement(target: EventTarget | null) {
  return target instanceof HTMLButtonElement || target instanceof HTMLInputElement;
}

function clampNumber(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function clampInteger(value: number, minimum: number, maximum: number) {
  return Math.trunc(clampNumber(value, minimum, maximum));
}

function turnTowardAngle(currentAngle: number, targetAngle: number, amount: number) {
  let difference = targetAngle - currentAngle;
  while (difference > Math.PI) {
    difference -= TWO_PI;
  }
  while (difference < -Math.PI) {
    difference += TWO_PI;
  }
  return currentAngle + difference * amount;
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

if (document.querySelector("#swarm")) {
  startTriangleSwarmApp();
}

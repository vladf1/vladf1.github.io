const DEFAULT_SPRITE_COUNT = 2500;
const DEFAULT_FADE_AMOUNT = 0.1;
const FADE_AMOUNT_PER_MS_SCALE = 0.06;
const TWO_PI = Math.PI * 2;

const canvas = document.querySelector("#swarm");
const context = canvas.getContext("2d", { alpha: false });
const stats = document.querySelector("#stats");
const pauseButton = document.querySelector("#pauseButton");
const spriteCountInput = document.querySelector("#spriteCount");
const fadeAmountInput = document.querySelector("#fadeAmount");
let hint = document.querySelector("#hint");

const params = new URLSearchParams(location.search);
let spriteCount = readSpriteCount(params.get("NumberOfSprites"));
let fadeAmount = readFadeAmount(params.get("FadeAmount"));
let fadeAmountPerMs = fadeAmount * FADE_AMOUNT_PER_MS_SCALE;

let canvasWidth = 0;
let canvasHeight = 0;
let bitmap = null;
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

class Sprite {
  static minColor = 40;
  static maxVelocityPerMs = 0.36;
  static maxOffsetAmount = 10;
  static tooFar = 650;
  static tooFarSquared = Sprite.tooFar * Sprite.tooFar;
  static minDistance = 200;
  static minDistanceSquared = Sprite.minDistance * Sprite.minDistance;
  static pointerTurnMs = 83.33333333333333;
  static changeDirectionMs = 166.66666666666666;
  static maxRandomAngleChange = 1.5;
  static maxCrazinessPerMs = 0.006;

  constructor(startX, startY) {
    this.xPosition = startX;
    this.yPosition = startY;
    this.previousX = startX;
    this.previousY = startY;
    this.speed = Sprite.maxVelocityPerMs * randomBetween(0.4, 1);
    this.crazinessPerMs = randomBetween(0, Sprite.maxCrazinessPerMs);
    this.offsetX = randomBetween(-Sprite.maxOffsetAmount, Sprite.maxOffsetAmount);
    this.offsetY = randomBetween(-Sprite.maxOffsetAmount, Sprite.maxOffsetAmount);
    this.gravityDistance = Sprite.minDistance * randomBetween(0.7, 1.4);
    this.gravityDistanceSquared = this.gravityDistance * this.gravityDistance;
    this.angle = randomBetween(0, TWO_PI);
    this.xVelocity = 0;
    this.yVelocity = 0;
    this.angleStepPerMs = 0;
    this.angleChangeMsLeft = 0;

    const red = Math.floor(randomBetween(Sprite.minColor, 255));
    const green = Math.floor(randomBetween(Sprite.minColor, 255));
    const blue = Math.floor(randomBetween(Sprite.minColor, 255));
    this.red = red;
    this.green = green;
    this.blue = blue;
    this.updateVector();
  }

  updateVector() {
    this.xVelocity = this.speed * Math.cos(this.angle);
    this.yVelocity = this.speed * Math.sin(this.angle);
  }

  updateMotion(elapsedMs) {
    if (pointerX > 0 && pointerY > 0) {
      const pointerDeltaX = this.xPosition - pointerX;
      const pointerDeltaY = this.yPosition - pointerY;
      const distanceSquared = pointerDeltaX * pointerDeltaX + pointerDeltaY * pointerDeltaY;

      if (repelMode && distanceSquared < Sprite.minDistanceSquared) {
        this.angleChangeMsLeft = 0;
        this.angle = normalizeAngle(Math.atan2(pointerDeltaY, pointerDeltaX));
        this.updateVector();
      } else if (distanceSquared > this.gravityDistanceSquared && distanceSquared < Sprite.tooFarSquared) {
        this.angleChangeMsLeft = Sprite.pointerTurnMs;
        const newAngle = normalizeAngle(
          Math.atan2(pointerY - this.yPosition + this.offsetY, pointerX - this.xPosition + this.offsetX),
        );
        this.angleStepPerMs = angleDifference(newAngle, this.angle) / this.angleChangeMsLeft;
      }
    }

    if (this.angleChangeMsLeft <= 0 && Math.random() < this.crazinessPerMs * elapsedMs) {
      const angleChange = randomBetween(-Sprite.maxRandomAngleChange, Sprite.maxRandomAngleChange);
      this.angleStepPerMs = angleChange / Sprite.changeDirectionMs;
      this.angleChangeMsLeft = Sprite.changeDirectionMs;
    }

    if (this.angleChangeMsLeft > 0) {
      this.angle = normalizeAngle(this.angle + this.angleStepPerMs * elapsedMs);
      this.updateVector();
      this.angleChangeMsLeft -= elapsedMs;
    }

    let nextX = this.xPosition + this.xVelocity * elapsedMs;
    let nextY = this.yPosition + this.yVelocity * elapsedMs;
    let bounced = false;

    if (nextY < 0) {
      this.yPosition = 0;
      this.yVelocity *= -1;
      bounced = true;
    } else if (nextY > canvasHeight) {
      this.yPosition = canvasHeight;
      this.yVelocity *= -1;
      bounced = true;
    }

    if (nextX < 0) {
      this.xPosition = 0;
      this.xVelocity *= -1;
      bounced = true;
    } else if (nextX > canvasWidth) {
      this.xPosition = canvasWidth;
      this.xVelocity *= -1;
      bounced = true;
    }

    if (bounced) {
      nextX = this.xPosition + this.xVelocity * elapsedMs;
      nextY = this.yPosition + this.yVelocity * elapsedMs;
      this.angle = normalizeAngle(Math.atan2(this.yVelocity, this.xVelocity));
      this.angleChangeMsLeft = 0;
    }

    this.xPosition = nextX;
    this.yPosition = nextY;
  }

  drawPixels(pixels) {
    const red = repelMode ? 255 : this.red;
    const green = repelMode ? 255 : this.green;
    const blue = repelMode ? 255 : this.blue;
    drawLine(
      pixels,
      canvasWidth,
      canvasHeight,
      this.xPosition | 0,
      this.yPosition | 0,
      this.previousX | 0,
      this.previousY | 0,
      red,
      green,
      blue,
    );
    this.previousX = this.xPosition;
    this.previousY = this.yPosition;
  }
}

function resize() {
  canvasWidth = Math.max(1, Math.floor(innerWidth));
  canvasHeight = Math.max(1, Math.floor(innerHeight));
  resetDrawingSurface();

  if (sprites.length === 0) {
    recreateSprites();
  }
}

function renderFrame(now) {
  pendingAnimationFrameId = 0;
  if (paused) {
    return;
  }

  const elapsedMs = lastAnimated === 0 ? 0 : now - lastAnimated;
  lastAnimated = now;

  if (now - lastTimed >= 1000) {
    fps = framesRendered;
    framesRendered = 0;
    lastTimed = now;
  }

  fadePixels(bitmap.data, 1 - fadeAmountPerMs * elapsedMs);
  for (const sprite of sprites) {
    sprite.updateMotion(elapsedMs);
    sprite.drawPixels(bitmap.data);
  }
  context.putImageData(bitmap, 0, 0);

  stats.textContent = `FPS: ${fps ?? "--"}`;
  framesRendered++;
  pendingAnimationFrameId = requestAnimationFrame(renderFrame);
}

function syncControls() {
  pauseButton.textContent = paused ? "Resume" : "Pause";
  pauseButton.setAttribute("aria-pressed", String(paused));
  spriteCountInput.value = String(spriteCount);
  fadeAmountInput.value = String(fadeAmount);
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
  writeConfigToUrl();
}

function setFadeAmount(value) {
  fadeAmount = readFadeAmount(value);
  fadeAmountPerMs = fadeAmount * FADE_AMOUNT_PER_MS_SCALE;
  fadeAmountInput.value = String(fadeAmount);
  writeConfigToUrl();
}

function recreateSprites() {
  sprites = [];
  for (let i = 0; i < spriteCount; i++) {
    sprites.push(createSprite());
  }
}

function resizeSpritePool() {
  if (sprites.length > spriteCount) {
    sprites.length = spriteCount;
    return;
  }

  while (sprites.length < spriteCount) {
    sprites.push(createSprite());
  }
}

function createSprite() {
  return new Sprite(Math.floor(randomBetween(0, canvasWidth)), Math.floor(randomBetween(0, canvasHeight)));
}

function resetDrawingSurface() {
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  context.fillStyle = "black";
  context.fillRect(0, 0, canvasWidth, canvasHeight);
  bitmap = context.createImageData(canvasWidth, canvasHeight);
  lastAnimated = 0;
  lastTimed = performance.now();
  framesRendered = 0;
  fps = null;
}

function writeConfigToUrl() {
  const query = new URLSearchParams();
  query.set("NumberOfSprites", String(spriteCount));
  query.set("FadeAmount", String(fadeAmount));
  history.replaceState(null, "", `${location.pathname}?${query}`);
}

function updatePointer(event) {
  const rect = canvas.getBoundingClientRect();
  pointerX = event.clientX - rect.left;
  pointerY = event.clientY - rect.top;
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
}

function handleKeyDown(event) {
  if (event.code !== "Space" || event.repeat || isControlElement(event.target)) {
    return;
  }

  event.preventDefault();
  setPaused(!paused);
}

function isControlElement(target) {
  return target instanceof HTMLButtonElement || target instanceof HTMLInputElement;
}

function fadePixels(pixels, amount) {
  const clampedAmount = Math.max(0, Math.min(1, amount));
  for (let index = 0; index < pixels.length; index += 4) {
    pixels[index] = clampedAmount * pixels[index];
    pixels[index + 1] = clampedAmount * pixels[index + 1];
    pixels[index + 2] = clampedAmount * pixels[index + 2];
  }
}

function drawLine(pixels, surfaceWidth, surfaceHeight, startX, startY, endX, endY, red, green, blue) {
  let deltaX = endX - startX;
  let deltaY = endY - startY;
  let stepX = 0;
  let stepY = 0;

  if (deltaX < 0) {
    deltaX = -deltaX;
    stepX = -1;
  } else if (deltaX > 0) {
    stepX = 1;
  }

  if (deltaY < 0) {
    deltaY = -deltaY;
    stepY = -1;
  } else if (deltaY > 0) {
    stepY = 1;
  }

  const xIsLongAxis = deltaX > deltaY;
  const primaryStepX = xIsLongAxis ? stepX : 0;
  const primaryStepY = xIsLongAxis ? 0 : stepY;
  const diagonalStepX = stepX;
  const diagonalStepY = stepY;
  const shortAxisDistance = xIsLongAxis ? deltaY : deltaX;
  const longAxisDistance = xIsLongAxis ? deltaX : deltaY;
  let currentX = startX;
  let currentY = startY;
  let error = longAxisDistance >> 1;

  if (currentY < surfaceHeight && currentY >= 0 && currentX < surfaceWidth && currentX >= 0) {
    const pixelIndex = (currentY * surfaceWidth + currentX) * 4;
    pixels[pixelIndex] = red;
    pixels[pixelIndex + 1] = green;
    pixels[pixelIndex + 2] = blue;
    pixels[pixelIndex + 3] = 255;
  }

  for (let lineStep = 0; lineStep < longAxisDistance; lineStep++) {
    error -= shortAxisDistance;
    if (error < 0) {
      error += longAxisDistance;
      currentX += diagonalStepX;
      currentY += diagonalStepY;
    } else {
      currentX += primaryStepX;
      currentY += primaryStepY;
    }
    if (currentY < surfaceHeight && currentY >= 0 && currentX < surfaceWidth && currentX >= 0) {
      const pixelIndex = (currentY * surfaceWidth + currentX) * 4;
      pixels[pixelIndex] = red;
      pixels[pixelIndex + 1] = green;
      pixels[pixelIndex + 2] = blue;
      pixels[pixelIndex + 3] = 255;
    }
  }
}

function readSpriteCount(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SPRITE_COUNT;
}

function readFadeAmount(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.max(0.02, Math.min(0.25, parsed)) : DEFAULT_FADE_AMOUNT;
}

function randomBetween(min, max) {
  return min + (max - min) * Math.random();
}

function normalizeAngle(angle) {
  if (angle < 0) {
    return angle + TWO_PI;
  }
  if (angle >= TWO_PI) {
    return angle - TWO_PI;
  }
  return angle;
}

function angleDifference(targetAngle, currentAngle) {
  const difference = targetAngle - currentAngle;
  if (difference > Math.PI) {
    return difference - TWO_PI;
  }
  if (difference < -Math.PI) {
    return difference + TWO_PI;
  }
  return difference;
}

addEventListener("resize", resize);
addEventListener("keydown", handleKeyDown);
canvas.addEventListener("pointermove", updatePointer);
canvas.addEventListener("pointerleave", clearPointer);
canvas.addEventListener("pointerdown", event => {
  updatePointer(event);
  repelMode = true;
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener("pointerup", event => {
  repelMode = false;
  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
});
canvas.addEventListener("pointercancel", clearPointer);
pauseButton.addEventListener("click", () => setPaused(!paused));
spriteCountInput.addEventListener("input", () => setSpriteCount(spriteCountInput.value));
spriteCountInput.addEventListener("change", () => setSpriteCount(spriteCountInput.value));
fadeAmountInput.addEventListener("input", () => setFadeAmount(fadeAmountInput.value));

syncControls();
writeConfigToUrl();
resize();
startAnimation();

const DEFAULT_SPRITE_COUNT = 2500;
const DEFAULT_FADE_AMOUNT = 0.1;
const FADE_AMOUNT_PER_MS_SCALE = 0.06;
const FADE_FRAME_INTERVAL = 3;
const DEFAULT_REPEL_DISTANCE = 200;
const MIN_REPEL_DISTANCE = 90;
const REPEL_DISTANCE_VIEWPORT_SCALE = 0.28;
const TWO_PI = Math.PI * 2;
const FLOATS_PER_VERTEX = 5;
const VERTICES_PER_LINE = 2;
const LINE_FLOATS_PER_SPRITE = FLOATS_PER_VERTEX * VERTICES_PER_LINE;

const canvas = document.querySelector("#swarm");
const gl = canvas.getContext("webgl", {
  alpha: false,
  antialias: false,
  depth: false,
  stencil: false,
  preserveDrawingBuffer: true
});
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
let lineVertices = null;
let sprites = [];
let pointerX = -1;
let pointerY = -1;
let repelMode = false;
let lastAnimated = 0;
let lastTimed = performance.now();
let framesRendered = 0;
let fadeFramesElapsed = 0;
let fadeElapsedMs = 0;
let fps = null;
let paused = false;
let pendingAnimationFrameId = 0;

const lineProgram = createProgram(
  `
    attribute vec2 a_position;
    attribute vec3 a_color;
    uniform vec2 u_resolution;
    varying vec3 v_color;

    void main() {
      vec2 zeroToOne = a_position / u_resolution;
      vec2 clipSpace = zeroToOne * 2.0 - 1.0;

      gl_Position = vec4(clipSpace.x, -clipSpace.y, 0.0, 1.0);
      v_color = a_color;
    }
  `,
  `
    precision mediump float;
    varying vec3 v_color;

    void main() {
      gl_FragColor = vec4(v_color, 1.0);
    }
  `
);
const fadeProgram = createProgram(
  `
    attribute vec2 a_position;

    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `,
  `
    precision mediump float;
    uniform float u_alpha;

    void main() {
      gl_FragColor = vec4(0.0, 0.0, 0.0, u_alpha);
    }
  `
);
const linePositionLocation = gl.getAttribLocation(lineProgram, "a_position");
const lineColorLocation = gl.getAttribLocation(lineProgram, "a_color");
const lineResolutionLocation = gl.getUniformLocation(lineProgram, "u_resolution");
const fadePositionLocation = gl.getAttribLocation(fadeProgram, "a_position");
const fadeAlphaLocation = gl.getUniformLocation(fadeProgram, "u_alpha");
const lineBuffer = gl.createBuffer();
const fadeBuffer = gl.createBuffer();

gl.bindBuffer(gl.ARRAY_BUFFER, fadeBuffer);
gl.bufferData(
  gl.ARRAY_BUFFER,
  new Float32Array([
    -1, -1,
    1, -1,
    -1, 1,
    -1, 1,
    1, -1,
    1, 1
  ]),
  gl.STATIC_DRAW
);
gl.disable(gl.DEPTH_TEST);
gl.disable(gl.CULL_FACE);
gl.enable(gl.BLEND);

class Sprite {
  static minColor = 40;
  static maxVelocityPerMs = 0.36;
  static maxOffsetAmount = 10;
  static tooFar = 650;
  static tooFarSquared = Sprite.tooFar * Sprite.tooFar;
  static minDistance = DEFAULT_REPEL_DISTANCE;
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
    this.red = red / 255;
    this.green = green / 255;
    this.blue = blue / 255;
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
        this.angle = Math.atan2(pointerDeltaY, pointerDeltaX);
        this.updateVector();
      } else if (distanceSquared > this.gravityDistanceSquared && distanceSquared < Sprite.tooFarSquared) {
        this.angleChangeMsLeft = Sprite.pointerTurnMs;
        const targetX = pointerX - this.xPosition + this.offsetX;
        const targetY = pointerY - this.yPosition + this.offsetY;
        const newAngle = Math.atan2(targetY, targetX);
        this.angleStepPerMs = angleDifference(newAngle, this.angle) / this.angleChangeMsLeft;
      }
    }

    if (this.angleChangeMsLeft <= 0 && Math.random() < this.crazinessPerMs * elapsedMs) {
      const angleChange = randomBetween(-Sprite.maxRandomAngleChange, Sprite.maxRandomAngleChange);
      this.angleStepPerMs = angleChange / Sprite.changeDirectionMs;
      this.angleChangeMsLeft = Sprite.changeDirectionMs;
    }

    if (this.angleChangeMsLeft > 0) {
      this.angle += this.angleStepPerMs * elapsedMs;
      // Keep the angle bounded because this incremental path can drift outside one turn.
      if (this.angle < 0) {
        this.angle += TWO_PI;
      } else if (this.angle >= TWO_PI) {
        this.angle -= TWO_PI;
      }
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
      this.angle = Math.atan2(this.yVelocity, this.xVelocity);
      this.angleChangeMsLeft = 0;
    }

    this.xPosition = nextX;
    this.yPosition = nextY;
  }

  writeLineVertices(vertices, index) {
    const red = repelMode ? 1 : this.red;
    const green = repelMode ? 1 : this.green;
    const blue = repelMode ? 1 : this.blue;
    let endX = this.xPosition;
    let endY = this.yPosition;
    let startX = this.previousX;
    let startY = this.previousY;

    if (endX < 0) {
      endX = 0;
    } else if (endX >= canvasWidth) {
      endX = canvasWidth - 1;
    }
    if (endY < 0) {
      endY = 0;
    } else if (endY >= canvasHeight) {
      endY = canvasHeight - 1;
    }
    if (startX < 0) {
      startX = 0;
    } else if (startX >= canvasWidth) {
      startX = canvasWidth - 1;
    }
    if (startY < 0) {
      startY = 0;
    } else if (startY >= canvasHeight) {
      startY = canvasHeight - 1;
    }

    vertices[index++] = startX;
    vertices[index++] = startY;
    vertices[index++] = red;
    vertices[index++] = green;
    vertices[index++] = blue;
    vertices[index++] = endX;
    vertices[index++] = endY;
    vertices[index++] = red;
    vertices[index++] = green;
    vertices[index++] = blue;
    this.previousX = this.xPosition;
    this.previousY = this.yPosition;

    return index;
  }
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  canvasWidth = Math.max(1, Math.floor(rect.width));
  canvasHeight = Math.max(1, Math.floor(rect.height));
  updateSpriteInteractionDistances();
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

  fadeFramesElapsed++;
  fadeElapsedMs += elapsedMs;
  if (fadeFramesElapsed === FADE_FRAME_INTERVAL) {
    fadePixels(1 - fadeAmountPerMs * fadeElapsedMs);
    fadeFramesElapsed = 0;
    fadeElapsedMs = 0;
  }

  let lineVertexIndex = 0;
  for (const sprite of sprites) {
    sprite.updateMotion(elapsedMs);
    lineVertexIndex = sprite.writeLineVertices(lineVertices, lineVertexIndex);
  }
  drawSpriteLines(lineVertexIndex);

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
    ensureLineVertexCapacity();
    return;
  }

  while (sprites.length < spriteCount) {
    sprites.push(createSprite());
  }
  ensureLineVertexCapacity();
}

function createSprite() {
  return new Sprite(Math.floor(randomBetween(0, canvasWidth)), Math.floor(randomBetween(0, canvasHeight)));
}

function updateSpriteInteractionDistances() {
  const viewportDistance = Math.min(canvasWidth, canvasHeight) * REPEL_DISTANCE_VIEWPORT_SCALE;
  Sprite.minDistance = Math.min(DEFAULT_REPEL_DISTANCE, Math.max(MIN_REPEL_DISTANCE, viewportDistance));
  Sprite.minDistanceSquared = Sprite.minDistance * Sprite.minDistance;
}

function resetDrawingSurface() {
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  gl.viewport(0, 0, canvasWidth, canvasHeight);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  ensureLineVertexCapacity();
  lastAnimated = 0;
  lastTimed = performance.now();
  framesRendered = 0;
  fadeFramesElapsed = 0;
  fadeElapsedMs = 0;
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
  pointerX = (event.clientX - rect.left) * canvasWidth / rect.width;
  pointerY = (event.clientY - rect.top) * canvasHeight / rect.height;
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

function ensureLineVertexCapacity() {
  if (lineVertices !== null && lineVertices.length >= spriteCount * LINE_FLOATS_PER_SPRITE) {
    return;
  }

  lineVertices = new Float32Array(spriteCount * LINE_FLOATS_PER_SPRITE);
}

function fadePixels(amount) {
  const fadeAlpha = Math.max(0, Math.min(1, 1 - amount));
  if (fadeAlpha <= 0) {
    return;
  }

  gl.useProgram(fadeProgram);
  gl.bindBuffer(gl.ARRAY_BUFFER, fadeBuffer);
  gl.enableVertexAttribArray(fadePositionLocation);
  gl.vertexAttribPointer(fadePositionLocation, 2, gl.FLOAT, false, 0, 0);
  gl.uniform1f(fadeAlphaLocation, fadeAlpha);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

function drawSpriteLines(vertexFloatCount) {
  if (vertexFloatCount === 0) {
    return;
  }

  gl.useProgram(lineProgram);
  gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, lineVertices.subarray(0, vertexFloatCount), gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(linePositionLocation);
  gl.vertexAttribPointer(linePositionLocation, 2, gl.FLOAT, false, FLOATS_PER_VERTEX * 4, 0);
  gl.enableVertexAttribArray(lineColorLocation);
  gl.vertexAttribPointer(lineColorLocation, 3, gl.FLOAT, false, FLOATS_PER_VERTEX * 4, 2 * 4);
  gl.uniform2f(lineResolutionLocation, canvasWidth, canvasHeight);
  gl.blendFunc(gl.ONE, gl.ZERO);
  gl.drawArrays(gl.LINES, 0, vertexFloatCount / FLOATS_PER_VERTEX);
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

function createProgram(vertexSource, fragmentSource) {
  const program = gl.createProgram();
  gl.attachShader(program, createShader(gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, createShader(gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  return program;
}

function createShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}

addEventListener("resize", resize);
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", resize);
}
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

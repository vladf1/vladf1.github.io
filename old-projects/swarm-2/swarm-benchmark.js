const DEFAULT_SPRITE_COUNT = 2500;
const DEFAULT_FRAME_COUNT = 180;
const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 600;
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

class BenchmarkSprite {
  static minColor = 40;
  static maxVelocityPerMs = 0.36;
  static maxOffsetAmount = 10;
  static tooFar = 650;
  static tooFarSquared = BenchmarkSprite.tooFar * BenchmarkSprite.tooFar;
  static minDistance = DEFAULT_REPEL_DISTANCE;
  static minDistanceSquared = BenchmarkSprite.minDistance * BenchmarkSprite.minDistance;
  static pointerTurnMs = 83.33333333333333;
  static changeDirectionMs = 166.66666666666666;
  static maxRandomAngleChange = 1.5;
  static maxCrazinessPerMs = 0.006;

  constructor(random, startX, startY) {
    this.xPosition = startX;
    this.yPosition = startY;
    this.previousX = startX;
    this.previousY = startY;
    this.speed = BenchmarkSprite.maxVelocityPerMs * randomBetween(random, 0.4, 1);
    this.crazinessPerMs = randomBetween(random, 0, BenchmarkSprite.maxCrazinessPerMs);
    this.offsetX = randomBetween(random, -BenchmarkSprite.maxOffsetAmount, BenchmarkSprite.maxOffsetAmount);
    this.offsetY = randomBetween(random, -BenchmarkSprite.maxOffsetAmount, BenchmarkSprite.maxOffsetAmount);
    this.gravityDistance = BenchmarkSprite.minDistance * randomBetween(random, 0.7, 1.4);
    this.gravityDistanceSquared = this.gravityDistance * this.gravityDistance;
    this.angle = randomBetween(random, 0, TWO_PI);
    this.xVelocity = 0;
    this.yVelocity = 0;
    this.angleStepPerMs = 0;
    this.angleChangeMsLeft = 0;
    this.random = random;

    const red = Math.floor(randomBetween(random, BenchmarkSprite.minColor, 255));
    const green = Math.floor(randomBetween(random, BenchmarkSprite.minColor, 255));
    const blue = Math.floor(randomBetween(random, BenchmarkSprite.minColor, 255));
    this.colorWord = packColor(red, green, blue);
    this.red = red / 255;
    this.green = green / 255;
    this.blue = blue / 255;
    this.updateVector();
  }

  updateVector() {
    this.xVelocity = this.speed * Math.cos(this.angle);
    this.yVelocity = this.speed * Math.sin(this.angle);
  }

  updateMotion(elapsedMs, width, height, pointerX, pointerY) {
    if (pointerX > 0 && pointerY > 0) {
      const pointerDeltaX = this.xPosition - pointerX;
      const pointerDeltaY = this.yPosition - pointerY;
      const distanceSquared = pointerDeltaX * pointerDeltaX + pointerDeltaY * pointerDeltaY;

      if (distanceSquared > this.gravityDistanceSquared && distanceSquared < BenchmarkSprite.tooFarSquared) {
        this.angleChangeMsLeft = BenchmarkSprite.pointerTurnMs;
        const targetX = pointerX - this.xPosition + this.offsetX;
        const targetY = pointerY - this.yPosition + this.offsetY;
        const newAngle = Math.atan2(targetY, targetX);
        this.angleStepPerMs = angleDifference(newAngle, this.angle) / this.angleChangeMsLeft;
      }
    }

    if (this.angleChangeMsLeft <= 0 && this.random() < this.crazinessPerMs * elapsedMs) {
      const angleChange = randomBetween(this.random, -BenchmarkSprite.maxRandomAngleChange, BenchmarkSprite.maxRandomAngleChange);
      this.angleStepPerMs = angleChange / BenchmarkSprite.changeDirectionMs;
      this.angleChangeMsLeft = BenchmarkSprite.changeDirectionMs;
    }

    if (this.angleChangeMsLeft > 0) {
      this.angle += this.angleStepPerMs * elapsedMs;
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
    } else if (nextY > height) {
      this.yPosition = height;
      this.yVelocity *= -1;
      bounced = true;
    }

    if (nextX < 0) {
      this.xPosition = 0;
      this.xVelocity *= -1;
      bounced = true;
    } else if (nextX > width) {
      this.xPosition = width;
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

  drawCpu(pixelWords, width, height) {
    let endX = this.xPosition | 0;
    let endY = this.yPosition | 0;
    let startX = this.previousX | 0;
    let startY = this.previousY | 0;

    if (endX < 0) {
      endX = 0;
    } else if (endX >= width) {
      endX = width - 1;
    }
    if (endY < 0) {
      endY = 0;
    } else if (endY >= height) {
      endY = height - 1;
    }
    if (startX < 0) {
      startX = 0;
    } else if (startX >= width) {
      startX = width - 1;
    }
    if (startY < 0) {
      startY = 0;
    } else if (startY >= height) {
      startY = height - 1;
    }

    drawLine(pixelWords, width, startX, startY, endX, endY, this.colorWord);
    this.previousX = this.xPosition;
    this.previousY = this.yPosition;
  }

  writeLineVertices(vertices, index, width, height) {
    let endX = this.xPosition;
    let endY = this.yPosition;
    let startX = this.previousX;
    let startY = this.previousY;

    if (endX < 0) {
      endX = 0;
    } else if (endX >= width) {
      endX = width - 1;
    }
    if (endY < 0) {
      endY = 0;
    } else if (endY >= height) {
      endY = height - 1;
    }
    if (startX < 0) {
      startX = 0;
    } else if (startX >= width) {
      startX = width - 1;
    }
    if (startY < 0) {
      startY = 0;
    } else if (startY >= height) {
      startY = height - 1;
    }

    vertices[index++] = startX;
    vertices[index++] = startY;
    vertices[index++] = this.red;
    vertices[index++] = this.green;
    vertices[index++] = this.blue;
    vertices[index++] = endX;
    vertices[index++] = endY;
    vertices[index++] = this.red;
    vertices[index++] = this.green;
    vertices[index++] = this.blue;
    this.previousX = this.xPosition;
    this.previousY = this.yPosition;

    return index;
  }
}

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

  const cpuResult = runCpuBenchmark(config);
  addResultRow(cpuResult, cpuResult);
  await waitForPaint();

  const webglResult = runWebglBenchmark(config);
  addResultRow(webglResult, cpuResult);
  status.textContent = `Done. WebGL was ${(cpuResult.msPerFrame / webglResult.msPerFrame).toFixed(2)}x faster than the old CPU renderer.`;
  runButton.disabled = false;
}

function runMotionBenchmark(config) {
  const sprites = createSprites(config);
  const pointerX = config.width * 0.5;
  const pointerY = config.height * 0.5;
  const started = performance.now();

  for (let frame = 0; frame < config.frameCount; frame++) {
    updateSprites(sprites, config, pointerX, pointerY);
  }

  return createResult("Motion only", performance.now() - started, config);
}

function runCpuBenchmark(config) {
  cpuCanvas.width = config.width;
  cpuCanvas.height = config.height;
  const context = cpuCanvas.getContext("2d", { alpha: false });
  const bitmap = context.createImageData(config.width, config.height);
  const bitmapWords = new Uint32Array(bitmap.data.buffer);
  const sprites = createSprites(config);
  const pointerX = config.width * 0.5;
  const pointerY = config.height * 0.5;
  let fadeFramesElapsed = 0;
  let fadeElapsedMs = 0;
  bitmapWords.fill(0xff000000);
  const started = performance.now();

  for (let frame = 0; frame < config.frameCount; frame++) {
    fadeFramesElapsed++;
    fadeElapsedMs += FIXED_ELAPSED_MS;
    if (fadeFramesElapsed === FADE_FRAME_INTERVAL) {
      fadePixels(bitmapWords, 1 - config.fadeAmountPerMs * fadeElapsedMs);
      fadeFramesElapsed = 0;
      fadeElapsedMs = 0;
    }

    updateSprites(sprites, config, pointerX, pointerY);
    for (const sprite of sprites) {
      sprite.drawCpu(bitmapWords, config.width, config.height);
    }
    context.putImageData(bitmap, 0, 0);
  }

  return createResult("Old CPU ImageData", performance.now() - started, config);
}

function runWebglBenchmark(config) {
  webglCanvas.width = config.width;
  webglCanvas.height = config.height;
  const renderer = createWebglRenderer(webglCanvas, config);
  const sprites = createSprites(config);
  const vertices = new Float32Array(config.spriteCount * LINE_FLOATS_PER_SPRITE);
  const pointerX = config.width * 0.5;
  const pointerY = config.height * 0.5;
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

    updateSprites(sprites, config, pointerX, pointerY);
    let vertexIndex = 0;
    for (const sprite of sprites) {
      vertexIndex = sprite.writeLineVertices(vertices, vertexIndex, config.width, config.height);
    }
    renderer.drawLines(vertices, vertexIndex);
  }

  renderer.finish();
  return createResult("New WebGL lines", performance.now() - started, config);
}

function updateSprites(sprites, config, pointerX, pointerY) {
  for (const sprite of sprites) {
    sprite.updateMotion(FIXED_ELAPSED_MS, config.width, config.height, pointerX, pointerY);
  }
}

function createSprites(config) {
  const viewportDistance = Math.min(config.width, config.height) * REPEL_DISTANCE_VIEWPORT_SCALE;
  BenchmarkSprite.minDistance = Math.min(DEFAULT_REPEL_DISTANCE, Math.max(MIN_REPEL_DISTANCE, viewportDistance));
  BenchmarkSprite.minDistanceSquared = BenchmarkSprite.minDistance * BenchmarkSprite.minDistance;

  const random = createRandom(SEED);
  const sprites = [];
  for (let i = 0; i < config.spriteCount; i++) {
    sprites.push(new BenchmarkSprite(
      random,
      Math.floor(randomBetween(random, 0, config.width)),
      Math.floor(randomBetween(random, 0, config.height))
    ));
  }
  return sprites;
}

function createWebglRenderer(canvas, config) {
  const gl = canvas.getContext("webgl", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: true
  });
  const lineProgram = createProgram(gl, `
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
  `, `
    precision mediump float;
    varying vec3 v_color;

    void main() {
      gl_FragColor = vec4(v_color, 1.0);
    }
  `);
  const fadeProgram = createProgram(gl, `
    attribute vec2 a_position;

    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `, `
    precision mediump float;
    uniform float u_alpha;

    void main() {
      gl_FragColor = vec4(0.0, 0.0, 0.0, u_alpha);
    }
  `);
  const linePositionLocation = gl.getAttribLocation(lineProgram, "a_position");
  const lineColorLocation = gl.getAttribLocation(lineProgram, "a_color");
  const lineResolutionLocation = gl.getUniformLocation(lineProgram, "u_resolution");
  const fadePositionLocation = gl.getAttribLocation(fadeProgram, "a_position");
  const fadeAlphaLocation = gl.getUniformLocation(fadeProgram, "u_alpha");
  const lineBuffer = gl.createBuffer();
  const fadeBuffer = gl.createBuffer();

  gl.bindBuffer(gl.ARRAY_BUFFER, fadeBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,
    1, -1,
    -1, 1,
    -1, 1,
    1, -1,
    1, 1
  ]), gl.STATIC_DRAW);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.enable(gl.BLEND);
  gl.viewport(0, 0, config.width, config.height);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  return {
    fade(amount) {
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
    },
    drawLines(vertices, vertexFloatCount) {
      gl.useProgram(lineProgram);
      gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, vertices.subarray(0, vertexFloatCount), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(linePositionLocation);
      gl.vertexAttribPointer(linePositionLocation, 2, gl.FLOAT, false, FLOATS_PER_VERTEX * 4, 0);
      gl.enableVertexAttribArray(lineColorLocation);
      gl.vertexAttribPointer(lineColorLocation, 3, gl.FLOAT, false, FLOATS_PER_VERTEX * 4, 2 * 4);
      gl.uniform2f(lineResolutionLocation, config.width, config.height);
      gl.blendFunc(gl.ONE, gl.ZERO);
      gl.drawArrays(gl.LINES, 0, vertexFloatCount / FLOATS_PER_VERTEX);
    },
    finish() {
      gl.finish();
    }
  };
}

function createResult(name, totalMs, config) {
  const msPerFrame = totalMs / config.frameCount;
  return {
    name,
    totalMs,
    msPerFrame,
    fps: 1000 / msPerFrame
  };
}

function addResultRow(result, cpuResult) {
  const row = document.createElement("tr");
  const speedup = cpuResult === null ? "--" : `${(cpuResult.msPerFrame / result.msPerFrame).toFixed(2)}x`;
  row.innerHTML = `
    <td>${result.name}</td>
    <td>${formatNumber(result.totalMs)}</td>
    <td>${formatNumber(result.msPerFrame)}</td>
    <td>${formatNumber(result.fps)}</td>
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

function fadePixels(pixelWords, amount) {
  const clampedAmount = Math.max(0, Math.min(1, amount));
  if (clampedAmount >= 1) {
    return;
  }

  const fadeScale = (clampedAmount * 256) | 0;

  for (let index = 0; index < pixelWords.length; index++) {
    const pixel = pixelWords[index];
    pixelWords[index] =
      (pixel & 0xff000000) |
      ((((pixel & 0x00ff00ff) * fadeScale) >>> 8) & 0x00ff00ff) |
      ((((pixel & 0x0000ff00) * fadeScale) >>> 8) & 0x0000ff00);
  }
}

function drawLine(pixelWords, rowStride, startX, startY, endX, endY, colorWord) {
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
  const yPixelStep = stepY * rowStride;
  const primaryPixelStep = xIsLongAxis ? stepX : yPixelStep;
  const diagonalPixelStep = stepX + yPixelStep;
  const shortAxisDistance = xIsLongAxis ? deltaY : deltaX;
  const longAxisDistance = xIsLongAxis ? deltaX : deltaY;
  let error = longAxisDistance >> 1;
  let pixelIndex = startY * rowStride + startX;
  pixelWords[pixelIndex] = colorWord;

  for (let lineStep = 0; lineStep < longAxisDistance; lineStep++) {
    error -= shortAxisDistance;
    if (error < 0) {
      error += longAxisDistance;
      pixelIndex += diagonalPixelStep;
    } else {
      pixelIndex += primaryPixelStep;
    }
    pixelWords[pixelIndex] = colorWord;
  }
}

function createProgram(gl, vertexSource, fragmentSource) {
  const program = gl.createProgram();
  gl.attachShader(program, createShader(gl, gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, createShader(gl, gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  return program;
}

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}

function readPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function randomBetween(random, min, max) {
  return min + (max - min) * random();
}

function createRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function packColor(red, green, blue) {
  return 0xff000000 | (blue << 16) | (green << 8) | red;
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

function formatNumber(value) {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 2
  });
}

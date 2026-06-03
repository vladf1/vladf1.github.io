export const DEFAULT_SPRITE_COUNT = 2500;
export const DEFAULT_FADE_AMOUNT = 0.1;
export const FADE_AMOUNT_PER_MS_SCALE = 0.06;
export const FADE_FRAME_INTERVAL = 3;
export const DEFAULT_REPEL_DISTANCE = 200;
export const MIN_REPEL_DISTANCE = 90;
export const REPEL_DISTANCE_VIEWPORT_SCALE = 0.28;
export const TWO_PI = Math.PI * 2;
export const FLOATS_PER_VERTEX = 5;
export const VERTICES_PER_LINE = 2;
export const LINE_FLOATS_PER_SPRITE = FLOATS_PER_VERTEX * VERTICES_PER_LINE;

export class Sprite {
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

  constructor(random, startX, startY) {
    this.random = random;
    this.xPosition = startX;
    this.yPosition = startY;
    this.previousX = startX;
    this.previousY = startY;
    this.speed = Sprite.maxVelocityPerMs * randomBetween(random, 0.4, 1);
    this.crazinessPerMs = randomBetween(random, 0, Sprite.maxCrazinessPerMs);
    this.offsetX = randomBetween(random, -Sprite.maxOffsetAmount, Sprite.maxOffsetAmount);
    this.offsetY = randomBetween(random, -Sprite.maxOffsetAmount, Sprite.maxOffsetAmount);
    this.gravityDistance = Sprite.minDistance * randomBetween(random, 0.7, 1.4);
    this.gravityDistanceSquared = this.gravityDistance * this.gravityDistance;
    this.angle = randomBetween(random, 0, TWO_PI);
    this.xVelocity = 0;
    this.yVelocity = 0;
    this.angleStepPerMs = 0;
    this.angleChangeMsLeft = 0;

    const red = Math.floor(randomBetween(random, Sprite.minColor, 255));
    const green = Math.floor(randomBetween(random, Sprite.minColor, 255));
    const blue = Math.floor(randomBetween(random, Sprite.minColor, 255));
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

  updateMotion(elapsedMs, motionState) {
    if (motionState.pointerX > 0 && motionState.pointerY > 0) {
      const pointerDeltaX = this.xPosition - motionState.pointerX;
      const pointerDeltaY = this.yPosition - motionState.pointerY;
      const distanceSquared = pointerDeltaX * pointerDeltaX + pointerDeltaY * pointerDeltaY;

      if (motionState.repelMode && distanceSquared < Sprite.minDistanceSquared) {
        this.angleChangeMsLeft = 0;
        this.angle = Math.atan2(pointerDeltaY, pointerDeltaX);
        this.updateVector();
      } else if (distanceSquared > this.gravityDistanceSquared && distanceSquared < Sprite.tooFarSquared) {
        this.angleChangeMsLeft = Sprite.pointerTurnMs;
        const targetX = motionState.pointerX - this.xPosition + this.offsetX;
        const targetY = motionState.pointerY - this.yPosition + this.offsetY;
        const newAngle = Math.atan2(targetY, targetX);
        this.angleStepPerMs = angleDifference(newAngle, this.angle) / this.angleChangeMsLeft;
      }
    }

    if (this.angleChangeMsLeft <= 0 && this.random() < this.crazinessPerMs * elapsedMs) {
      const angleChange = randomBetween(this.random, -Sprite.maxRandomAngleChange, Sprite.maxRandomAngleChange);
      this.angleStepPerMs = angleChange / Sprite.changeDirectionMs;
      this.angleChangeMsLeft = Sprite.changeDirectionMs;
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
    } else if (nextY > motionState.height) {
      this.yPosition = motionState.height;
      this.yVelocity *= -1;
      bounced = true;
    }

    if (nextX < 0) {
      this.xPosition = 0;
      this.xVelocity *= -1;
      bounced = true;
    } else if (nextX > motionState.width) {
      this.xPosition = motionState.width;
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

  drawCpu(pixelWords, width, height, repelMode) {
    const colorWord = repelMode ? 0xffffffff : this.colorWord;
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

    drawLine(pixelWords, width, startX, startY, endX, endY, colorWord);
    this.previousX = this.xPosition;
    this.previousY = this.yPosition;
  }

  writeLineVertices(vertices, index, width, height, repelMode) {
    const red = repelMode ? 1 : this.red;
    const green = repelMode ? 1 : this.green;
    const blue = repelMode ? 1 : this.blue;
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

export function setSpriteInteractionDistances(width, height) {
  const viewportDistance = Math.min(width, height) * REPEL_DISTANCE_VIEWPORT_SCALE;
  Sprite.minDistance = Math.min(DEFAULT_REPEL_DISTANCE, Math.max(MIN_REPEL_DISTANCE, viewportDistance));
  Sprite.minDistanceSquared = Sprite.minDistance * Sprite.minDistance;
}

export function createSprite(random, width, height) {
  return new Sprite(random, Math.floor(randomBetween(random, 0, width)), Math.floor(randomBetween(random, 0, height)));
}

export function createSprites(count, width, height, random) {
  setSpriteInteractionDistances(width, height);
  const sprites = [];
  for (let i = 0; i < count; i++) {
    sprites.push(createSprite(random, width, height));
  }
  return sprites;
}

export function updateSprites(sprites, elapsedMs, motionState) {
  for (const sprite of sprites) {
    sprite.updateMotion(elapsedMs, motionState);
  }
}

export function createLineVertexBuffer(spriteCount) {
  return new Float32Array(spriteCount * LINE_FLOATS_PER_SPRITE);
}

export function createCpuRenderer(canvas, width, height) {
  const renderer = {
    canvas,
    context: canvas.getContext("2d", { alpha: false }),
    width: 0,
    height: 0,
    bitmap: null,
    bitmapWords: null,
    resize(nextWidth, nextHeight) {
      this.width = nextWidth;
      this.height = nextHeight;
      this.canvas.width = nextWidth;
      this.canvas.height = nextHeight;
      this.bitmap = this.context.createImageData(nextWidth, nextHeight);
      this.bitmapWords = new Uint32Array(this.bitmap.data.buffer);
      this.clear();
    },
    clear() {
      this.bitmapWords.fill(0xff000000);
      this.context.putImageData(this.bitmap, 0, 0);
    },
    fade(amount) {
      fadePixels(this.bitmapWords, amount);
    },
    drawSprites(sprites, vertices, repelMode) {
      for (const sprite of sprites) {
        sprite.drawCpu(this.bitmapWords, this.width, this.height, repelMode);
      }
      this.context.putImageData(this.bitmap, 0, 0);
    }
  };
  renderer.resize(width, height);
  return renderer;
}

export function createWebglRenderer(canvas, width, height) {
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
  const renderer = {
    canvas,
    gl,
    width: 0,
    height: 0,
    lineProgram,
    fadeProgram,
    linePositionLocation: gl.getAttribLocation(lineProgram, "a_position"),
    lineColorLocation: gl.getAttribLocation(lineProgram, "a_color"),
    lineResolutionLocation: gl.getUniformLocation(lineProgram, "u_resolution"),
    fadePositionLocation: gl.getAttribLocation(fadeProgram, "a_position"),
    fadeAlphaLocation: gl.getUniformLocation(fadeProgram, "u_alpha"),
    lineBuffer: gl.createBuffer(),
    fadeBuffer: gl.createBuffer(),
    resize(nextWidth, nextHeight) {
      this.width = nextWidth;
      this.height = nextHeight;
      this.canvas.width = nextWidth;
      this.canvas.height = nextHeight;
      this.gl.viewport(0, 0, nextWidth, nextHeight);
      this.clear();
    },
    clear() {
      this.gl.clearColor(0, 0, 0, 1);
      this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    },
    fade(amount) {
      const fadeAlpha = Math.max(0, Math.min(1, 1 - amount));
      if (fadeAlpha <= 0) {
        return;
      }

      this.gl.useProgram(this.fadeProgram);
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.fadeBuffer);
      this.gl.enableVertexAttribArray(this.fadePositionLocation);
      this.gl.vertexAttribPointer(this.fadePositionLocation, 2, this.gl.FLOAT, false, 0, 0);
      this.gl.uniform1f(this.fadeAlphaLocation, fadeAlpha);
      this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
      this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
    },
    drawSprites(sprites, vertices, repelMode) {
      let vertexFloatCount = 0;
      for (const sprite of sprites) {
        vertexFloatCount = sprite.writeLineVertices(vertices, vertexFloatCount, this.width, this.height, repelMode);
      }
      this.drawLines(vertices, vertexFloatCount);
    },
    drawLines(vertices, vertexFloatCount) {
      if (vertexFloatCount === 0) {
        return;
      }

      this.gl.useProgram(this.lineProgram);
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.lineBuffer);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices.subarray(0, vertexFloatCount), this.gl.DYNAMIC_DRAW);
      this.gl.enableVertexAttribArray(this.linePositionLocation);
      this.gl.vertexAttribPointer(this.linePositionLocation, 2, this.gl.FLOAT, false, FLOATS_PER_VERTEX * 4, 0);
      this.gl.enableVertexAttribArray(this.lineColorLocation);
      this.gl.vertexAttribPointer(this.lineColorLocation, 3, this.gl.FLOAT, false, FLOATS_PER_VERTEX * 4, 2 * 4);
      this.gl.uniform2f(this.lineResolutionLocation, this.width, this.height);
      this.gl.blendFunc(this.gl.ONE, this.gl.ZERO);
      this.gl.drawArrays(this.gl.LINES, 0, vertexFloatCount / FLOATS_PER_VERTEX);
    },
    finish() {
      this.gl.finish();
    }
  };

  gl.bindBuffer(gl.ARRAY_BUFFER, renderer.fadeBuffer);
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
  renderer.resize(width, height);
  return renderer;
}

export async function createWebgpuRenderer(canvas, width, height) {
  if (!("gpu" in navigator)) {
    return null;
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (adapter === null) {
    return null;
  }

  const device = await adapter.requestDevice();
  const context = canvas.getContext("webgpu");
  const format = navigator.gpu.getPreferredCanvasFormat();
  const lineShader = device.createShaderModule({
    code: `
      struct Resolution {
        size: vec2f,
      };

      @group(0) @binding(0) var<uniform> resolution: Resolution;

      struct VertexInput {
        @location(0) position: vec2f,
        @location(1) color: vec3f,
      };

      struct VertexOutput {
        @builtin(position) position: vec4f,
        @location(0) color: vec3f,
      };

      @vertex
      fn vertexMain(input: VertexInput) -> VertexOutput {
        var output: VertexOutput;
        let zeroToOne = input.position / resolution.size;
        let clipSpace = zeroToOne * 2.0 - vec2f(1.0, 1.0);
        output.position = vec4f(clipSpace.x, -clipSpace.y, 0.0, 1.0);
        output.color = input.color;
        return output;
      }

      @fragment
      fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
        return vec4f(input.color, 1.0);
      }
    `
  });
  const fadeShader = device.createShaderModule({
    code: `
      struct Fade {
        alpha: f32,
      };

      @group(0) @binding(0) var<uniform> fade: Fade;

      struct VertexOutput {
        @builtin(position) position: vec4f,
      };

      @vertex
      fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
        var positions = array<vec2f, 6>(
          vec2f(-1.0, -1.0),
          vec2f(1.0, -1.0),
          vec2f(-1.0, 1.0),
          vec2f(-1.0, 1.0),
          vec2f(1.0, -1.0),
          vec2f(1.0, 1.0)
        );
        var output: VertexOutput;
        output.position = vec4f(positions[vertexIndex], 0.0, 1.0);
        return output;
      }

      @fragment
      fn fragmentMain() -> @location(0) vec4f {
        return vec4f(0.0, 0.0, 0.0, fade.alpha);
      }
    `
  });
  const linePipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: lineShader,
      entryPoint: "vertexMain",
      buffers: [{
        arrayStride: FLOATS_PER_VERTEX * 4,
        attributes: [
          {
            shaderLocation: 0,
            offset: 0,
            format: "float32x2"
          },
          {
            shaderLocation: 1,
            offset: 2 * 4,
            format: "float32x3"
          }
        ]
      }]
    },
    fragment: {
      module: lineShader,
      entryPoint: "fragmentMain",
      targets: [{ format }]
    },
    primitive: {
      topology: "line-list"
    }
  });
  const fadePipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: fadeShader,
      entryPoint: "vertexMain"
    },
    fragment: {
      module: fadeShader,
      entryPoint: "fragmentMain",
      targets: [{
        format,
        blend: {
          color: {
            srcFactor: "src-alpha",
            dstFactor: "one-minus-src-alpha",
            operation: "add"
          },
          alpha: {
            srcFactor: "one",
            dstFactor: "zero",
            operation: "add"
          }
        }
      }]
    },
    primitive: {
      topology: "triangle-list"
    }
  });
  const resolutionBuffer = device.createBuffer({
    size: 8,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });
  const fadeBuffer = device.createBuffer({
    size: 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });
  const lineBindGroup = device.createBindGroup({
    layout: linePipeline.getBindGroupLayout(0),
    entries: [{
      binding: 0,
      resource: { buffer: resolutionBuffer }
    }]
  });
  const fadeBindGroup = device.createBindGroup({
    layout: fadePipeline.getBindGroupLayout(0),
    entries: [{
      binding: 0,
      resource: { buffer: fadeBuffer }
    }]
  });
  const renderer = {
    canvas,
    context,
    device,
    format,
    width: 0,
    height: 0,
    linePipeline,
    fadePipeline,
    lineBindGroup,
    fadeBindGroup,
    resolutionBuffer,
    fadeBuffer,
    vertexBuffer: null,
    vertexBufferSize: 0,
    commandEncoder: null,
    resize(nextWidth, nextHeight) {
      this.width = nextWidth;
      this.height = nextHeight;
      this.canvas.width = nextWidth;
      this.canvas.height = nextHeight;
      this.context.configure({
        device: this.device,
        format: this.format,
        alphaMode: "opaque"
      });
      this.device.queue.writeBuffer(this.resolutionBuffer, 0, new Float32Array([nextWidth, nextHeight]));
      this.clear();
    },
    clear() {
      const encoder = this.device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: this.context.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: "clear",
          storeOp: "store"
        }]
      });
      pass.end();
      this.device.queue.submit([encoder.finish()]);
    },
    fade(amount) {
      const fadeAlpha = Math.max(0, Math.min(1, 1 - amount));
      if (fadeAlpha <= 0) {
        return;
      }

      this.device.queue.writeBuffer(this.fadeBuffer, 0, new Float32Array([fadeAlpha]));
      const pass = this.getCommandEncoder().beginRenderPass({
        colorAttachments: [{
          view: this.context.getCurrentTexture().createView(),
          loadOp: "load",
          storeOp: "store"
        }]
      });
      pass.setPipeline(this.fadePipeline);
      pass.setBindGroup(0, this.fadeBindGroup);
      pass.draw(6);
      pass.end();
    },
    drawSprites(sprites, vertices, repelMode) {
      let vertexFloatCount = 0;
      for (const sprite of sprites) {
        vertexFloatCount = sprite.writeLineVertices(vertices, vertexFloatCount, this.width, this.height, repelMode);
      }
      this.drawLines(vertices, vertexFloatCount);
    },
    drawLines(vertices, vertexFloatCount) {
      if (vertexFloatCount === 0) {
        return;
      }

      const byteLength = vertexFloatCount * 4;
      this.ensureVertexBuffer(byteLength);
      this.device.queue.writeBuffer(this.vertexBuffer, 0, vertices.buffer, vertices.byteOffset, byteLength);
      const pass = this.getCommandEncoder().beginRenderPass({
        colorAttachments: [{
          view: this.context.getCurrentTexture().createView(),
          loadOp: "load",
          storeOp: "store"
        }]
      });
      pass.setPipeline(this.linePipeline);
      pass.setBindGroup(0, this.lineBindGroup);
      pass.setVertexBuffer(0, this.vertexBuffer);
      pass.draw(vertexFloatCount / FLOATS_PER_VERTEX);
      pass.end();
      this.submitCommandEncoder();
    },
    ensureVertexBuffer(byteLength) {
      if (this.vertexBuffer !== null && this.vertexBufferSize >= byteLength) {
        return;
      }

      if (this.vertexBuffer !== null) {
        this.vertexBuffer.destroy();
      }
      this.vertexBufferSize = byteLength;
      this.vertexBuffer = this.device.createBuffer({
        size: byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
      });
    },
    getCommandEncoder() {
      if (this.commandEncoder === null) {
        this.commandEncoder = this.device.createCommandEncoder();
      }
      return this.commandEncoder;
    },
    submitCommandEncoder() {
      if (this.commandEncoder === null) {
        return;
      }
      this.device.queue.submit([this.commandEncoder.finish()]);
      this.commandEncoder = null;
    },
    finish() {
      this.submitCommandEncoder();
      return this.device.queue.onSubmittedWorkDone();
    }
  };

  renderer.resize(width, height);
  return renderer;
}

export async function createWebgpuComputeRenderer(canvas, width, height, sprites, motionState) {
  if (!("gpu" in navigator)) {
    return null;
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (adapter === null) {
    return null;
  }

  const device = await adapter.requestDevice();
  const context = canvas.getContext("webgpu");
  const format = navigator.gpu.getPreferredCanvasFormat();
  const spriteCount = sprites.length;
  const computeVertexStride = 32;
  const lineVertexCount = spriteCount * VERTICES_PER_LINE;
  const positionData = new Float32Array(spriteCount * 4);
  const motionAData = new Float32Array(spriteCount * 4);
  const motionBData = new Float32Array(spriteCount * 4);
  const motionCData = new Float32Array(spriteCount * 4);
  const colorData = new Float32Array(spriteCount * 4);
  const randomData = new Uint32Array(spriteCount);

  for (let index = 0; index < spriteCount; index++) {
    const sprite = sprites[index];
    positionData.set([
      sprite.xPosition,
      sprite.yPosition,
      sprite.previousX,
      sprite.previousY
    ], index * 4);
    motionAData.set([
      sprite.xVelocity,
      sprite.yVelocity,
      sprite.speed,
      sprite.crazinessPerMs
    ], index * 4);
    motionBData.set([
      sprite.offsetX,
      sprite.offsetY,
      sprite.gravityDistanceSquared,
      sprite.angle
    ], index * 4);
    motionCData.set([
      sprite.angleStepPerMs,
      sprite.angleChangeMsLeft,
      0,
      0
    ], index * 4);
    colorData.set([
      sprite.red,
      sprite.green,
      sprite.blue,
      1
    ], index * 4);
    randomData[index] = (0x9e3779b9 ^ (index * 747796405) ^ spriteCount) >>> 0;
  }

  const computeShader = device.createShaderModule({
    code: `
      const TWO_PI = 6.283185307179586;
      const WORKGROUP_SIZE = 256u;

      struct SimParams {
        canvasPointer: vec4f,
        elapsedDistances: vec4f,
        turn: vec4f,
      };

      struct LineVertex {
        position: vec2f,
        color: vec4f,
      };

      @group(0) @binding(0) var<storage, read_write> positions: array<vec4f>;
      @group(0) @binding(1) var<storage, read_write> motionA: array<vec4f>;
      @group(0) @binding(2) var<storage, read_write> motionB: array<vec4f>;
      @group(0) @binding(3) var<storage, read_write> motionC: array<vec4f>;
      @group(0) @binding(4) var<storage, read> colors: array<vec4f>;
      @group(0) @binding(5) var<storage, read_write> randomStates: array<u32>;
      @group(0) @binding(6) var<storage, read_write> vertices: array<LineVertex>;
      @group(0) @binding(7) var<uniform> params: SimParams;

      fn randomUnit(index: u32) -> f32 {
        let next = randomStates[index] * 1664525u + 1013904223u;
        randomStates[index] = next;
        return f32(next) / 4294967296.0;
      }

      fn randomBetween(index: u32, minimum: f32, maximum: f32) -> f32 {
        return minimum + (maximum - minimum) * randomUnit(index);
      }

      fn angleDifference(targetAngle: f32, currentAngle: f32) -> f32 {
        let difference = targetAngle - currentAngle;
        if (difference > 3.141592653589793) {
          return difference - TWO_PI;
        }
        if (difference < -3.141592653589793) {
          return difference + TWO_PI;
        }
        return difference;
      }

      @compute @workgroup_size(WORKGROUP_SIZE)
      fn computeMain(@builtin(global_invocation_id) id: vec3u) {
        let index = id.x;
        let spriteCount = u32(params.turn.w);
        if (index >= spriteCount) {
          return;
        }

        let width = params.canvasPointer.x;
        let height = params.canvasPointer.y;
        let pointerX = params.canvasPointer.z;
        let pointerY = params.canvasPointer.w;
        let elapsedMs = params.elapsedDistances.x;
        let minDistanceSquared = params.elapsedDistances.y;
        let tooFarSquared = params.elapsedDistances.z;
        let repelMode = params.elapsedDistances.w > 0.5;
        let pointerTurnMs = params.turn.x;
        let changeDirectionMs = params.turn.y;
        let maxRandomAngleChange = params.turn.z;

        var position = positions[index];
        var velocity = motionA[index].xy;
        let speed = motionA[index].z;
        let crazinessPerMs = motionA[index].w;
        let offset = motionB[index].xy;
        let gravityDistanceSquared = motionB[index].z;
        var angle = motionB[index].w;
        var angleStepPerMs = motionC[index].x;
        var angleChangeMsLeft = motionC[index].y;
        let startPosition = position.xy;

        if (pointerX > 0.0 && pointerY > 0.0) {
          let pointerDelta = position.xy - vec2f(pointerX, pointerY);
          let distanceSquared = dot(pointerDelta, pointerDelta);

          if (repelMode && distanceSquared < minDistanceSquared) {
            angleChangeMsLeft = 0.0;
            angle = atan2(pointerDelta.y, pointerDelta.x);
            velocity = vec2f(speed * cos(angle), speed * sin(angle));
          } else if (distanceSquared > gravityDistanceSquared && distanceSquared < tooFarSquared) {
            angleChangeMsLeft = pointerTurnMs;
            let targetVector = vec2f(pointerX, pointerY) - position.xy + offset;
            let newAngle = atan2(targetVector.y, targetVector.x);
            angleStepPerMs = angleDifference(newAngle, angle) / angleChangeMsLeft;
          }
        }

        if (angleChangeMsLeft <= 0.0 && randomUnit(index) < crazinessPerMs * elapsedMs) {
          let angleChange = randomBetween(index, -maxRandomAngleChange, maxRandomAngleChange);
          angleStepPerMs = angleChange / changeDirectionMs;
          angleChangeMsLeft = changeDirectionMs;
        }

        if (angleChangeMsLeft > 0.0) {
          angle += angleStepPerMs * elapsedMs;
          if (angle < 0.0) {
            angle += TWO_PI;
          } else if (angle >= TWO_PI) {
            angle -= TWO_PI;
          }
          velocity = vec2f(speed * cos(angle), speed * sin(angle));
          angleChangeMsLeft -= elapsedMs;
        }

        var nextPosition = position.xy + velocity * elapsedMs;
        var bounced = false;

        if (nextPosition.y < 0.0) {
          position.y = 0.0;
          velocity.y *= -1.0;
          bounced = true;
        } else if (nextPosition.y > height) {
          position.y = height;
          velocity.y *= -1.0;
          bounced = true;
        }

        if (nextPosition.x < 0.0) {
          position.x = 0.0;
          velocity.x *= -1.0;
          bounced = true;
        } else if (nextPosition.x > width) {
          position.x = width;
          velocity.x *= -1.0;
          bounced = true;
        }

        if (bounced) {
          nextPosition = position.xy + velocity * elapsedMs;
          angle = atan2(velocity.y, velocity.x);
          angleChangeMsLeft = 0.0;
        }

        let clampedStart = clamp(startPosition, vec2f(0.0, 0.0), vec2f(width - 1.0, height - 1.0));
        let clampedEnd = clamp(nextPosition, vec2f(0.0, 0.0), vec2f(width - 1.0, height - 1.0));
        let color = colors[index];
        vertices[index * 2u] = LineVertex(clampedStart, color);
        vertices[index * 2u + 1u] = LineVertex(clampedEnd, color);

        positions[index] = vec4f(nextPosition, nextPosition);
        motionA[index] = vec4f(velocity, speed, crazinessPerMs);
        motionB[index] = vec4f(offset, gravityDistanceSquared, angle);
        motionC[index] = vec4f(angleStepPerMs, angleChangeMsLeft, 0.0, 0.0);
      }
    `
  });
  const lineShader = device.createShaderModule({
    code: `
      struct Resolution {
        size: vec2f,
      };

      @group(0) @binding(0) var<uniform> resolution: Resolution;

      struct VertexInput {
        @location(0) position: vec2f,
        @location(1) color: vec4f,
      };

      struct VertexOutput {
        @builtin(position) position: vec4f,
        @location(0) color: vec4f,
      };

      @vertex
      fn vertexMain(input: VertexInput) -> VertexOutput {
        var output: VertexOutput;
        let zeroToOne = input.position / resolution.size;
        let clipSpace = zeroToOne * 2.0 - vec2f(1.0, 1.0);
        output.position = vec4f(clipSpace.x, -clipSpace.y, 0.0, 1.0);
        output.color = input.color;
        return output;
      }

      @fragment
      fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
        return input.color;
      }
    `
  });
  const fadeShader = device.createShaderModule({
    code: `
      struct Fade {
        alpha: f32,
      };

      @group(0) @binding(0) var<uniform> fade: Fade;

      struct VertexOutput {
        @builtin(position) position: vec4f,
      };

      @vertex
      fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
        var positions = array<vec2f, 6>(
          vec2f(-1.0, -1.0),
          vec2f(1.0, -1.0),
          vec2f(-1.0, 1.0),
          vec2f(-1.0, 1.0),
          vec2f(1.0, -1.0),
          vec2f(1.0, 1.0)
        );
        var output: VertexOutput;
        output.position = vec4f(positions[vertexIndex], 0.0, 1.0);
        return output;
      }

      @fragment
      fn fragmentMain() -> @location(0) vec4f {
        return vec4f(0.0, 0.0, 0.0, fade.alpha);
      }
    `
  });
  const computePipeline = device.createComputePipeline({
    layout: "auto",
    compute: {
      module: computeShader,
      entryPoint: "computeMain"
    }
  });
  const linePipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: lineShader,
      entryPoint: "vertexMain",
      buffers: [{
        arrayStride: computeVertexStride,
        attributes: [
          {
            shaderLocation: 0,
            offset: 0,
            format: "float32x2"
          },
          {
            shaderLocation: 1,
            offset: 16,
            format: "float32x4"
          }
        ]
      }]
    },
    fragment: {
      module: lineShader,
      entryPoint: "fragmentMain",
      targets: [{ format }]
    },
    primitive: {
      topology: "line-list"
    }
  });
  const fadePipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: fadeShader,
      entryPoint: "vertexMain"
    },
    fragment: {
      module: fadeShader,
      entryPoint: "fragmentMain",
      targets: [{
        format,
        blend: {
          color: {
            srcFactor: "src-alpha",
            dstFactor: "one-minus-src-alpha",
            operation: "add"
          },
          alpha: {
            srcFactor: "one",
            dstFactor: "zero",
            operation: "add"
          }
        }
      }]
    },
    primitive: {
      topology: "triangle-list"
    }
  });
  const positionBuffer = createStorageBuffer(device, positionData);
  const motionABuffer = createStorageBuffer(device, motionAData);
  const motionBBuffer = createStorageBuffer(device, motionBData);
  const motionCBuffer = createStorageBuffer(device, motionCData);
  const colorBuffer = createStorageBuffer(device, colorData);
  const randomBuffer = createStorageBuffer(device, randomData);
  const vertexBuffer = device.createBuffer({
    size: lineVertexCount * computeVertexStride,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX
  });
  const paramsBuffer = device.createBuffer({
    size: 48,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });
  const resolutionBuffer = device.createBuffer({
    size: 8,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });
  const fadeBuffer = device.createBuffer({
    size: 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });
  const computeBindGroup = device.createBindGroup({
    layout: computePipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: positionBuffer } },
      { binding: 1, resource: { buffer: motionABuffer } },
      { binding: 2, resource: { buffer: motionBBuffer } },
      { binding: 3, resource: { buffer: motionCBuffer } },
      { binding: 4, resource: { buffer: colorBuffer } },
      { binding: 5, resource: { buffer: randomBuffer } },
      { binding: 6, resource: { buffer: vertexBuffer } },
      { binding: 7, resource: { buffer: paramsBuffer } }
    ]
  });
  const lineBindGroup = device.createBindGroup({
    layout: linePipeline.getBindGroupLayout(0),
    entries: [{
      binding: 0,
      resource: { buffer: resolutionBuffer }
    }]
  });
  const fadeBindGroup = device.createBindGroup({
    layout: fadePipeline.getBindGroupLayout(0),
    entries: [{
      binding: 0,
      resource: { buffer: fadeBuffer }
    }]
  });
  const renderer = {
    canvas,
    context,
    device,
    format,
    width: 0,
    height: 0,
    spriteCount,
    motionState,
    computePipeline,
    linePipeline,
    fadePipeline,
    computeBindGroup,
    lineBindGroup,
    fadeBindGroup,
    vertexBuffer,
    paramsBuffer,
    resolutionBuffer,
    fadeBuffer,
    resize(nextWidth, nextHeight) {
      this.width = nextWidth;
      this.height = nextHeight;
      this.canvas.width = nextWidth;
      this.canvas.height = nextHeight;
      this.context.configure({
        device: this.device,
        format: this.format,
        alphaMode: "opaque"
      });
      this.device.queue.writeBuffer(this.resolutionBuffer, 0, new Float32Array([nextWidth, nextHeight]));
      this.clear();
    },
    clear() {
      const encoder = this.device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: this.context.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: "clear",
          storeOp: "store"
        }]
      });
      pass.end();
      this.device.queue.submit([encoder.finish()]);
    },
    drawFrame(elapsedMs, fadeAmount) {
      this.device.queue.writeBuffer(this.paramsBuffer, 0, new Float32Array([
        this.width,
        this.height,
        this.motionState.pointerX,
        this.motionState.pointerY,
        elapsedMs,
        Sprite.minDistanceSquared,
        Sprite.tooFarSquared,
        this.motionState.repelMode ? 1 : 0,
        Sprite.pointerTurnMs,
        Sprite.changeDirectionMs,
        Sprite.maxRandomAngleChange,
        this.spriteCount
      ]));

      if (fadeAmount !== null) {
        const fadeAlpha = Math.max(0, Math.min(1, 1 - fadeAmount));
        this.device.queue.writeBuffer(this.fadeBuffer, 0, new Float32Array([fadeAlpha]));
      }

      const encoder = this.device.createCommandEncoder();
      if (fadeAmount !== null) {
        const fadePass = encoder.beginRenderPass({
          colorAttachments: [{
            view: this.context.getCurrentTexture().createView(),
            loadOp: "load",
            storeOp: "store"
          }]
        });
        fadePass.setPipeline(this.fadePipeline);
        fadePass.setBindGroup(0, this.fadeBindGroup);
        fadePass.draw(6);
        fadePass.end();
      }

      const computePass = encoder.beginComputePass();
      computePass.setPipeline(this.computePipeline);
      computePass.setBindGroup(0, this.computeBindGroup);
      computePass.dispatchWorkgroups(Math.ceil(this.spriteCount / 256));
      computePass.end();

      const linePass = encoder.beginRenderPass({
        colorAttachments: [{
          view: this.context.getCurrentTexture().createView(),
          loadOp: "load",
          storeOp: "store"
        }]
      });
      linePass.setPipeline(this.linePipeline);
      linePass.setBindGroup(0, this.lineBindGroup);
      linePass.setVertexBuffer(0, this.vertexBuffer);
      linePass.draw(lineVertexCount);
      linePass.end();
      this.device.queue.submit([encoder.finish()]);
    },
    finish() {
      return this.device.queue.onSubmittedWorkDone();
    }
  };

  setSpriteInteractionDistances(width, height);
  renderer.resize(width, height);
  return renderer;
}

function createStorageBuffer(device, data) {
  const buffer = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
  });
  device.queue.writeBuffer(buffer, 0, data);
  return buffer;
}

export function readSpriteCount(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SPRITE_COUNT;
}

export function readFadeAmount(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.max(0.02, Math.min(0.25, parsed)) : DEFAULT_FADE_AMOUNT;
}

export function randomBetween(random, min, max) {
  return min + (max - min) * random();
}

export function createRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function startSwarmApp() {
  const canvas = document.querySelector("#swarm");
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
  let renderer = null;
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
  const motionState = {
    width: canvasWidth,
    height: canvasHeight,
    pointerX,
    pointerY,
    repelMode
  };

  function resize() {
    const rect = canvas.getBoundingClientRect();
    canvasWidth = Math.max(1, Math.floor(rect.width));
    canvasHeight = Math.max(1, Math.floor(rect.height));
    motionState.width = canvasWidth;
    motionState.height = canvasHeight;
    setSpriteInteractionDistances(canvasWidth, canvasHeight);
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
      renderer.fade(1 - fadeAmountPerMs * fadeElapsedMs);
      fadeFramesElapsed = 0;
      fadeElapsedMs = 0;
    }

    updateSprites(sprites, elapsedMs, motionState);
    renderer.drawSprites(sprites, lineVertices, repelMode);

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

  function resetDrawingSurface() {
    if (renderer === null) {
      renderer = createWebglRenderer(canvas, canvasWidth, canvasHeight);
    } else {
      renderer.resize(canvasWidth, canvasHeight);
    }
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
    motionState.repelMode = repelMode;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointerup", event => {
    repelMode = false;
    motionState.repelMode = repelMode;
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
}

function isControlElement(target) {
  return target instanceof HTMLButtonElement || target instanceof HTMLInputElement;
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

if (document.querySelector("#swarm")) {
  startSwarmApp();
}

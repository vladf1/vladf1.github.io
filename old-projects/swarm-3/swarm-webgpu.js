import { Sprite, VERTICES_PER_LINE, loadShaders } from "./swarm-common.js";

export const MAX_ATTRACTORS = 128;
const FLOATS_PER_ATTRACTOR = 4;
const FLOATS_PER_MARKER_VERTEX = 8;
const ATTRACTOR_RADIUS_SEGMENTS = 96;
const VERTICES_PER_ATTRACTOR_MARKER = 4 + ATTRACTOR_RADIUS_SEGMENTS * 4;
const ATTRACTOR_STRENGTH = 1;
const ATTRACTOR_RADIUS = 375;
const ATTRACTOR_PLATEAU_RADIUS_SCALE = 0.38;
const ATTRACTOR_MARKER_SIZE = 10;

function createWebgpuPresenter(device, format, shaderSource) {
  const shader = device.createShaderModule({
    code: shaderSource
  });
  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: shader,
      entryPoint: "vertexMain"
    },
    fragment: {
      module: shader,
      entryPoint: "fragmentMain",
      targets: [{ format }]
    },
    primitive: {
      topology: "triangle-list"
    }
  });
  const sampler = device.createSampler({
    magFilter: "nearest",
    minFilter: "nearest"
  });
  return {
    pipeline,
    sampler
  };
}

function createWebgpuTrailTexture(device, format, width, height) {
  const texture = device.createTexture({
    size: [width, height],
    format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
  });
  return {
    texture,
    view: texture.createView()
  };
}

export async function createWebgpuComputeRenderer(canvas, width, height, sprites, motionState) {
  if (!("gpu" in navigator)) {
    throw new Error("WebGPU unavailable in this browser.");
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (adapter === null) {
    throw new Error("WebGPU adapter unavailable.");
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
  const attractorData = new Float32Array(MAX_ATTRACTORS * FLOATS_PER_ATTRACTOR);
  const attractorMarkerData = new Float32Array(MAX_ATTRACTORS * VERTICES_PER_ATTRACTOR_MARKER * FLOATS_PER_MARKER_VERTEX);

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
        0,
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

  const shaders = await loadWebgpuShaders();
  const computeShader = device.createShaderModule({ code: shaders.compute });
  const lineShader = device.createShaderModule({ code: shaders.line });
  const fadeShader = device.createShaderModule({ code: shaders.fade });
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
            dstFactor: "one-minus-src-alpha",
            operation: "add"
          }
        }
      }]
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
  const attractorBuffer = device.createBuffer({
    size: attractorData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
  });
  const attractorVertexBuffer = device.createBuffer({
    size: attractorMarkerData.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
  });
  const paramsBuffer = device.createBuffer({
    size: 64,
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
  const presenter = createWebgpuPresenter(device, format, shaders.present);
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
      { binding: 7, resource: { buffer: paramsBuffer } },
      { binding: 8, resource: { buffer: attractorBuffer } }
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
    attractorBuffer,
    attractorVertexBuffer,
    attractorData,
    attractorMarkerData,
    attractorCount: 0,
    attractorVertexCount: 0,
    paramsBuffer,
    resolutionBuffer,
    fadeBuffer,
    presentPipeline: presenter.pipeline,
    presentSampler: presenter.sampler,
    presentBindGroup: null,
    trailTexture: null,
    trailView: null,
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
      this.createTrailTexture();
      this.clear();
    },
    clear() {
      const encoder = this.device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: this.trailView,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: "clear",
          storeOp: "store"
        }]
      });
      pass.end();
      this.presentTrail(encoder);
      this.device.queue.submit([encoder.finish()]);
    },
    drawFrame(sprites, motionState, elapsedMs, fadeAmount) {
      this.device.queue.writeBuffer(this.paramsBuffer, 0, new Float32Array([
        this.width,
        this.height,
        this.spriteCount,
        this.attractorCount,
        elapsedMs,
        0,
        0,
        0,
        Sprite.attractorTurnMs,
        Sprite.changeDirectionMs,
        Sprite.maxRandomAngleChange,
        0,
        0,
        0,
        0,
        0
      ]));

      if (fadeAmount !== null) {
        const fadeAlpha = Math.max(0, Math.min(1, 1 - fadeAmount));
        this.device.queue.writeBuffer(this.fadeBuffer, 0, new Float32Array([fadeAlpha]));
      }

      const encoder = this.device.createCommandEncoder();
      if (fadeAmount !== null) {
        const fadePass = encoder.beginRenderPass({
          colorAttachments: [{
            view: this.trailView,
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
          view: this.trailView,
          loadOp: "load",
          storeOp: "store"
        }]
      });
      linePass.setPipeline(this.linePipeline);
      linePass.setBindGroup(0, this.lineBindGroup);
      linePass.setVertexBuffer(0, this.vertexBuffer);
      linePass.draw(lineVertexCount);
      if (this.attractorVertexCount > 0) {
        linePass.setVertexBuffer(0, this.attractorVertexBuffer);
        linePass.draw(this.attractorVertexCount);
      }
      linePass.end();
      this.presentTrail(encoder);
      this.device.queue.submit([encoder.finish()]);
    },
    setAttractors(attractors) {
      this.attractorCount = Math.min(attractors.length, MAX_ATTRACTORS);
      this.attractorData.fill(0);
      this.attractorMarkerData.fill(0);
      let markerIndex = 0;

      for (let index = 0; index < this.attractorCount; index++) {
        const attractor = attractors[index];
        const x = attractor.x;
        const y = attractor.y;
        this.attractorData.set([x, y, ATTRACTOR_STRENGTH, ATTRACTOR_RADIUS], index * FLOATS_PER_ATTRACTOR);

        markerIndex = writeCircleVertices(this.attractorMarkerData, markerIndex, x, y, ATTRACTOR_RADIUS, 0.78, 0.92, 1, 0.24);
        markerIndex = writeCircleVertices(
          this.attractorMarkerData,
          markerIndex,
          x,
          y,
          ATTRACTOR_RADIUS * ATTRACTOR_PLATEAU_RADIUS_SCALE,
          1,
          0.94,
          0.1,
          0.42
        );
        markerIndex = writeMarkerVertex(this.attractorMarkerData, markerIndex, x - ATTRACTOR_MARKER_SIZE, y, 1, 0.94, 0.1, 1);
        markerIndex = writeMarkerVertex(this.attractorMarkerData, markerIndex, x + ATTRACTOR_MARKER_SIZE, y, 1, 0.94, 0.1, 1);
        markerIndex = writeMarkerVertex(this.attractorMarkerData, markerIndex, x, y - ATTRACTOR_MARKER_SIZE, 1, 0.94, 0.1, 1);
        markerIndex = writeMarkerVertex(this.attractorMarkerData, markerIndex, x, y + ATTRACTOR_MARKER_SIZE, 1, 0.94, 0.1, 1);
      }

      this.attractorVertexCount = markerIndex / FLOATS_PER_MARKER_VERTEX;
      this.device.queue.writeBuffer(this.attractorBuffer, 0, this.attractorData);
      this.device.queue.writeBuffer(this.attractorVertexBuffer, 0, this.attractorMarkerData);
    },
    createTrailTexture() {
      if (this.trailTexture !== null) {
        this.trailTexture.destroy();
      }
      const trail = createWebgpuTrailTexture(this.device, this.format, this.width, this.height);
      this.trailTexture = trail.texture;
      this.trailView = trail.view;
      this.presentBindGroup = this.device.createBindGroup({
        layout: this.presentPipeline.getBindGroupLayout(0),
        entries: [
          {
            binding: 0,
            resource: this.presentSampler
          },
          {
            binding: 1,
            resource: this.trailView
          }
        ]
      });
    },
    presentTrail(encoder) {
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: this.context.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: "clear",
          storeOp: "store"
        }]
      });
      pass.setPipeline(this.presentPipeline);
      pass.setBindGroup(0, this.presentBindGroup);
      pass.draw(6);
      pass.end();
    },
    finish() {
      return this.device.queue.onSubmittedWorkDone();
    }
  };

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

function writeCircleVertices(vertices, index, centerX, centerY, radius, red, green, blue, alpha) {
  for (let segment = 0; segment < ATTRACTOR_RADIUS_SEGMENTS; segment++) {
    const startAngle = segment / ATTRACTOR_RADIUS_SEGMENTS * Math.PI * 2;
    const endAngle = (segment + 1) / ATTRACTOR_RADIUS_SEGMENTS * Math.PI * 2;
    index = writeMarkerVertex(
      vertices,
      index,
      centerX + Math.cos(startAngle) * radius,
      centerY + Math.sin(startAngle) * radius,
      red,
      green,
      blue,
      alpha
    );
    index = writeMarkerVertex(
      vertices,
      index,
      centerX + Math.cos(endAngle) * radius,
      centerY + Math.sin(endAngle) * radius,
      red,
      green,
      blue,
      alpha
    );
  }
  return index;
}

function writeMarkerVertex(vertices, index, x, y, red, green, blue, alpha) {
  vertices[index++] = x;
  vertices[index++] = y;
  vertices[index++] = 0;
  vertices[index++] = 0;
  vertices[index++] = red;
  vertices[index++] = green;
  vertices[index++] = blue;
  vertices[index++] = alpha;
  return index;
}

async function loadWebgpuShaders() {
  const [present, compute, line, fade] = await loadShaders([
    "webgpu-present.wgsl",
    "webgpu-compute.wgsl",
    "webgpu-line.wgsl",
    "webgpu-fade.wgsl"
  ]);
  return { present, compute, line, fade };
}

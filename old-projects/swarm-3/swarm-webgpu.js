import { loadShaders } from "./swarm-common.js";
import { Worm } from "./swarm-worms.js";
import { MAX_APPLES } from "./swarm-apples.js";

const FLOATS_PER_APPLE = 4;
const FLOATS_PER_MARKER_VERTEX = 8;
const APPLE_RADIUS_SEGMENTS = 96;
const VERTICES_PER_APPLE_MARKER = 4 + APPLE_RADIUS_SEGMENTS * 4;
const APPLE_STEM_SIZE = 12;
const VERTICES_PER_WORM = 2;

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

export async function createWebgpuComputeRenderer(canvas, width, height, worms, motionState) {
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
  const wormCount = worms.length;
  const computeVertexStride = 32;
  const lineVertexCount = wormCount * VERTICES_PER_WORM;
  const positionData = new Float32Array(wormCount * 4);
  const motionAData = new Float32Array(wormCount * 4);
  const motionBData = new Float32Array(wormCount * 4);
  const motionCData = new Float32Array(wormCount * 4);
  const randomData = new Uint32Array(wormCount);
  const appleData = new Float32Array(MAX_APPLES * FLOATS_PER_APPLE);
  const appleMarkerData = new Float32Array(MAX_APPLES * VERTICES_PER_APPLE_MARKER * FLOATS_PER_MARKER_VERTEX);
  const appleEaterClearData = new Uint32Array(MAX_APPLES);

  for (let index = 0; index < wormCount; index++) {
    const worm = worms[index];
    positionData.set([
      worm.xPosition,
      worm.yPosition,
      worm.previousX,
      worm.previousY
    ], index * 4);
    motionAData.set([
      worm.xVelocity,
      worm.yVelocity,
      worm.speed,
      worm.crazinessPerMs
    ], index * 4);
    motionBData.set([
      worm.offsetX,
      worm.offsetY,
        0,
        worm.angle
    ], index * 4);
    motionCData.set([
      worm.angleStepPerMs,
      worm.angleChangeMsLeft,
      0,
      0
    ], index * 4);
    randomData[index] = (0x9e3779b9 ^ (index * 747796405) ^ wormCount) >>> 0;
  }

  const [presentShaderSource, computeShaderSource, lineShaderSource, fadeShaderSource] = await loadShaders([
    "webgpu-present.wgsl",
    "webgpu-compute.wgsl",
    "webgpu-line.wgsl",
    "webgpu-fade.wgsl"
  ]);
  const computeShader = device.createShaderModule({ code: computeShaderSource });
  const lineShader = device.createShaderModule({ code: lineShaderSource });
  const fadeShader = device.createShaderModule({ code: fadeShaderSource });
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
  const randomBuffer = createStorageBuffer(device, randomData);
  const vertexBuffer = device.createBuffer({
    size: lineVertexCount * computeVertexStride,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX
  });
  const appleBuffer = device.createBuffer({
    size: appleData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
  });
  const appleEaterBuffer = device.createBuffer({
    size: appleEaterClearData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
  });
  const appleEaterReadbackBuffer = device.createBuffer({
    size: appleEaterClearData.byteLength,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
  });
  const appleVertexBuffer = device.createBuffer({
    size: appleMarkerData.byteLength,
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
  const presenter = createWebgpuPresenter(device, format, presentShaderSource);
  const computeBindGroup = device.createBindGroup({
    layout: computePipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: positionBuffer } },
      { binding: 1, resource: { buffer: motionABuffer } },
      { binding: 2, resource: { buffer: motionBBuffer } },
      { binding: 3, resource: { buffer: motionCBuffer } },
      { binding: 4, resource: { buffer: randomBuffer } },
      { binding: 5, resource: { buffer: vertexBuffer } },
      { binding: 6, resource: { buffer: paramsBuffer } },
      { binding: 7, resource: { buffer: appleBuffer } },
      { binding: 8, resource: { buffer: appleEaterBuffer } }
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
    wormCount,
    motionState,
    computePipeline,
    linePipeline,
    fadePipeline,
    computeBindGroup,
    lineBindGroup,
    fadeBindGroup,
    vertexBuffer,
    appleBuffer,
    appleEaterBuffer,
    appleEaterReadbackBuffer,
    appleEaterClearData,
    appleVertexBuffer,
    appleData,
    appleMarkerData,
    appleCount: 0,
    appleVertexCount: 0,
    appleEatersPending: false,
    appleEatersHandler: null,
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
    drawFrame(worms, motionState, elapsedMs, fadeAmount) {
      this.device.queue.writeBuffer(this.paramsBuffer, 0, new Float32Array([
        this.width,
        this.height,
        this.wormCount,
        this.appleCount,
        elapsedMs,
        0,
        0,
        0,
        Worm.appleTurnMs,
        Worm.changeDirectionMs,
        Worm.maxRandomAngleChange,
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
      this.device.queue.writeBuffer(this.appleEaterBuffer, 0, this.appleEaterClearData);

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
      computePass.dispatchWorkgroups(Math.ceil(this.wormCount / 256));
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
      linePass.end();
      const shouldReadAppleEaters = this.appleEatersHandler !== null && !this.appleEatersPending;
      if (shouldReadAppleEaters) {
        encoder.copyBufferToBuffer(this.appleEaterBuffer, 0, this.appleEaterReadbackBuffer, 0, this.appleEaterClearData.byteLength);
      }
      const targetView = this.context.getCurrentTexture().createView();
      this.presentTrail(encoder, targetView);
      this.drawAppleOverlay(encoder, targetView);
      this.device.queue.submit([encoder.finish()]);
      if (shouldReadAppleEaters) {
        this.readAppleEaters(elapsedMs);
      }
    },
    setApples(apples) {
      this.appleCount = Math.min(apples.length, MAX_APPLES);
      this.appleData.fill(0);
      this.appleMarkerData.fill(0);
      let markerIndex = 0;

      for (let index = 0; index < this.appleCount; index++) {
        const apple = apples[index];
        const radius = apple.isVisible ? apple.radius : 0;
        const strength = apple.isVisible ? apple.gravityStrength : 0;
        const x = apple.x;
        const y = apple.y;
        this.appleData.set([x, y, strength, radius], index * FLOATS_PER_APPLE);

        if (radius > 0) {
          markerIndex = writeCircleVertices(this.appleMarkerData, markerIndex, x, y, radius, 1, 0.12, 0.22, 0.88);
          markerIndex = writeCircleVertices(this.appleMarkerData, markerIndex, x, y, radius * 0.82, 1, 0.86, 0.28, 0.45);
          markerIndex = writeMarkerVertex(this.appleMarkerData, markerIndex, x, y - radius * 0.92, 0.36, 0.18, 0.07, 0.95);
          markerIndex = writeMarkerVertex(this.appleMarkerData, markerIndex, x + APPLE_STEM_SIZE * 0.25, y - radius - APPLE_STEM_SIZE, 0.36, 0.18, 0.07, 0.95);
          markerIndex = writeMarkerVertex(this.appleMarkerData, markerIndex, x + APPLE_STEM_SIZE * 0.35, y - radius * 0.92, 0.42, 0.88, 0.27, 0.9);
          markerIndex = writeMarkerVertex(this.appleMarkerData, markerIndex, x + APPLE_STEM_SIZE * 1.4, y - radius * 0.72, 0.42, 0.88, 0.27, 0.9);
        }
      }

      this.appleVertexCount = markerIndex / FLOATS_PER_MARKER_VERTEX;
      this.device.queue.writeBuffer(this.appleBuffer, 0, this.appleData);
      this.device.queue.writeBuffer(this.appleVertexBuffer, 0, this.appleMarkerData);
    },
    setAppleEatersHandler(handler) {
      this.appleEatersHandler = handler;
    },
    createTrailTexture() {
      if (this.trailTexture !== null) {
        this.trailTexture.destroy();
      }
      this.trailTexture = this.device.createTexture({
        size: [this.width, this.height],
        format: this.format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
      });
      this.trailView = this.trailTexture.createView();
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
    presentTrail(encoder, targetView = this.context.getCurrentTexture().createView()) {
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: targetView,
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
    drawAppleOverlay(encoder, targetView) {
      if (this.appleVertexCount === 0) {
        return;
      }

      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: targetView,
          loadOp: "load",
          storeOp: "store"
        }]
      });
      pass.setPipeline(this.linePipeline);
      pass.setBindGroup(0, this.lineBindGroup);
      pass.setVertexBuffer(0, this.appleVertexBuffer);
      pass.draw(this.appleVertexCount);
      pass.end();
    },
    readAppleEaters(elapsedMs) {
      this.appleEatersPending = true;
      this.appleEaterReadbackBuffer.mapAsync(GPUMapMode.READ).then(() => {
        const counts = new Uint32Array(this.appleEaterReadbackBuffer.getMappedRange()).slice(0, this.appleCount);
        this.appleEaterReadbackBuffer.unmap();
        this.appleEatersPending = false;
        this.appleEatersHandler?.(counts, elapsedMs);
      }).catch(() => {
        this.appleEatersPending = false;
      });
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
  for (let segment = 0; segment < APPLE_RADIUS_SEGMENTS; segment++) {
    const startAngle = segment / APPLE_RADIUS_SEGMENTS * Math.PI * 2;
    const endAngle = (segment + 1) / APPLE_RADIUS_SEGMENTS * Math.PI * 2;
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

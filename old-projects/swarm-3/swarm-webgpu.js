import { loadShaders } from "./swarm-common.js";
import { Worm } from "./swarm-worms.js";
import {
  APPLE_MAX_RADIUS,
  APPLE_MIN_ACTIVE_RADIUS,
  MAX_APPLES
} from "./swarm-apples.js";

const FLOATS_PER_APPLE = 4;
const FLOATS_PER_MARKER_VERTEX = 8;
const APPLE_RADIUS_SEGMENTS = 96;
const VERTICES_PER_APPLE_MARKER = 2 + APPLE_RADIUS_SEGMENTS * 2;
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

  const [presentShaderSource, computeShaderSource, appleShaderSource, lineShaderSource, fadeShaderSource] = await loadShaders([
    "webgpu-present.wgsl",
    "webgpu-compute.wgsl",
    "webgpu-apple.wgsl",
    "webgpu-line.wgsl",
    "webgpu-fade.wgsl"
  ]);
  const computeShader = device.createShaderModule({ code: computeShaderSource });
  const appleShader = device.createShaderModule({ code: appleShaderSource });
  const lineShader = device.createShaderModule({ code: lineShaderSource });
  const fadeShader = device.createShaderModule({ code: fadeShaderSource });
  const computePipeline = device.createComputePipeline({
    layout: "auto",
    compute: {
      module: computeShader,
      entryPoint: "computeMain"
    }
  });
  const applePipeline = device.createComputePipeline({
    layout: "auto",
    compute: {
      module: appleShader,
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
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
  });
  const appleEaterBuffer = device.createBuffer({
    size: appleEaterClearData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
  });
  const appleReadbackBuffer = device.createBuffer({
    size: appleData.byteLength,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
  });
  const appleVertexBuffer = device.createBuffer({
    size: appleMarkerData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
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
  const appleBindGroup = device.createBindGroup({
    layout: applePipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: appleBuffer } },
      { binding: 1, resource: { buffer: appleEaterBuffer } },
      { binding: 2, resource: { buffer: appleVertexBuffer } },
      { binding: 3, resource: { buffer: paramsBuffer } }
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
    applePipeline,
    linePipeline,
    fadePipeline,
    computeBindGroup,
    appleBindGroup,
    lineBindGroup,
    fadeBindGroup,
    vertexBuffer,
    appleBuffer,
    appleEaterBuffer,
    appleReadbackBuffer,
    appleEaterClearData,
    appleVertexBuffer,
    appleData,
    appleMarkerData,
    appleCount: 0,
    appleSnapshotPending: false,
    appleSnapshotHandler: null,
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
    drawFrame(worms, motionState, elapsedMs, fadeAmount, appleBitePercentPerSecond) {
      this.device.queue.writeBuffer(this.paramsBuffer, 0, new Float32Array([
        this.width,
        this.height,
        this.wormCount,
        this.appleCount,
        elapsedMs,
        appleBitePercentPerSecond,
        APPLE_MIN_ACTIVE_RADIUS,
        APPLE_MAX_RADIUS,
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

      if (this.appleCount > 0) {
        const applePass = encoder.beginComputePass();
        applePass.setPipeline(this.applePipeline);
        applePass.setBindGroup(0, this.appleBindGroup);
        applePass.dispatchWorkgroups(Math.ceil(this.appleCount / 64));
        applePass.end();
      }

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
      const shouldReadApples = this.appleSnapshotHandler !== null && !this.appleSnapshotPending;
      if (shouldReadApples) {
        encoder.copyBufferToBuffer(this.appleBuffer, 0, this.appleReadbackBuffer, 0, this.appleData.byteLength);
      }
      const targetView = this.context.getCurrentTexture().createView();
      this.presentTrail(encoder, targetView);
      this.drawAppleOverlay(encoder, targetView);
      this.device.queue.submit([encoder.finish()]);
      if (shouldReadApples) {
        this.readApples();
      }
    },
    setApples(apples) {
      this.appleCount = Math.min(apples.length, MAX_APPLES);
      this.appleData.fill(0);
      this.appleMarkerData.fill(0);

      for (let index = 0; index < this.appleCount; index++) {
        const apple = apples[index];
        const radius = apple.isVisible ? apple.radius : 0;
        const x = apple.x;
        const y = apple.y;
        this.appleData.set([x, y, apple.volume, radius], index * FLOATS_PER_APPLE);
      }

      this.device.queue.writeBuffer(this.appleBuffer, 0, this.appleData);
      this.device.queue.writeBuffer(this.appleEaterBuffer, 0, this.appleEaterClearData);
      this.device.queue.writeBuffer(this.appleVertexBuffer, 0, this.appleMarkerData);
    },
    requestAppleSnapshot(handler) {
      if (this.appleSnapshotPending) {
        return;
      }
      this.appleSnapshotHandler = handler;
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
      if (this.appleCount === 0) {
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
      pass.draw(this.appleCount * VERTICES_PER_APPLE_MARKER);
      pass.end();
    },
    readApples() {
      this.appleSnapshotPending = true;
      this.appleReadbackBuffer.mapAsync(GPUMapMode.READ).then(() => {
        const snapshot = new Float32Array(this.appleReadbackBuffer.getMappedRange()).slice(0, this.appleCount * FLOATS_PER_APPLE);
        this.appleReadbackBuffer.unmap();
        this.appleSnapshotPending = false;
        const handler = this.appleSnapshotHandler;
        this.appleSnapshotHandler = null;
        handler?.(snapshot);
      }).catch(() => {
        this.appleSnapshotPending = false;
        this.appleSnapshotHandler = null;
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

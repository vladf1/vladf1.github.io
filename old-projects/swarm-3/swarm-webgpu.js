import { loadShaders, randomBetween } from "./swarm-common.js";
import { Worm } from "./swarm-worms.js";
import {
  APPLE_MAX_RADIUS,
  APPLE_GRAVITY_RADIUS_SCALE,
  APPLE_MIN_ACTIVE_RADIUS,
  MAX_APPLES
} from "./swarm-apples.js";

const FLOATS_PER_APPLE = 4;
const FLOATS_PER_MARKER_VERTEX = 8;
const APPLE_RADIUS_SEGMENTS = 96;
const VERTICES_PER_APPLE_MARKER = 16 + APPLE_RADIUS_SEGMENTS * 2;
const VERTICES_PER_PREVIEW_MARKER = APPLE_RADIUS_SEGMENTS * 4;
const VERTICES_PER_WORM = 2;
const MAX_APPLE_PLACEMENTS_PER_FRAME = 32;
const WORM_CAPACITY_BUCKET_SIZE = 250000;
const FLOATS_PER_WORM_VEC4_BUFFER = 4;
const BYTES_PER_WORM_VEC4_BUFFER = FLOATS_PER_WORM_VEC4_BUFFER * Float32Array.BYTES_PER_ELEMENT;
const BYTES_PER_RANDOM_STATE = Uint32Array.BYTES_PER_ELEMENT;
const COMPUTE_VERTEX_STRIDE = 32;
let webgpuContextPromise = null;

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

export async function createWebgpuComputeRenderer(canvas, width, height, wormCount, motionState) {
  const { device } = await getWebgpuContext();
  const context = canvas.getContext("webgpu");
  const format = navigator.gpu.getPreferredCanvasFormat();
  const maxSupportedWormCount = getMaxSupportedWormCount(device, COMPUTE_VERTEX_STRIDE);
  if (wormCount > maxSupportedWormCount) {
    throw new Error(`WebGPU limit reached. Try ${maxSupportedWormCount.toLocaleString()} worms or fewer.`);
  }
  const capacityWormCount = getWormCapacity(wormCount, maxSupportedWormCount);
  const positionData = new Float32Array(capacityWormCount * 4);
  const motionAData = new Float32Array(capacityWormCount * 4);
  const motionBData = new Float32Array(capacityWormCount * 4);
  const motionCData = new Float32Array(capacityWormCount * 4);
  const randomData = new Uint32Array(capacityWormCount);
  initializeWormData(positionData, motionAData, motionBData, motionCData, randomData, 0, wormCount, width, height);
  const wormResources = createWormResourcesFromData(device, capacityWormCount, positionData, motionAData, motionBData, motionCData, randomData);
  const appleData = new Float32Array(MAX_APPLES * FLOATS_PER_APPLE);
  const appleMarkerData = new Float32Array(MAX_APPLES * VERTICES_PER_APPLE_MARKER * FLOATS_PER_MARKER_VERTEX);
  const appleEaterClearData = new Uint32Array(MAX_APPLES);
  const appleFreeSlotData = new Uint32Array(MAX_APPLES);
  const appleFreeCountData = new Uint32Array([MAX_APPLES]);
  const applePlacementData = new Float32Array(MAX_APPLE_PLACEMENTS_PER_FRAME * FLOATS_PER_APPLE);
  const applePreviewData = new Float32Array(VERTICES_PER_PREVIEW_MARKER * FLOATS_PER_MARKER_VERTEX);

  for (let index = 0; index < MAX_APPLES; index++) {
    appleFreeSlotData[index] = MAX_APPLES - 1 - index;
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
  const applePlacementPipeline = device.createComputePipeline({
    layout: "auto",
    compute: {
      module: appleShader,
      entryPoint: "placementMain"
    }
  });
  const linePipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: lineShader,
      entryPoint: "vertexMain",
      buffers: [{
        arrayStride: COMPUTE_VERTEX_STRIDE,
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
  const appleBuffer = device.createBuffer({
    size: appleData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
  });
  const appleEaterBuffer = device.createBuffer({
    size: appleEaterClearData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
  });
  const appleFreeSlotBuffer = createStorageBuffer(device, appleFreeSlotData);
  const appleFreeCountBuffer = createStorageBuffer(device, appleFreeCountData);
  const applePlacementBuffer = device.createBuffer({
    size: applePlacementData.byteLength,
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
  const applePreviewBuffer = device.createBuffer({
    size: applePreviewData.byteLength,
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
  const computeBindGroup = createComputeBindGroup(device, computePipeline, wormResources, paramsBuffer, appleBuffer, appleEaterBuffer);
  const appleBindGroup = device.createBindGroup({
    layout: applePipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: appleBuffer } },
      { binding: 1, resource: { buffer: appleEaterBuffer } },
      { binding: 2, resource: { buffer: appleVertexBuffer } },
      { binding: 3, resource: { buffer: paramsBuffer } },
      { binding: 4, resource: { buffer: appleFreeSlotBuffer } },
      { binding: 5, resource: { buffer: appleFreeCountBuffer } }
    ]
  });
  const applePlacementBindGroup = device.createBindGroup({
    layout: applePlacementPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: appleBuffer } },
      { binding: 2, resource: { buffer: appleVertexBuffer } },
      { binding: 3, resource: { buffer: paramsBuffer } },
      { binding: 4, resource: { buffer: appleFreeSlotBuffer } },
      { binding: 5, resource: { buffer: appleFreeCountBuffer } },
      { binding: 6, resource: { buffer: applePlacementBuffer } }
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
    capacityWormCount,
    motionState,
    maxSupportedWormCount,
    wormResources,
    computePipeline,
    applePipeline,
    applePlacementPipeline,
    linePipeline,
    fadePipeline,
    computeBindGroup,
    appleBindGroup,
    applePlacementBindGroup,
    lineBindGroup,
    fadeBindGroup,
    vertexBuffer: wormResources.vertexBuffer,
    positionBuffer: wormResources.positionBuffer,
    motionABuffer: wormResources.motionABuffer,
    motionBBuffer: wormResources.motionBBuffer,
    motionCBuffer: wormResources.motionCBuffer,
    randomBuffer: wormResources.randomBuffer,
    appleBuffer,
    appleEaterBuffer,
    appleFreeSlotBuffer,
    appleFreeCountBuffer,
    applePlacementBuffer,
    appleReadbackBuffer,
    appleEaterClearData,
    appleFreeSlotData,
    appleFreeCountData,
    appleVertexBuffer,
    applePreviewBuffer,
    positionData,
    motionAData,
    motionBData,
    motionCData,
    randomData,
    appleData,
    appleMarkerData,
    applePlacementData,
    applePreviewData,
    appleSlotCount: MAX_APPLES,
    applePlacementCount: 0,
    applePreviewVertexCount: 0,
    applePreviewVisible: false,
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
    setWormCount(nextWormCount) {
      if (nextWormCount > this.maxSupportedWormCount) {
        throw new Error(`WebGPU limit reached. Try ${this.maxSupportedWormCount.toLocaleString()} worms or fewer.`);
      }

      const previousWormCount = this.wormCount;
      if (nextWormCount > this.capacityWormCount) {
        this.growWormCapacity(nextWormCount);
      }
      this.wormCount = nextWormCount;
      if (nextWormCount <= previousWormCount) {
        return true;
      }

      initializeWormData(
        this.positionData,
        this.motionAData,
        this.motionBData,
        this.motionCData,
        this.randomData,
        previousWormCount,
        nextWormCount,
        this.width,
        this.height
      );
      this.device.queue.writeBuffer(this.positionBuffer, previousWormCount * BYTES_PER_WORM_VEC4_BUFFER, this.positionData.subarray(previousWormCount * 4, nextWormCount * 4));
      this.device.queue.writeBuffer(this.motionABuffer, previousWormCount * BYTES_PER_WORM_VEC4_BUFFER, this.motionAData.subarray(previousWormCount * 4, nextWormCount * 4));
      this.device.queue.writeBuffer(this.motionBBuffer, previousWormCount * BYTES_PER_WORM_VEC4_BUFFER, this.motionBData.subarray(previousWormCount * 4, nextWormCount * 4));
      this.device.queue.writeBuffer(this.motionCBuffer, previousWormCount * BYTES_PER_WORM_VEC4_BUFFER, this.motionCData.subarray(previousWormCount * 4, nextWormCount * 4));
      this.device.queue.writeBuffer(this.randomBuffer, previousWormCount * BYTES_PER_RANDOM_STATE, this.randomData.subarray(previousWormCount, nextWormCount));
      return true;
    },
    growWormCapacity(nextWormCount) {
      const previousResources = this.wormResources;
      const nextCapacity = getWormCapacity(nextWormCount, this.maxSupportedWormCount);
      const nextResources = createWormResources(this.device, nextCapacity);
      const nextPositionData = new Float32Array(nextCapacity * 4);
      const nextMotionAData = new Float32Array(nextCapacity * 4);
      const nextMotionBData = new Float32Array(nextCapacity * 4);
      const nextMotionCData = new Float32Array(nextCapacity * 4);
      const nextRandomData = new Uint32Array(nextCapacity);
      const encoder = this.device.createCommandEncoder();
      copyWormBufferRange(encoder, previousResources.positionBuffer, nextResources.positionBuffer, this.wormCount * BYTES_PER_WORM_VEC4_BUFFER);
      copyWormBufferRange(encoder, previousResources.motionABuffer, nextResources.motionABuffer, this.wormCount * BYTES_PER_WORM_VEC4_BUFFER);
      copyWormBufferRange(encoder, previousResources.motionBBuffer, nextResources.motionBBuffer, this.wormCount * BYTES_PER_WORM_VEC4_BUFFER);
      copyWormBufferRange(encoder, previousResources.motionCBuffer, nextResources.motionCBuffer, this.wormCount * BYTES_PER_WORM_VEC4_BUFFER);
      copyWormBufferRange(encoder, previousResources.randomBuffer, nextResources.randomBuffer, this.wormCount * BYTES_PER_RANDOM_STATE);
      this.device.queue.submit([encoder.finish()]);

      this.wormResources = nextResources;
      this.capacityWormCount = nextCapacity;
      this.positionBuffer = nextResources.positionBuffer;
      this.motionABuffer = nextResources.motionABuffer;
      this.motionBBuffer = nextResources.motionBBuffer;
      this.motionCBuffer = nextResources.motionCBuffer;
      this.randomBuffer = nextResources.randomBuffer;
      this.vertexBuffer = nextResources.vertexBuffer;
      this.positionData = nextPositionData;
      this.motionAData = nextMotionAData;
      this.motionBData = nextMotionBData;
      this.motionCData = nextMotionCData;
      this.randomData = nextRandomData;
      this.computeBindGroup = createComputeBindGroup(this.device, this.computePipeline, nextResources, this.paramsBuffer, this.appleBuffer, this.appleEaterBuffer);

      previousResources.positionBuffer.destroy();
      previousResources.motionABuffer.destroy();
      previousResources.motionBBuffer.destroy();
      previousResources.motionCBuffer.destroy();
      previousResources.randomBuffer.destroy();
      previousResources.vertexBuffer.destroy();
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
    drawFrame(motionState, elapsedMs, fadeAmount, appleBitePercentPerSecond) {
      const applePlacementCount = this.applePlacementCount;
      if (applePlacementCount > 0) {
        this.device.queue.writeBuffer(
          this.applePlacementBuffer,
          0,
          this.applePlacementData.subarray(0, applePlacementCount * FLOATS_PER_APPLE)
        );
      }
      this.device.queue.writeBuffer(this.paramsBuffer, 0, new Float32Array([
        this.width,
        this.height,
        this.wormCount,
        this.appleSlotCount,
        elapsedMs,
        appleBitePercentPerSecond,
        APPLE_MIN_ACTIVE_RADIUS,
        APPLE_MAX_RADIUS,
        Worm.appleTurnMs,
        Worm.changeDirectionMs,
        Worm.maxRandomAngleChange,
        0,
        applePlacementCount,
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

      const applePass = encoder.beginComputePass();
      applePass.setPipeline(this.applePipeline);
      applePass.setBindGroup(0, this.appleBindGroup);
      applePass.dispatchWorkgroups(Math.ceil(this.appleSlotCount / 64));
      applePass.end();

      if (applePlacementCount > 0) {
        const placementPass = encoder.beginComputePass();
        placementPass.setPipeline(this.applePlacementPipeline);
        placementPass.setBindGroup(0, this.applePlacementBindGroup);
        placementPass.dispatchWorkgroups(1);
        placementPass.end();
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
      linePass.draw(this.wormCount * VERTICES_PER_WORM);
      linePass.end();
      const shouldReadApples = this.appleSnapshotHandler !== null && !this.appleSnapshotPending;
      if (shouldReadApples) {
        encoder.copyBufferToBuffer(this.appleBuffer, 0, this.appleReadbackBuffer, 0, this.appleData.byteLength);
      }
      const targetView = this.context.getCurrentTexture().createView();
      this.presentTrail(encoder, targetView);
      this.drawAppleOverlay(encoder, targetView);
      this.drawApplePreview(encoder, targetView);
      this.device.queue.submit([encoder.finish()]);
      this.applePlacementCount = 0;
      if (shouldReadApples) {
        this.readApples();
      }
    },
    queueApplePlacement(x, y) {
      if (this.applePlacementCount >= MAX_APPLE_PLACEMENTS_PER_FRAME) {
        return false;
      }

      this.applePlacementData.set([
        x,
        y,
        1,
        APPLE_MAX_RADIUS
      ], this.applePlacementCount * FLOATS_PER_APPLE);
      this.applePlacementCount++;
      return true;
    },
    resetApples() {
      this.appleData.fill(0);
      this.appleMarkerData.fill(0);
      for (let index = 0; index < MAX_APPLES; index++) {
        this.appleFreeSlotData[index] = MAX_APPLES - 1 - index;
      }
      this.appleFreeCountData[0] = MAX_APPLES;
      this.applePlacementCount = 0;
      this.device.queue.writeBuffer(this.appleBuffer, 0, this.appleData);
      this.device.queue.writeBuffer(this.appleEaterBuffer, 0, this.appleEaterClearData);
      this.device.queue.writeBuffer(this.appleFreeSlotBuffer, 0, this.appleFreeSlotData);
      this.device.queue.writeBuffer(this.appleFreeCountBuffer, 0, this.appleFreeCountData);
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
      pass.draw(this.appleSlotCount * VERTICES_PER_APPLE_MARKER);
      pass.end();
    },
    setApplePreview(x, y, visible) {
      if (!visible) {
        this.applePreviewVisible = false;
        this.applePreviewVertexCount = 0;
        return;
      }

      this.applePreviewData.fill(0);
      let markerIndex = 0;
      markerIndex = writeCircleVertices(
        this.applePreviewData,
        markerIndex,
        x,
        y,
        APPLE_MAX_RADIUS * APPLE_GRAVITY_RADIUS_SCALE,
        1,
        0.9,
        0.15,
        0.16
      );
      markerIndex = writeCircleVertices(
        this.applePreviewData,
        markerIndex,
        x,
        y,
        APPLE_MAX_RADIUS,
        1,
        0.12,
        0.22,
        0.62
      );
      this.applePreviewVisible = true;
      this.applePreviewVertexCount = markerIndex / FLOATS_PER_MARKER_VERTEX;
      this.device.queue.writeBuffer(this.applePreviewBuffer, 0, this.applePreviewData);
    },
    drawApplePreview(encoder, targetView) {
      if (!this.applePreviewVisible || this.applePreviewVertexCount === 0) {
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
      pass.setVertexBuffer(0, this.applePreviewBuffer);
      pass.draw(this.applePreviewVertexCount);
      pass.end();
    },
    readApples() {
      this.appleSnapshotPending = true;
      this.appleReadbackBuffer.mapAsync(GPUMapMode.READ).then(() => {
        const snapshot = new Float32Array(this.appleReadbackBuffer.getMappedRange()).slice(0, this.appleSlotCount * FLOATS_PER_APPLE);
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

export async function getWebgpuWormLimit() {
  const { device } = await getWebgpuContext();
  return getMaxSupportedWormCount(device);
}

async function getWebgpuContext() {
  if (webgpuContextPromise !== null) {
    return webgpuContextPromise;
  }

  if (!("gpu" in navigator)) {
    throw new Error("WebGPU unavailable in this browser.");
  }

  webgpuContextPromise = navigator.gpu.requestAdapter().then(async (adapter) => {
    if (adapter === null) {
      throw new Error("WebGPU adapter unavailable.");
    }

    return {
      adapter,
      device: await adapter.requestDevice()
    };
  });
  return webgpuContextPromise;
}

function createStorageBuffer(device, data) {
  const buffer = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
  });
  device.queue.writeBuffer(buffer, 0, data);
  return buffer;
}

function createWormResources(device, capacityWormCount) {
  return {
    positionBuffer: createEmptyStorageBuffer(device, capacityWormCount * BYTES_PER_WORM_VEC4_BUFFER),
    motionABuffer: createEmptyStorageBuffer(device, capacityWormCount * BYTES_PER_WORM_VEC4_BUFFER),
    motionBBuffer: createEmptyStorageBuffer(device, capacityWormCount * BYTES_PER_WORM_VEC4_BUFFER),
    motionCBuffer: createEmptyStorageBuffer(device, capacityWormCount * BYTES_PER_WORM_VEC4_BUFFER),
    randomBuffer: createEmptyStorageBuffer(device, capacityWormCount * BYTES_PER_RANDOM_STATE),
    vertexBuffer: device.createBuffer({
      size: capacityWormCount * VERTICES_PER_WORM * COMPUTE_VERTEX_STRIDE,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX
    })
  };
}

function createWormResourcesFromData(device, capacityWormCount, positionData, motionAData, motionBData, motionCData, randomData) {
  return {
    positionBuffer: createStorageBuffer(device, positionData),
    motionABuffer: createStorageBuffer(device, motionAData),
    motionBBuffer: createStorageBuffer(device, motionBData),
    motionCBuffer: createStorageBuffer(device, motionCData),
    randomBuffer: createStorageBuffer(device, randomData),
    vertexBuffer: device.createBuffer({
      size: capacityWormCount * VERTICES_PER_WORM * COMPUTE_VERTEX_STRIDE,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX
    })
  };
}

function createEmptyStorageBuffer(device, size) {
  return device.createBuffer({
    size,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
  });
}

function createComputeBindGroup(device, computePipeline, wormResources, paramsBuffer, appleBuffer, appleEaterBuffer) {
  return device.createBindGroup({
    layout: computePipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: wormResources.positionBuffer } },
      { binding: 1, resource: { buffer: wormResources.motionABuffer } },
      { binding: 2, resource: { buffer: wormResources.motionBBuffer } },
      { binding: 3, resource: { buffer: wormResources.motionCBuffer } },
      { binding: 4, resource: { buffer: wormResources.randomBuffer } },
      { binding: 5, resource: { buffer: wormResources.vertexBuffer } },
      { binding: 6, resource: { buffer: paramsBuffer } },
      { binding: 7, resource: { buffer: appleBuffer } },
      { binding: 8, resource: { buffer: appleEaterBuffer } }
    ]
  });
}

function copyWormBufferRange(encoder, sourceBuffer, destinationBuffer, byteLength) {
  if (byteLength > 0) {
    encoder.copyBufferToBuffer(sourceBuffer, 0, destinationBuffer, 0, byteLength);
  }
}

function getMaxSupportedWormCount(gpuLimitsSource, computeVertexStride = 32) {
  const lineBytesPerWorm = VERTICES_PER_WORM * computeVertexStride;
  const storageLimit = gpuLimitsSource.limits.maxStorageBufferBindingSize;
  const bufferLimit = gpuLimitsSource.limits.maxBufferSize;
  return Math.max(1, Math.floor(Math.min(storageLimit, bufferLimit) / lineBytesPerWorm));
}

function getWormCapacity(wormCount, maxSupportedWormCount) {
  return Math.min(
    maxSupportedWormCount,
    Math.ceil(wormCount / WORM_CAPACITY_BUCKET_SIZE) * WORM_CAPACITY_BUCKET_SIZE
  );
}

function initializeWormData(positionData, motionAData, motionBData, motionCData, randomData, startIndex, endIndex, width, height) {
  for (let index = startIndex; index < endIndex; index++) {
    const startX = Math.floor(randomBetween(Math.random, 0, width));
    const startY = Math.floor(randomBetween(Math.random, 0, height));
    const speed = Worm.maxVelocityPerMs * randomBetween(Math.random, 0.4, 1);
    const crazinessPerMs = randomBetween(Math.random, 0, Worm.maxCrazinessPerMs);
    const offsetX = randomBetween(Math.random, -Worm.maxOffsetAmount, Worm.maxOffsetAmount);
    const offsetY = randomBetween(Math.random, -Worm.maxOffsetAmount, Worm.maxOffsetAmount);
    const angle = randomBetween(Math.random, 0, Math.PI * 2);
    positionData.set([
      startX,
      startY,
      startX,
      startY
    ], index * 4);
    motionAData.set([
      speed * Math.cos(angle),
      speed * Math.sin(angle),
      speed,
      crazinessPerMs
    ], index * 4);
    motionBData.set([
      offsetX,
      offsetY,
      0,
      angle
    ], index * 4);
    motionCData.set([
      0,
      0,
      0,
      0
    ], index * 4);
    randomData[index] = (0x9e3779b9 ^ (index * 747796405) ^ endIndex) >>> 0;
  }
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

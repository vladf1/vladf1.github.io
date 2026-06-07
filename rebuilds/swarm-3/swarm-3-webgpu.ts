import presentShaderSource from "./shaders/webgpu-present.wgsl?raw";
import computeShaderSource from "./shaders/webgpu-compute.wgsl?raw";
import appleShaderSource from "./shaders/webgpu-apple.wgsl?raw";
import lineShaderSource from "./shaders/webgpu-line.wgsl?raw";
import fadeShaderSource from "./shaders/webgpu-fade.wgsl?raw";

export const DEFAULT_WORM_COUNT = 2500;
export const MAX_SAFE_WORM_COUNT = 2000000;
export const MAX_APPLES = 128;
export const APPLE_BITE_PERCENT_PER_SECOND = 0.00016;
export const DEFAULT_FADE_AMOUNT = 0.1;
export const FADE_AMOUNT_PER_MS_SCALE = 0.06;

const WORM_APPLE_TURN_MS = 83.33333333333333;
const WORM_CHANGE_DIRECTION_MS = 166.66666666666666;
const WORM_MAX_RANDOM_ANGLE_CHANGE = 1.5;
export const APPLE_MAX_RADIUS = 62;
const APPLE_MIN_ACTIVE_RADIUS = 15;
const FLOATS_PER_APPLE = 4;
const FLOATS_PER_MARKER_VERTEX = 8;
const FLOATS_PER_PREVIEW = 4;
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
let webgpuContextPromise: Promise<{ adapter: GPUAdapter; device: GPUDevice }> | null = null;

function createWebgpuPresenter(device: GPUDevice, format: GPUTextureFormat, shaderSource: string) {
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

export async function createWebgpuComputeRenderer(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  renderWidth: number,
  renderHeight: number,
  wormCount: number
) {
  const { device } = await getWebgpuContext();
  const context = canvas.getContext("webgpu")!;
  const format = navigator.gpu.getPreferredCanvasFormat();
  const maxSupportedWormCount = getMaxSupportedWormCount(device, COMPUTE_VERTEX_STRIDE);
  if (wormCount > maxSupportedWormCount) {
    throw new Error(`WebGPU limit reached. Try ${maxSupportedWormCount.toLocaleString()} worms or fewer.`);
  }
  const capacityWormCount = getWormCapacity(wormCount, maxSupportedWormCount);
  const wormResources = createWormResources(device, capacityWormCount);
  const appleData = new Float32Array(MAX_APPLES * FLOATS_PER_APPLE);
  const appleMarkerData = new Float32Array(MAX_APPLES * VERTICES_PER_APPLE_MARKER * FLOATS_PER_MARKER_VERTEX);
  const appleEaterClearData = new Uint32Array(MAX_APPLES);
  const appleFreeSlotData = new Uint32Array(MAX_APPLES);
  const appleFreeCountData = new Uint32Array([MAX_APPLES]);
  const applePlacementData = new Float32Array(MAX_APPLE_PLACEMENTS_PER_FRAME * FLOATS_PER_APPLE);
  const applePreviewData = new Float32Array(FLOATS_PER_PREVIEW);

  for (let index = 0; index < MAX_APPLES; index++) {
    appleFreeSlotData[index] = MAX_APPLES - 1 - index;
  }

  const computeShader = device.createShaderModule({ code: computeShaderSource });
  const appleShader = device.createShaderModule({ code: appleShaderSource });
  const lineShader = device.createShaderModule({ code: lineShaderSource });
  const fadeShader = device.createShaderModule({ code: fadeShaderSource });
  const updateWormStateAndWriteLineVerticesPipeline = createComputePipeline(device, computeShader, "computeMain");
  const initializeWormStateRangePipeline = createComputePipeline(device, computeShader, "initMain");
  const updateAppleStateAndWriteAppleShapeVerticesPipeline = createComputePipeline(device, appleShader, "computeMain");
  const placeQueuedApplesPipeline = createComputePipeline(device, appleShader, "placementMain");
  const drawBufferedLineVerticesPipeline = createLinePipeline(device, format, lineShader, "vertexMain", [{
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
  }]);
  const fadeTrailImagePipeline = device.createRenderPipeline({
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
  const drawApplePreviewRingsPipeline = createLinePipeline(device, format, lineShader, "previewVertexMain");
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
  const applePreviewBuffer = createUniformBuffer(device, applePreviewData.byteLength);
  const paramsBuffer = createUniformBuffer(device, 64);
  const resolutionBuffer = createUniformBuffer(device, 8);
  const fadeBuffer = createUniformBuffer(device, 4);
  const presenter = createWebgpuPresenter(device, format, presentShaderSource);
  const computeBindGroup = createComputeBindGroup(device, updateWormStateAndWriteLineVerticesPipeline, wormResources, paramsBuffer, appleBuffer, appleEaterBuffer);
  const initBindGroup = createInitBindGroup(device, initializeWormStateRangePipeline, wormResources, paramsBuffer);
  const appleBindGroup = device.createBindGroup({
    layout: updateAppleStateAndWriteAppleShapeVerticesPipeline.getBindGroupLayout(0),
    entries: [
      bufferBinding(0, appleBuffer),
      bufferBinding(1, appleEaterBuffer),
      bufferBinding(2, appleVertexBuffer),
      bufferBinding(3, paramsBuffer),
      bufferBinding(4, appleFreeSlotBuffer),
      bufferBinding(5, appleFreeCountBuffer)
    ]
  });
  const applePlacementBindGroup = device.createBindGroup({
    layout: placeQueuedApplesPipeline.getBindGroupLayout(0),
    entries: [
      bufferBinding(0, appleBuffer),
      bufferBinding(2, appleVertexBuffer),
      bufferBinding(3, paramsBuffer),
      bufferBinding(4, appleFreeSlotBuffer),
      bufferBinding(5, appleFreeCountBuffer),
      bufferBinding(6, applePlacementBuffer)
    ]
  });
  const lineBindGroup = device.createBindGroup({
    layout: drawBufferedLineVerticesPipeline.getBindGroupLayout(0),
    entries: [bufferBinding(0, resolutionBuffer)]
  });
  const fadeBindGroup = device.createBindGroup({
    layout: fadeTrailImagePipeline.getBindGroupLayout(0),
    entries: [bufferBinding(0, fadeBuffer)]
  });
  const previewBindGroup = device.createBindGroup({
    layout: drawApplePreviewRingsPipeline.getBindGroupLayout(0),
    entries: [
      bufferBinding(0, resolutionBuffer),
      bufferBinding(1, applePreviewBuffer)
    ]
  });
  const renderer = new class WebgpuComputeRenderer {
    canvas = canvas;
    context = context;
    device = device;
    format = format;
    width = 0;
    height = 0;
    renderWidth = 0;
    renderHeight = 0;
    wormCount = wormCount;
    capacityWormCount = capacityWormCount;
    maxSupportedWormCount = maxSupportedWormCount;
    wormResources = wormResources;
    updateWormStateAndWriteLineVerticesPipeline = updateWormStateAndWriteLineVerticesPipeline;
    initializeWormStateRangePipeline = initializeWormStateRangePipeline;
    updateAppleStateAndWriteAppleShapeVerticesPipeline = updateAppleStateAndWriteAppleShapeVerticesPipeline;
    placeQueuedApplesPipeline = placeQueuedApplesPipeline;
    drawBufferedLineVerticesPipeline = drawBufferedLineVerticesPipeline;
    fadeTrailImagePipeline = fadeTrailImagePipeline;
    drawApplePreviewRingsPipeline = drawApplePreviewRingsPipeline;
    computeBindGroup = computeBindGroup;
    initBindGroup = initBindGroup;
    appleBindGroup = appleBindGroup;
    applePlacementBindGroup = applePlacementBindGroup;
    lineBindGroup = lineBindGroup;
    fadeBindGroup = fadeBindGroup;
    previewBindGroup = previewBindGroup;
    vertexBuffer = wormResources.vertexBuffer;
    positionBuffer = wormResources.positionBuffer;
    motionABuffer = wormResources.motionABuffer;
    motionBBuffer = wormResources.motionBBuffer;
    motionCBuffer = wormResources.motionCBuffer;
    randomBuffer = wormResources.randomBuffer;
    appleBuffer = appleBuffer;
    appleEaterBuffer = appleEaterBuffer;
    appleFreeSlotBuffer = appleFreeSlotBuffer;
    appleFreeCountBuffer = appleFreeCountBuffer;
    applePlacementBuffer = applePlacementBuffer;
    appleReadbackBuffer = appleReadbackBuffer;
    appleEaterClearData = appleEaterClearData;
    appleFreeSlotData = appleFreeSlotData;
    appleFreeCountData = appleFreeCountData;
    appleVertexBuffer = appleVertexBuffer;
    applePreviewBuffer = applePreviewBuffer;
    appleData = appleData;
    appleMarkerData = appleMarkerData;
    applePlacementData = applePlacementData;
    applePreviewData = applePreviewData;
    appleSlotCount = MAX_APPLES;
    applePlacementCount = 0;
    applePreviewVisible = false;
    appleSnapshotPending = false;
    appleSnapshotHandler: ((snapshot: Float32Array) => void) | null = null;
    paramsBuffer = paramsBuffer;
    resolutionBuffer = resolutionBuffer;
    fadeBuffer = fadeBuffer;
    copyTrailImageToCanvasPipeline = presenter.pipeline;
    presentSampler = presenter.sampler;
    presentBindGroup!: GPUBindGroup;
    trailTexture: GPUTexture | null = null;
    trailView!: GPUTextureView;

    resize(nextWidth: number, nextHeight: number, nextRenderWidth: number, nextRenderHeight: number) {
      this.width = nextWidth;
      this.height = nextHeight;
      this.renderWidth = nextRenderWidth;
      this.renderHeight = nextRenderHeight;
      this.canvas.width = nextRenderWidth;
      this.canvas.height = nextRenderHeight;
      this.context.configure({
        device: this.device,
        format: this.format,
        alphaMode: "opaque"
      });
      this.device.queue.writeBuffer(this.resolutionBuffer, 0, new Float32Array([nextWidth, nextHeight]));
      this.createTrailTexture();
      this.clear();
    }

    setWormCount(nextWormCount: number) {
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

      this.initWormRange(previousWormCount, nextWormCount);
      return true;
    }

    growWormCapacity(nextWormCount: number) {
      const previousResources = this.wormResources;
      const nextCapacity = getWormCapacity(nextWormCount, this.maxSupportedWormCount);
      const nextResources = createWormResources(this.device, nextCapacity);
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
      this.computeBindGroup = createComputeBindGroup(this.device, this.updateWormStateAndWriteLineVerticesPipeline, nextResources, this.paramsBuffer, this.appleBuffer, this.appleEaterBuffer);
      this.initBindGroup = createInitBindGroup(this.device, this.initializeWormStateRangePipeline, nextResources, this.paramsBuffer);

      previousResources.positionBuffer.destroy();
      previousResources.motionABuffer.destroy();
      previousResources.motionBBuffer.destroy();
      previousResources.motionCBuffer.destroy();
      previousResources.randomBuffer.destroy();
      previousResources.vertexBuffer.destroy();
    }

    initWormRange(startIndex: number, endIndex: number) {
      if (startIndex >= endIndex) {
        return;
      }

      this.device.queue.writeBuffer(this.paramsBuffer, 0, new Float32Array([
        this.width,
        this.height,
        this.wormCount,
        this.appleSlotCount,
        0,
        0,
        APPLE_MIN_ACTIVE_RADIUS,
        APPLE_MAX_RADIUS,
        WORM_APPLE_TURN_MS,
        WORM_CHANGE_DIRECTION_MS,
        WORM_MAX_RANDOM_ANGLE_CHANGE,
        0,
        startIndex,
        endIndex,
        0,
        0
      ]));
      const encoder = this.device.createCommandEncoder();
      runComputePass(encoder, this.initializeWormStateRangePipeline, this.initBindGroup, Math.ceil((endIndex - startIndex) / 256));
      this.device.queue.submit([encoder.finish()]);
    }

    clear() {
      const encoder = this.device.createCommandEncoder();
      const pass = beginRenderPass(encoder, this.trailView, "clear");
      pass.end();
      this.presentTrail(encoder);
      this.device.queue.submit([encoder.finish()]);
    }

    drawFrame(elapsedMs: number, fadeAmount: number | null, appleBitePercentPerSecond: number) {
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
        WORM_APPLE_TURN_MS,
        WORM_CHANGE_DIRECTION_MS,
        WORM_MAX_RANDOM_ANGLE_CHANGE,
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
        const fadePass = beginRenderPass(encoder, this.trailView);
        fadePass.setPipeline(this.fadeTrailImagePipeline);
        fadePass.setBindGroup(0, this.fadeBindGroup);
        fadePass.draw(6);
        fadePass.end();
      }

      runComputePass(encoder, this.updateWormStateAndWriteLineVerticesPipeline, this.computeBindGroup, Math.ceil(this.wormCount / 256));
      runComputePass(encoder, this.updateAppleStateAndWriteAppleShapeVerticesPipeline, this.appleBindGroup, Math.ceil(this.appleSlotCount / 64));

      if (applePlacementCount > 0) {
        runComputePass(encoder, this.placeQueuedApplesPipeline, this.applePlacementBindGroup, 1);
      }

      const linePass = beginRenderPass(encoder, this.trailView);
      linePass.setPipeline(this.drawBufferedLineVerticesPipeline);
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
    }

    queueApplePlacement(x: number, y: number) {
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
    }

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
    }

    requestAppleSnapshot(handler: (snapshot: Float32Array) => void) {
      if (this.appleSnapshotPending) {
        return;
      }
      this.appleSnapshotHandler = handler;
    }

    createTrailTexture() {
      if (this.trailTexture !== null) {
        this.trailTexture.destroy();
      }
      this.trailTexture = this.device.createTexture({
        size: [this.renderWidth, this.renderHeight],
        format: this.format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
      });
      this.trailView = this.trailTexture.createView();
      this.presentBindGroup = this.device.createBindGroup({
        layout: this.copyTrailImageToCanvasPipeline.getBindGroupLayout(0),
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
    }

    presentTrail(encoder: GPUCommandEncoder, targetView?: GPUTextureView) {
      const view = targetView ?? this.context.getCurrentTexture().createView();
      const pass = beginRenderPass(encoder, view, "clear");
      pass.setPipeline(this.copyTrailImageToCanvasPipeline);
      pass.setBindGroup(0, this.presentBindGroup);
      pass.draw(6);
      pass.end();
    }

    drawAppleOverlay(encoder: GPUCommandEncoder, targetView: GPUTextureView) {
      const pass = beginRenderPass(encoder, targetView);
      pass.setPipeline(this.drawBufferedLineVerticesPipeline);
      pass.setBindGroup(0, this.lineBindGroup);
      pass.setVertexBuffer(0, this.appleVertexBuffer);
      pass.draw(this.appleSlotCount * VERTICES_PER_APPLE_MARKER);
      pass.end();
    }

    setApplePreview(x: number, y: number, visible: boolean) {
      this.applePreviewVisible = visible;
      this.applePreviewData.set([x, y, visible ? 1 : 0, 0]);
      this.device.queue.writeBuffer(this.applePreviewBuffer, 0, this.applePreviewData);
    }

    drawApplePreview(encoder: GPUCommandEncoder, targetView: GPUTextureView) {
      if (!this.applePreviewVisible) {
        return;
      }

      const pass = beginRenderPass(encoder, targetView);
      pass.setPipeline(this.drawApplePreviewRingsPipeline);
      pass.setBindGroup(0, this.previewBindGroup);
      pass.draw(VERTICES_PER_PREVIEW_MARKER);
      pass.end();
    }

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
    }

    finish() {
      return this.device.queue.onSubmittedWorkDone();
    }
  }();

  renderer.resize(width, height, renderWidth, renderHeight);
  renderer.initWormRange(0, wormCount);
  return renderer;
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

function createStorageBuffer(device: GPUDevice, data: BufferSource) {
  const buffer = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
  });
  device.queue.writeBuffer(buffer, 0, data);
  return buffer;
}

function createUniformBuffer(device: GPUDevice, size: number) {
  return device.createBuffer({
    size,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });
}

function bufferBinding(binding: number, buffer: GPUBuffer): GPUBindGroupEntry {
  return { binding, resource: { buffer } };
}

function createComputePipeline(device: GPUDevice, shader: GPUShaderModule, entryPoint: string) {
  return device.createComputePipeline({
    layout: "auto",
    compute: {
      module: shader,
      entryPoint
    }
  });
}

function runComputePass(encoder: GPUCommandEncoder, pipeline: GPUComputePipeline, bindGroup: GPUBindGroup, workgroupCount: number) {
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(workgroupCount);
  pass.end();
}

function beginRenderPass(encoder: GPUCommandEncoder, view: GPUTextureView, loadOp: GPULoadOp = "load") {
  const attachment: GPURenderPassColorAttachment = {
    view,
    loadOp,
    storeOp: "store"
  };
  if (loadOp === "clear") {
    attachment.clearValue = { r: 0, g: 0, b: 0, a: 1 };
  }
  return encoder.beginRenderPass({
    colorAttachments: [attachment]
  });
}

function createLinePipeline(
  device: GPUDevice,
  format: GPUTextureFormat,
  shader: GPUShaderModule,
  vertexEntryPoint: string,
  buffers: GPUVertexBufferLayout[] = []
) {
  return device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: shader,
      entryPoint: vertexEntryPoint,
      buffers
    },
    fragment: {
      module: shader,
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
}

function createWormResources(device: GPUDevice, capacityWormCount: number) {
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

function createEmptyStorageBuffer(device: GPUDevice, size: number) {
  return device.createBuffer({
    size,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
  });
}

function createInitBindGroup(
  device: GPUDevice,
  initializeWormStateRangePipeline: GPUComputePipeline,
  wormResources: ReturnType<typeof createWormResources>,
  paramsBuffer: GPUBuffer
) {
  return device.createBindGroup({
    layout: initializeWormStateRangePipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: wormResources.positionBuffer } },
      { binding: 1, resource: { buffer: wormResources.motionABuffer } },
      { binding: 2, resource: { buffer: wormResources.motionBBuffer } },
      { binding: 3, resource: { buffer: wormResources.motionCBuffer } },
      { binding: 4, resource: { buffer: wormResources.randomBuffer } },
      { binding: 6, resource: { buffer: paramsBuffer } }
    ]
  });
}

function createComputeBindGroup(
  device: GPUDevice,
  updateWormStateAndWriteLineVerticesPipeline: GPUComputePipeline,
  wormResources: ReturnType<typeof createWormResources>,
  paramsBuffer: GPUBuffer,
  appleBuffer: GPUBuffer,
  appleEaterBuffer: GPUBuffer
) {
  return device.createBindGroup({
    layout: updateWormStateAndWriteLineVerticesPipeline.getBindGroupLayout(0),
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

function copyWormBufferRange(encoder: GPUCommandEncoder, sourceBuffer: GPUBuffer, destinationBuffer: GPUBuffer, byteLength: number) {
  if (byteLength > 0) {
    encoder.copyBufferToBuffer(sourceBuffer, 0, destinationBuffer, 0, byteLength);
  }
}

function getMaxSupportedWormCount(gpuLimitsSource: { limits: GPUSupportedLimits }, computeVertexStride = 32) {
  const lineBytesPerWorm = VERTICES_PER_WORM * computeVertexStride;
  const storageLimit = gpuLimitsSource.limits.maxStorageBufferBindingSize;
  const bufferLimit = gpuLimitsSource.limits.maxBufferSize;
  return Math.max(1, Math.floor(Math.min(storageLimit, bufferLimit) / lineBytesPerWorm));
}

function getWormCapacity(wormCount: number, maxSupportedWormCount: number) {
  return Math.min(
    maxSupportedWormCount,
    Math.ceil(wormCount / WORM_CAPACITY_BUCKET_SIZE) * WORM_CAPACITY_BUCKET_SIZE
  );
}

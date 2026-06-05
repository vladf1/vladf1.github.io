export const DEFAULT_WORM_COUNT = 2500;
export const MAX_SAFE_WORM_COUNT = 2000000;
export const MAX_APPLES = 128;
export const APPLE_BITE_PERCENT_PER_SECOND = 0.00016;
export const DEFAULT_FADE_AMOUNT = 0.1;
export const FADE_AMOUNT_PER_MS_SCALE = 0.06;

const WORM_APPLE_TURN_MS = 83.33333333333333;
const WORM_CHANGE_DIRECTION_MS = 166.66666666666666;
const WORM_MAX_RANDOM_ANGLE_CHANGE = 1.5;
const APPLE_MAX_RADIUS = 62;
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
let webgpuContextPromise = null;
const shaderTextPromises = new Map();

function loadShaders(shaders) {
  return Promise.all(shaders.map(loadShaderText));
}

function loadShaderText(fileName) {
  let shaderPromise = shaderTextPromises.get(fileName);
  if (shaderPromise === undefined) {
    shaderPromise = fetch(new URL(`./shaders/${fileName}`, import.meta.url)).then((response) => {
      if (!response.ok) {
        throw new Error(`Unable to load shader: ${fileName}`);
      }
      return response.text();
    });
    shaderTextPromises.set(fileName, shaderPromise);
  }
  return shaderPromise;
}

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

export async function createWebgpuComputeRenderer(canvas, width, height, wormCount) {
  const { device } = await getWebgpuContext();
  const context = canvas.getContext("webgpu");
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
  const initPipeline = device.createComputePipeline({
    layout: "auto",
    compute: {
      module: computeShader,
      entryPoint: "initMain"
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
  const linePipeline = createLinePipeline(device, format, lineShader, "vertexMain", [{
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
  const previewPipeline = createLinePipeline(device, format, lineShader, "previewVertexMain");
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
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
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
  const initBindGroup = createInitBindGroup(device, initPipeline, wormResources, paramsBuffer);
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
  const previewBindGroup = device.createBindGroup({
    layout: previewPipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: { buffer: resolutionBuffer }
      },
      {
        binding: 1,
        resource: { buffer: applePreviewBuffer }
      }
    ]
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
    maxSupportedWormCount,
    wormResources,
    computePipeline,
    initPipeline,
    applePipeline,
    applePlacementPipeline,
    linePipeline,
    fadePipeline,
    previewPipeline,
    computeBindGroup,
    initBindGroup,
    appleBindGroup,
    applePlacementBindGroup,
    lineBindGroup,
    fadeBindGroup,
    previewBindGroup,
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
    appleData,
    appleMarkerData,
    applePlacementData,
    applePreviewData,
    appleSlotCount: MAX_APPLES,
    applePlacementCount: 0,
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

      this.initWormRange(previousWormCount, nextWormCount);
      return true;
    },
    growWormCapacity(nextWormCount) {
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
      this.computeBindGroup = createComputeBindGroup(this.device, this.computePipeline, nextResources, this.paramsBuffer, this.appleBuffer, this.appleEaterBuffer);
      this.initBindGroup = createInitBindGroup(this.device, this.initPipeline, nextResources, this.paramsBuffer);

      previousResources.positionBuffer.destroy();
      previousResources.motionABuffer.destroy();
      previousResources.motionBBuffer.destroy();
      previousResources.motionCBuffer.destroy();
      previousResources.randomBuffer.destroy();
      previousResources.vertexBuffer.destroy();
    },
    initWormRange(startIndex, endIndex) {
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
      const initPass = encoder.beginComputePass();
      initPass.setPipeline(this.initPipeline);
      initPass.setBindGroup(0, this.initBindGroup);
      initPass.dispatchWorkgroups(Math.ceil((endIndex - startIndex) / 256));
      initPass.end();
      this.device.queue.submit([encoder.finish()]);
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
    drawFrame(elapsedMs, fadeAmount, appleBitePercentPerSecond) {
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
      this.applePreviewVisible = visible;
      this.applePreviewData.set([x, y, visible ? 1 : 0, 0]);
      this.device.queue.writeBuffer(this.applePreviewBuffer, 0, this.applePreviewData);
    },
    drawApplePreview(encoder, targetView) {
      if (!this.applePreviewVisible) {
        return;
      }

      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: targetView,
          loadOp: "load",
          storeOp: "store"
        }]
      });
      pass.setPipeline(this.previewPipeline);
      pass.setBindGroup(0, this.previewBindGroup);
      pass.draw(VERTICES_PER_PREVIEW_MARKER);
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

function createStorageBuffer(device, data) {
  const buffer = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
  });
  device.queue.writeBuffer(buffer, 0, data);
  return buffer;
}

function createLinePipeline(device, format, shader, vertexEntryPoint, buffers = []) {
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

function createEmptyStorageBuffer(device, size) {
  return device.createBuffer({
    size,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
  });
}

function createInitBindGroup(device, initPipeline, wormResources, paramsBuffer) {
  return device.createBindGroup({
    layout: initPipeline.getBindGroupLayout(0),
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

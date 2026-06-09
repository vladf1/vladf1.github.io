import computeShaderSource from "./shaders/webgpu-compute.wgsl?raw";
import appleShaderSource from "./shaders/webgpu-apple.wgsl?raw";
import lineShaderSource from "./shaders/webgpu-line.wgsl?raw";
import wormShaderSource from "./shaders/webgpu-worm.wgsl?raw";

export const DEFAULT_WORM_COUNT = 2500;
export const MAX_SAFE_WORM_COUNT = 2000000;
export const MAX_APPLES = 128;
export const MAX_REPELLENTS = 32;
export const APPLE_BITE_PERCENT_PER_SECOND = 0.00016;
export const MIN_CRAZINESS = 0;
export const DEFAULT_CRAZINESS = 1;
export const MAX_CRAZINESS = 3;
export const MIN_SPEED = 0.1;
export const DEFAULT_SPEED = 1;
export const MAX_SPEED = 3;
export const MIN_TAIL_SEGMENTS = 2;
export const DEFAULT_TAIL_SEGMENTS = 10;
export const MAX_TAIL_SEGMENTS = 32;

const WORM_APPLE_TURN_MS = 83.33333333333333;
const WORM_CHANGE_DIRECTION_MS = 166.66666666666666;
const WORM_MAX_RANDOM_ANGLE_CHANGE = 1.5;
const WORM_SEGMENT_SPACING = 9;
export const APPLE_MAX_RADIUS = 62;
const REPELLENT_RADIUS = 220;
export const REPELLENT_MARKER_RADIUS = 34;
const APPLE_MIN_ACTIVE_RADIUS = 15;
const FLOATS_PER_APPLE = 4;
const FLOATS_PER_MARKER_VERTEX = 8;
const FLOATS_PER_PREVIEW = 4;
const APPLE_RADIUS_SEGMENTS = 96;
const VERTICES_PER_APPLE_MARKER = 16 + APPLE_RADIUS_SEGMENTS * 2;
const REPELLENT_BURST_RAYS = 8;
const VERTICES_PER_REPELLENT_MARKER = REPELLENT_BURST_RAYS * 2;
const VERTICES_PER_PREVIEW_MARKER = APPLE_RADIUS_SEGMENTS * 4;
const MAX_APPLE_PLACEMENTS_PER_FRAME = 32;
const WORM_CAPACITY_BUCKET_SIZE = 250000;
const FLOATS_PER_WORM_VEC4_BUFFER = 4;
const BYTES_PER_WORM_VEC4_BUFFER = FLOATS_PER_WORM_VEC4_BUFFER * Float32Array.BYTES_PER_ELEMENT;
const BYTES_PER_WORM_COLOR = BYTES_PER_WORM_VEC4_BUFFER;
const FLOATS_PER_WORM_SEGMENT_POSITION = 2;
const BYTES_PER_WORM_SEGMENT_POSITION = FLOATS_PER_WORM_SEGMENT_POSITION * Float32Array.BYTES_PER_ELEMENT;
const BYTES_PER_RANDOM_STATE = Uint32Array.BYTES_PER_ELEMENT;
const RENDER_INFO_FLOATS = 4;
let webgpuContextPromise: Promise<{ adapter: GPUAdapter; device: GPUDevice }> | null = null;

export async function getMaxSupportedWormCountForTailSegments(tailSegmentCount: number) {
  const { device } = await getWebgpuContext();
  return getMaxSupportedWormCountForTailSegmentsFromLimits(device, tailSegmentCount);
}

export function getMaxSupportedWormCountForTailSegmentsFromLimits(
  gpuLimitsSource: { limits: GPUSupportedLimits },
  tailSegmentCount: number
) {
  const segmentNodeCount = getSegmentNodeCount(tailSegmentCount);
  const perWormLargestBufferByteSize = Math.max(
    segmentNodeCount * BYTES_PER_WORM_SEGMENT_POSITION,
    BYTES_PER_WORM_VEC4_BUFFER,
    BYTES_PER_WORM_COLOR,
    BYTES_PER_RANDOM_STATE
  );
  const storageLimit = gpuLimitsSource.limits.maxStorageBufferBindingSize;
  const bufferLimit = gpuLimitsSource.limits.maxBufferSize;
  return Math.max(1, Math.floor(Math.min(storageLimit, bufferLimit) / perWormLargestBufferByteSize));
}

export async function createWebgpuComputeRenderer(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  renderWidth: number,
  renderHeight: number,
  wormCount: number,
  tailSegmentCount: number
) {
  const { device } = await getWebgpuContext();
  const context = canvas.getContext("webgpu")!;
  const format = navigator.gpu.getPreferredCanvasFormat();
  const normalizedTailSegmentCount = clampTailSegmentCount(tailSegmentCount);
  const segmentNodeCount = getSegmentNodeCount(normalizedTailSegmentCount);
  const maxSupportedWormCount = getMaxSupportedWormCountForTailSegmentsFromLimits(device, normalizedTailSegmentCount);
  if (wormCount > maxSupportedWormCount) {
    throw new Error(`WebGPU limit reached. Try ${maxSupportedWormCount.toLocaleString()} worms or fewer.`);
  }

  const capacityWormCount = getWormCapacity(wormCount, maxSupportedWormCount);
  const wormResources = createWormResources(device, capacityWormCount, segmentNodeCount);
  const appleData = new Float32Array(MAX_APPLES * FLOATS_PER_APPLE);
  const appleMarkerData = new Float32Array(MAX_APPLES * VERTICES_PER_APPLE_MARKER * FLOATS_PER_MARKER_VERTEX);
  const appleEaterClearData = new Uint32Array(MAX_APPLES);
  const appleFreeSlotData = new Uint32Array(MAX_APPLES);
  const appleFreeCountData = new Uint32Array([MAX_APPLES]);
  const applePlacementData = new Float32Array(MAX_APPLE_PLACEMENTS_PER_FRAME * FLOATS_PER_APPLE);
  const applePreviewData = new Float32Array(FLOATS_PER_PREVIEW);
  const repellentMarkerData = new Float32Array(MAX_REPELLENTS * VERTICES_PER_REPELLENT_MARKER * FLOATS_PER_MARKER_VERTEX);

  for (let index = 0; index < MAX_APPLES; index++) {
    appleFreeSlotData[index] = MAX_APPLES - 1 - index;
  }

  const computeShader = device.createShaderModule({ code: computeShaderSource });
  const appleShader = device.createShaderModule({ code: appleShaderSource });
  const lineShader = device.createShaderModule({ code: lineShaderSource });
  const wormShader = device.createShaderModule({ code: wormShaderSource });
  const updateWormStatePipeline = createComputePipeline(device, computeShader, "computeMain");
  const initializeWormStateRangePipeline = createComputePipeline(device, computeShader, "initMain");
  const updateAppleStateAndWriteAppleShapeVerticesPipeline = createComputePipeline(device, appleShader, "computeMain");
  const placeQueuedApplesPipeline = createComputePipeline(device, appleShader, "placementMain");
  const drawWormSegmentsPipeline = createLinePipeline(device, format, wormShader, "vertexMain");
  const drawBufferedLineVerticesPipeline = createLinePipeline(device, format, lineShader, "vertexMain", [{
    arrayStride: 32,
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
  const repellentVertexBuffer = device.createBuffer({
    size: repellentMarkerData.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
  });
  const paramsBuffer = createUniformBuffer(device, 80);
  const renderInfoBuffer = createUniformBuffer(device, RENDER_INFO_FLOATS * Float32Array.BYTES_PER_ELEMENT);
  const computeBindGroup = createComputeBindGroup(device, updateWormStatePipeline, wormResources, paramsBuffer, appleBuffer, appleEaterBuffer);
  const initBindGroup = createInitBindGroup(device, initializeWormStateRangePipeline, wormResources, paramsBuffer);
  const wormBindGroup = device.createBindGroup({
    layout: drawWormSegmentsPipeline.getBindGroupLayout(0),
    entries: [
      bufferBinding(0, wormResources.segmentPositionBuffer),
      bufferBinding(1, wormResources.colorBuffer),
      bufferBinding(2, renderInfoBuffer)
    ]
  });
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
    entries: [bufferBinding(0, renderInfoBuffer)]
  });
  const previewBindGroup = device.createBindGroup({
    layout: drawApplePreviewRingsPipeline.getBindGroupLayout(0),
    entries: [
      bufferBinding(0, renderInfoBuffer),
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
    tailSegmentCount = normalizedTailSegmentCount;
    segmentNodeCount = segmentNodeCount;
    maxSupportedWormCount = maxSupportedWormCount;
    wormResources = wormResources;
    updateWormStatePipeline = updateWormStatePipeline;
    initializeWormStateRangePipeline = initializeWormStateRangePipeline;
    updateAppleStateAndWriteAppleShapeVerticesPipeline = updateAppleStateAndWriteAppleShapeVerticesPipeline;
    placeQueuedApplesPipeline = placeQueuedApplesPipeline;
    drawWormSegmentsPipeline = drawWormSegmentsPipeline;
    drawBufferedLineVerticesPipeline = drawBufferedLineVerticesPipeline;
    drawApplePreviewRingsPipeline = drawApplePreviewRingsPipeline;
    computeBindGroup = computeBindGroup;
    initBindGroup = initBindGroup;
    wormBindGroup = wormBindGroup;
    appleBindGroup = appleBindGroup;
    applePlacementBindGroup = applePlacementBindGroup;
    lineBindGroup = lineBindGroup;
    previewBindGroup = previewBindGroup;
    segmentPositionBuffer = wormResources.segmentPositionBuffer;
    motionABuffer = wormResources.motionABuffer;
    motionBBuffer = wormResources.motionBBuffer;
    motionCBuffer = wormResources.motionCBuffer;
    randomBuffer = wormResources.randomBuffer;
    colorBuffer = wormResources.colorBuffer;
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
    repellentVertexBuffer = repellentVertexBuffer;
    appleData = appleData;
    appleMarkerData = appleMarkerData;
    applePlacementData = applePlacementData;
    applePreviewData = applePreviewData;
    repellentMarkerData = repellentMarkerData;
    appleSlotCount = MAX_APPLES;
    repellentCount = 0;
    applePlacementCount = 0;
    applePreviewVisible = false;
    appleSnapshotPending = false;
    appleSnapshotHandler: ((snapshot: Float32Array) => void) | null = null;
    paramsBuffer = paramsBuffer;
    renderInfoBuffer = renderInfoBuffer;
    paramsData = new Float32Array(20);
    renderInfoData = new Float32Array(RENDER_INFO_FLOATS);

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
      this.writeRenderInfo();
      this.clear();
    }

    writeRenderInfo() {
      this.renderInfoData[0] = this.width;
      this.renderInfoData[1] = this.height;
      this.renderInfoData[2] = this.tailSegmentCount;
      this.renderInfoData[3] = this.segmentNodeCount;
      this.device.queue.writeBuffer(this.renderInfoBuffer, 0, this.renderInfoData);
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
      const nextResources = createWormResources(this.device, nextCapacity, this.segmentNodeCount);
      const encoder = this.device.createCommandEncoder();
      copyWormBufferRange(
        encoder,
        previousResources.segmentPositionBuffer,
        nextResources.segmentPositionBuffer,
        this.wormCount * this.segmentNodeCount * BYTES_PER_WORM_SEGMENT_POSITION
      );
      copyWormBufferRange(
        encoder,
        previousResources.motionABuffer,
        nextResources.motionABuffer,
        this.wormCount * BYTES_PER_WORM_VEC4_BUFFER
      );
      copyWormBufferRange(
        encoder,
        previousResources.motionBBuffer,
        nextResources.motionBBuffer,
        this.wormCount * BYTES_PER_WORM_VEC4_BUFFER
      );
      copyWormBufferRange(
        encoder,
        previousResources.motionCBuffer,
        nextResources.motionCBuffer,
        this.wormCount * BYTES_PER_WORM_VEC4_BUFFER
      );
      copyWormBufferRange(
        encoder,
        previousResources.randomBuffer,
        nextResources.randomBuffer,
        this.wormCount * BYTES_PER_RANDOM_STATE
      );
      copyWormBufferRange(
        encoder,
        previousResources.colorBuffer,
        nextResources.colorBuffer,
        this.wormCount * BYTES_PER_WORM_COLOR
      );
      this.device.queue.submit([encoder.finish()]);

      this.wormResources = nextResources;
      this.capacityWormCount = nextCapacity;
      this.segmentPositionBuffer = nextResources.segmentPositionBuffer;
      this.motionABuffer = nextResources.motionABuffer;
      this.motionBBuffer = nextResources.motionBBuffer;
      this.motionCBuffer = nextResources.motionCBuffer;
      this.randomBuffer = nextResources.randomBuffer;
      this.colorBuffer = nextResources.colorBuffer;
      this.computeBindGroup = createComputeBindGroup(
        this.device,
        this.updateWormStatePipeline,
        nextResources,
        this.paramsBuffer,
        this.appleBuffer,
        this.appleEaterBuffer
      );
      this.initBindGroup = createInitBindGroup(
        this.device,
        this.initializeWormStateRangePipeline,
        nextResources,
        this.paramsBuffer
      );
      this.wormBindGroup = this.device.createBindGroup({
        layout: this.drawWormSegmentsPipeline.getBindGroupLayout(0),
        entries: [
          bufferBinding(0, nextResources.segmentPositionBuffer),
          bufferBinding(1, nextResources.colorBuffer),
          bufferBinding(2, this.renderInfoBuffer)
        ]
      });

      previousResources.segmentPositionBuffer.destroy();
      previousResources.motionABuffer.destroy();
      previousResources.motionBBuffer.destroy();
      previousResources.motionCBuffer.destroy();
      previousResources.randomBuffer.destroy();
      previousResources.colorBuffer.destroy();
    }

    initWormRange(startIndex: number, endIndex: number) {
      if (startIndex >= endIndex) {
        return;
      }

      this.paramsData.set([
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
        this.segmentNodeCount,
        WORM_SEGMENT_SPACING,
        0,
        0,
        0,
        REPELLENT_RADIUS
      ]);
      this.device.queue.writeBuffer(this.paramsBuffer, 0, this.paramsData);
      const encoder = this.device.createCommandEncoder();
      runComputePass(
        encoder,
        this.initializeWormStateRangePipeline,
        this.initBindGroup,
        Math.ceil((endIndex - startIndex) / 256)
      );
      this.device.queue.submit([encoder.finish()]);
    }

    clear() {
      const encoder = this.device.createCommandEncoder();
      const pass = beginRenderPass(encoder, this.context.getCurrentTexture().createView(), "clear");
      pass.end();
      this.device.queue.submit([encoder.finish()]);
    }

    drawFrame(
      elapsedMs: number,
      appleBitePercentPerSecond: number,
      craziness: number,
      speed: number,
      hasActiveApples: boolean,
      cursorRepellentX: number,
      cursorRepellentY: number,
      cursorRepellentActive: number
    ) {
      const applePlacementCount = this.applePlacementCount;
      if (applePlacementCount > 0) {
        this.device.queue.writeBuffer(
          this.applePlacementBuffer,
          0,
          this.applePlacementData.subarray(0, applePlacementCount * FLOATS_PER_APPLE)
        );
      }

      const hasAppleWork = hasActiveApples || applePlacementCount > 0;
      const activeAppleSlotCount = hasAppleWork ? this.appleSlotCount : 0;
      this.paramsData[0] = this.width;
      this.paramsData[1] = this.height;
      this.paramsData[2] = this.wormCount;
      this.paramsData[3] = activeAppleSlotCount;
      this.paramsData[4] = elapsedMs;
      this.paramsData[5] = appleBitePercentPerSecond;
      this.paramsData[6] = APPLE_MIN_ACTIVE_RADIUS;
      this.paramsData[7] = APPLE_MAX_RADIUS;
      this.paramsData[8] = WORM_APPLE_TURN_MS;
      this.paramsData[9] = WORM_CHANGE_DIRECTION_MS;
      this.paramsData[10] = WORM_MAX_RANDOM_ANGLE_CHANGE;
      this.paramsData[11] = craziness;
      this.paramsData[12] = applePlacementCount;
      this.paramsData[13] = speed;
      this.paramsData[14] = this.segmentNodeCount;
      this.paramsData[15] = WORM_SEGMENT_SPACING;
      this.paramsData[16] = cursorRepellentX;
      this.paramsData[17] = cursorRepellentY;
      this.paramsData[18] = cursorRepellentActive;
      this.paramsData[19] = REPELLENT_RADIUS;
      this.device.queue.writeBuffer(this.paramsBuffer, 0, this.paramsData);

      const encoder = this.device.createCommandEncoder();
      runComputePass(encoder, this.updateWormStatePipeline, this.computeBindGroup, Math.ceil(this.wormCount / 256));
      if (hasAppleWork) {
        runComputePass(
          encoder,
          this.updateAppleStateAndWriteAppleShapeVerticesPipeline,
          this.appleBindGroup,
          Math.ceil(this.appleSlotCount / 64)
        );
      }

      if (applePlacementCount > 0) {
        runComputePass(encoder, this.placeQueuedApplesPipeline, this.applePlacementBindGroup, 1);
      }

      const shouldReadApples = this.appleSnapshotHandler !== null && !this.appleSnapshotPending;
      if (shouldReadApples) {
        encoder.copyBufferToBuffer(this.appleBuffer, 0, this.appleReadbackBuffer, 0, this.appleData.byteLength);
      }

      const targetView = this.context.getCurrentTexture().createView();
      const wormPass = beginRenderPass(encoder, targetView, "clear");
      wormPass.setPipeline(this.drawWormSegmentsPipeline);
      wormPass.setBindGroup(0, this.wormBindGroup);
      wormPass.draw(this.tailSegmentCount * 2, this.wormCount);
      wormPass.end();

      if (hasAppleWork) {
        this.drawAppleOverlay(encoder, targetView);
      }
      this.drawRepellentOverlay(encoder, targetView);
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

    setRepellents(repellents: Array<{ x: number; y: number }>) {
      this.repellentMarkerData.fill(0);
      this.repellentCount = Math.min(repellents.length, MAX_REPELLENTS);
      for (let index = 0; index < this.repellentCount; index++) {
        const repellent = repellents[index]!;
        writeRepellentMarkerVertices(
          this.repellentMarkerData,
          index * VERTICES_PER_REPELLENT_MARKER * FLOATS_PER_MARKER_VERTEX,
          repellent.x,
          repellent.y
        );
      }
      this.device.queue.writeBuffer(this.repellentVertexBuffer, 0, this.repellentMarkerData);
    }

    requestAppleSnapshot(handler: (snapshot: Float32Array) => void) {
      if (this.appleSnapshotPending) {
        return;
      }
      this.appleSnapshotHandler = handler;
    }

    drawAppleOverlay(encoder: GPUCommandEncoder, targetView: GPUTextureView) {
      const pass = beginRenderPass(encoder, targetView);
      pass.setPipeline(this.drawBufferedLineVerticesPipeline);
      pass.setBindGroup(0, this.lineBindGroup);
      pass.setVertexBuffer(0, this.appleVertexBuffer);
      pass.draw(this.appleSlotCount * VERTICES_PER_APPLE_MARKER);
      pass.end();
    }

    drawRepellentOverlay(encoder: GPUCommandEncoder, targetView: GPUTextureView) {
      if (this.repellentCount === 0) {
        return;
      }

      const pass = beginRenderPass(encoder, targetView);
      pass.setPipeline(this.drawBufferedLineVerticesPipeline);
      pass.setBindGroup(0, this.lineBindGroup);
      pass.setVertexBuffer(0, this.repellentVertexBuffer);
      pass.draw(this.repellentCount * VERTICES_PER_REPELLENT_MARKER);
      pass.end();
    }

    setApplePreview(x: number, y: number, visible: boolean, repellent = false) {
      this.applePreviewVisible = visible;
      this.applePreviewData.set([x, y, visible ? 1 : 0, repellent ? 1 : 0]);
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

  webgpuContextPromise = navigator.gpu.requestAdapter().then(async adapter => {
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

function clampTailSegmentCount(tailSegmentCount: number) {
  return Math.round(Math.min(MAX_TAIL_SEGMENTS, Math.max(MIN_TAIL_SEGMENTS, tailSegmentCount)));
}

function getSegmentNodeCount(tailSegmentCount: number) {
  return clampTailSegmentCount(tailSegmentCount) + 1;
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

function writeRepellentMarkerVertices(data: Float32Array, baseOffset: number, centerX: number, centerY: number) {
  let vertexOffset = baseOffset;
  for (let rayIndex = 0; rayIndex < REPELLENT_BURST_RAYS; rayIndex++) {
    const angle = rayIndex / REPELLENT_BURST_RAYS * Math.PI * 2;
    vertexOffset = writeMarkerVertex(data, vertexOffset, centerX, centerY, 0.72, 0.96, 1, 0.78);
    vertexOffset = writeMarkerVertex(
      data,
      vertexOffset,
      centerX + Math.cos(angle) * REPELLENT_MARKER_RADIUS,
      centerY + Math.sin(angle) * REPELLENT_MARKER_RADIUS,
      0.72,
      0.96,
      1,
      0.78
    );
  }
}

function writeMarkerVertex(
  data: Float32Array,
  offset: number,
  x: number,
  y: number,
  red: number,
  green: number,
  blue: number,
  alpha: number
) {
  data[offset] = x;
  data[offset + 1] = y;
  data[offset + 4] = red;
  data[offset + 5] = green;
  data[offset + 6] = blue;
  data[offset + 7] = alpha;
  return offset + FLOATS_PER_MARKER_VERTEX;
}

function createWormResources(device: GPUDevice, capacityWormCount: number, segmentNodeCount: number) {
  return {
    segmentPositionBuffer: createEmptyStorageBuffer(device, capacityWormCount * segmentNodeCount * BYTES_PER_WORM_SEGMENT_POSITION),
    motionABuffer: createEmptyStorageBuffer(device, capacityWormCount * BYTES_PER_WORM_VEC4_BUFFER),
    motionBBuffer: createEmptyStorageBuffer(device, capacityWormCount * BYTES_PER_WORM_VEC4_BUFFER),
    motionCBuffer: createEmptyStorageBuffer(device, capacityWormCount * BYTES_PER_WORM_VEC4_BUFFER),
    randomBuffer: createEmptyStorageBuffer(device, capacityWormCount * BYTES_PER_RANDOM_STATE),
    colorBuffer: createEmptyStorageBuffer(device, capacityWormCount * BYTES_PER_WORM_COLOR)
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
      { binding: 0, resource: { buffer: wormResources.segmentPositionBuffer } },
      { binding: 1, resource: { buffer: wormResources.motionABuffer } },
      { binding: 2, resource: { buffer: wormResources.motionBBuffer } },
      { binding: 3, resource: { buffer: wormResources.motionCBuffer } },
      { binding: 4, resource: { buffer: wormResources.randomBuffer } },
      { binding: 5, resource: { buffer: wormResources.colorBuffer } },
      { binding: 6, resource: { buffer: paramsBuffer } }
    ]
  });
}

function createComputeBindGroup(
  device: GPUDevice,
  updateWormStatePipeline: GPUComputePipeline,
  wormResources: ReturnType<typeof createWormResources>,
  paramsBuffer: GPUBuffer,
  appleBuffer: GPUBuffer,
  appleEaterBuffer: GPUBuffer
) {
  return device.createBindGroup({
    layout: updateWormStatePipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: wormResources.segmentPositionBuffer } },
      { binding: 1, resource: { buffer: wormResources.motionABuffer } },
      { binding: 2, resource: { buffer: wormResources.motionBBuffer } },
      { binding: 3, resource: { buffer: wormResources.motionCBuffer } },
      { binding: 4, resource: { buffer: wormResources.randomBuffer } },
      { binding: 5, resource: { buffer: wormResources.colorBuffer } },
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

function getWormCapacity(wormCount: number, maxSupportedWormCount: number) {
  return Math.min(
    maxSupportedWormCount,
    Math.ceil(wormCount / WORM_CAPACITY_BUCKET_SIZE) * WORM_CAPACITY_BUCKET_SIZE
  );
}

import { Sprite, VERTICES_PER_LINE, loadShaders, setSpriteInteractionDistances } from "./swarm-common.js";

function createWebgpuTrailTexture(device, format, width, height) {
  const texture = device.createTexture({
    size: [width, height],
    format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
  });
  return {
    texture,
    view: texture.createView()
  };
}

export async function createWebgpuComputeRenderer(
  canvas,
  width,
  height,
  renderWidth = width,
  renderHeight = height,
  sprites,
  motionState
) {
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
    renderWidth: 0,
    renderHeight: 0,
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
    trailTexture: null,
    trailView: null,
    resize(nextWidth, nextHeight, nextRenderWidth = nextWidth, nextRenderHeight = nextHeight) {
      this.width = nextWidth;
      this.height = nextHeight;
      this.renderWidth = nextRenderWidth;
      this.renderHeight = nextRenderHeight;
      this.canvas.width = nextRenderWidth;
      this.canvas.height = nextRenderHeight;
      this.context.configure({
        device: this.device,
        format: this.format,
        alphaMode: "opaque",
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST
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
    updateSprites() {
    },
    drawSprites() {
    },
    drawFrame(sprites, motionState, repelMode, elapsedMs, fadeAmount) {
      this.updateSprites(sprites, elapsedMs, motionState);
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
      linePass.end();
      this.presentTrail(encoder);
      this.device.queue.submit([encoder.finish()]);
    },
    createTrailTexture() {
      if (this.trailTexture !== null) {
        this.trailTexture.destroy();
      }
      const trail = createWebgpuTrailTexture(this.device, this.format, this.renderWidth, this.renderHeight);
      this.trailTexture = trail.texture;
      this.trailView = trail.view;
    },
    presentTrail(encoder) {
      encoder.copyTextureToTexture(
        { texture: this.trailTexture },
        { texture: this.context.getCurrentTexture() },
        [this.renderWidth, this.renderHeight]
      );
    },
    finish() {
      return this.device.queue.onSubmittedWorkDone();
    }
  };

  setSpriteInteractionDistances(width, height);
  renderer.resize(width, height, renderWidth, renderHeight);
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

async function loadWebgpuShaders() {
  const [compute, line, fade] = await loadShaders([
    "webgpu-compute.wgsl",
    "webgpu-line.wgsl",
    "webgpu-fade.wgsl"
  ]);
  return { compute, line, fade };
}

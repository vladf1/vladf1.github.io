import computeShaderSource from "./shaders/balls-compute.wgsl?raw";
import renderShaderSource from "./shaders/balls-render.wgsl?raw";

const TWO_PI = Math.PI * 2;
const DEFAULT_BALL_COUNT = 35;
const MIN_BALL_COUNT = 1;
const MAX_BALL_COUNT = 500;
const DEFAULT_BALL_SCALE = 1;
const MIN_BALL_SCALE = 0.02;
const MAX_BALL_SCALE = 2;
const FLOATS_PER_BALL = 12;
const BYTES_PER_BALL = FLOATS_PER_BALL * Float32Array.BYTES_PER_ELEMENT;
const RENDER_SEGMENTS = 40;
const VERTICES_PER_BALL = RENDER_SEGMENTS * 3;
const MAX_VELOCITY = 0.5;
const REPELLENT_RADIUS = 900;
const REPELLENT_SPEED = 0.5;

class FrameCounter {
    frames = 0;

    constructor(private readonly callback: (frames: number) => void) {
        setInterval(() => this.tick(), 1000);
    }

    tick() {
        this.callback(this.frames);
        this.frames = 0;
    }

    frameRendered() {
        this.frames++;
    }
}

class WebgpuBallsRenderer {
    private readonly canvas: HTMLCanvasElement;
    private readonly context: GPUCanvasContext;
    private readonly device: GPUDevice;
    private readonly format: GPUTextureFormat;
    private readonly ballBuffers: [GPUBuffer, GPUBuffer];
    private readonly paramsBuffer: GPUBuffer;
    private readonly resolutionBuffer: GPUBuffer;
    private readonly computePipeline: GPUComputePipeline;
    private readonly renderPipeline: GPURenderPipeline;
    private readonly computeBindGroups: [GPUBindGroup, GPUBindGroup];
    private readonly renderBindGroups: [GPUBindGroup, GPUBindGroup];
    private readonly paramsData = new Float32Array(8);
    private readonly resolutionData = new Float32Array(2);
    private sourceBufferIndex = 0;
    ballCount = DEFAULT_BALL_COUNT;
    width = 0;
    height = 0;

    constructor(canvas: HTMLCanvasElement, device: GPUDevice, initialBalls: Float32Array, ballCount: number) {
        this.canvas = canvas;
        this.device = device;
        this.context = canvas.getContext("webgpu")!;
        this.format = navigator.gpu.getPreferredCanvasFormat();
        this.ballCount = ballCount;

        this.ballBuffers = [
            this.createBallBuffer(initialBalls),
            this.createBallBuffer(initialBalls)
        ];
        this.paramsBuffer = this.createUniformBuffer(this.paramsData.byteLength);
        this.resolutionBuffer = this.createUniformBuffer(this.resolutionData.byteLength);

        const computeShader = device.createShaderModule({ code: computeShaderSource });
        const renderShader = device.createShaderModule({ code: renderShaderSource });

        this.computePipeline = device.createComputePipeline({
            layout: "auto",
            compute: {
                module: computeShader,
                entryPoint: "computeMain"
            }
        });

        this.renderPipeline = device.createRenderPipeline({
            layout: "auto",
            vertex: {
                module: renderShader,
                entryPoint: "vertexMain"
            },
            fragment: {
                module: renderShader,
                entryPoint: "fragmentMain",
                targets: [{ format: this.format }]
            },
            primitive: {
                topology: "triangle-list"
            }
        });

        this.computeBindGroups = [
            this.createComputeBindGroup(this.ballBuffers[0], this.ballBuffers[1]),
            this.createComputeBindGroup(this.ballBuffers[1], this.ballBuffers[0])
        ];
        this.renderBindGroups = [
            this.createRenderBindGroup(this.ballBuffers[0]),
            this.createRenderBindGroup(this.ballBuffers[1])
        ];
    }

    resize(width: number, height: number, renderWidth: number, renderHeight: number) {
        this.width = width;
        this.height = height;
        this.canvas.width = renderWidth;
        this.canvas.height = renderHeight;
        this.context.configure({
            device: this.device,
            format: this.format,
            alphaMode: "opaque"
        });
        this.resolutionData.set([this.width, this.height]);
        this.device.queue.writeBuffer(this.resolutionBuffer, 0, this.resolutionData);
    }

    drawFrame(elapsedMs: number, repellent: Repellent | null) {
        this.paramsData.set([
            this.width,
            this.height,
            elapsedMs,
            this.ballCount,
            repellent?.x ?? 0,
            repellent?.y ?? 0,
            REPELLENT_RADIUS,
            repellent === null ? 0 : REPELLENT_SPEED
        ]);
        this.device.queue.writeBuffer(this.paramsBuffer, 0, this.paramsData);

        const encoder = this.device.createCommandEncoder();
        const computePass = encoder.beginComputePass();
        computePass.setPipeline(this.computePipeline);
        computePass.setBindGroup(0, this.computeBindGroups[this.sourceBufferIndex]);
        computePass.dispatchWorkgroups(Math.ceil(this.ballCount / 64));
        computePass.end();

        const destinationBufferIndex = 1 - this.sourceBufferIndex;
        const renderPass = encoder.beginRenderPass({
            colorAttachments: [{
                view: this.context.getCurrentTexture().createView(),
                clearValue: { r: 0, g: 0, b: 0, a: 1 },
                loadOp: "clear",
                storeOp: "store"
            }]
        });
        renderPass.setPipeline(this.renderPipeline);
        renderPass.setBindGroup(0, this.renderBindGroups[destinationBufferIndex]);
        renderPass.draw(this.ballCount * VERTICES_PER_BALL);
        renderPass.end();

        this.device.queue.submit([encoder.finish()]);
        this.sourceBufferIndex = destinationBufferIndex;
    }

    renderCurrentFrame() {
        const encoder = this.device.createCommandEncoder();
        const renderPass = encoder.beginRenderPass({
            colorAttachments: [{
                view: this.context.getCurrentTexture().createView(),
                clearValue: { r: 0, g: 0, b: 0, a: 1 },
                loadOp: "clear",
                storeOp: "store"
            }]
        });
        renderPass.setPipeline(this.renderPipeline);
        renderPass.setBindGroup(0, this.renderBindGroups[this.sourceBufferIndex]);
        renderPass.draw(this.ballCount * VERTICES_PER_BALL);
        renderPass.end();
        this.device.queue.submit([encoder.finish()]);
    }

    resetBalls(nextBalls: Float32Array) {
        this.device.queue.writeBuffer(this.ballBuffers[0], 0, nextBalls);
        this.device.queue.writeBuffer(this.ballBuffers[1], 0, nextBalls);
        this.sourceBufferIndex = 0;
    }

    private createBallBuffer(initialBalls: Float32Array) {
        const buffer = this.device.createBuffer({
            size: MAX_BALL_COUNT * BYTES_PER_BALL,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        this.device.queue.writeBuffer(buffer, 0, initialBalls);
        return buffer;
    }

    private createUniformBuffer(size: number) {
        return this.device.createBuffer({
            size,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
    }

    private createComputeBindGroup(source: GPUBuffer, destination: GPUBuffer) {
        return this.device.createBindGroup({
            layout: this.computePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: source } },
                { binding: 1, resource: { buffer: destination } },
                { binding: 2, resource: { buffer: this.paramsBuffer } }
            ]
        });
    }

    private createRenderBindGroup(ballBuffer: GPUBuffer) {
        return this.device.createBindGroup({
            layout: this.renderPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: ballBuffer } },
                { binding: 1, resource: { buffer: this.resolutionBuffer } }
            ]
        });
    }
}

type Repellent = {
    x: number;
    y: number;
};

class Scene {
    private readonly canvas = document.getElementById("canvas") as HTMLCanvasElement;
    private readonly statusBarElement = document.getElementById("statusBar") as HTMLDivElement;
    private readonly frameCounter = new FrameCounter((frames) => {
        this.statusBarElement.innerHTML = `${frames} frames / sec`;
    });
    private renderer!: WebgpuBallsRenderer;
    private readonly ballCountRange = document.getElementById("ballCountRange") as HTMLInputElement;
    private readonly ballCountInput = document.getElementById("ballCountInput") as HTMLInputElement;
    private readonly ballSizeRange = document.getElementById("ballSizeRange") as HTMLInputElement;
    private readonly ballSizeValue = document.getElementById("ballSizeValue") as HTMLOutputElement;
    private readonly decreaseBallSizeButton = document.getElementById("decreaseBallSize") as HTMLButtonElement;
    private readonly increaseBallSizeButton = document.getElementById("increaseBallSize") as HTMLButtonElement;
    private lastAnimated = 0;
    private repellent: Repellent | null = null;
    private repellentTimeout = 0;
    private paused = false;
    private ballCount = DEFAULT_BALL_COUNT;
    private ballScale = DEFAULT_BALL_SCALE;
    private width = 0;
    private height = 0;

    async start() {
        if (!("gpu" in navigator)) {
            throw new Error("WebGPU unavailable in this browser.");
        }

        const adapter = await navigator.gpu.requestAdapter();
        if (adapter === null) {
            throw new Error("WebGPU adapter unavailable.");
        }

        const device = await adapter.requestDevice();
        this.resize();
        this.syncBallCountControls();
        this.syncBallSizeControls();
        this.renderer = new WebgpuBallsRenderer(this.canvas, device, this.createInitialBalls(), this.ballCount);
        this.renderer.resize(this.width, this.height, this.getRenderWidth(), this.getRenderHeight());

        window.onresize = () => {
            this.resize();
            this.renderer.resize(this.width, this.height, this.getRenderWidth(), this.getRenderHeight());
        };

        this.canvas.addEventListener("pointerdown", (event) => {
            this.repellent = { x: event.clientX, y: event.clientY };
            window.clearTimeout(this.repellentTimeout);
            this.repellentTimeout = window.setTimeout(() => {
                this.repellent = null;
            }, 120);
        });
        window.addEventListener("keydown", (event) => {
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement) {
                return;
            }

            if (event.code !== "Space") {
                return;
            }

            event.preventDefault();
            this.paused = !this.paused;
        });
        this.ballCountRange.addEventListener("input", () => this.setBallCount(this.ballCountRange.value));
        this.ballCountRange.addEventListener("change", () => this.setBallCount(this.ballCountRange.value));
        this.ballCountInput.addEventListener("input", () => this.setBallCount(this.ballCountInput.value));
        this.ballCountInput.addEventListener("change", () => this.syncBallCountControls());
        this.ballSizeRange.addEventListener("input", () => this.setBallScale(this.ballSizeRange.value));
        this.ballSizeRange.addEventListener("change", () => this.setBallScale(this.ballSizeRange.value));
        this.decreaseBallSizeButton.addEventListener("click", () => this.adjustBallScale(-0.1));
        this.increaseBallSizeButton.addEventListener("click", () => this.adjustBallScale(0.1));

        requestAnimationFrame((time) => this.renderScene(time));
    }

    private resize() {
        this.width = document.documentElement.clientWidth;
        this.height = document.documentElement.clientHeight;
    }

    private renderScene(now: number) {
        const millisecondsSinceLastRender = this.lastAnimated !== 0 ? now - this.lastAnimated : 0;
        this.lastAnimated = now;
        if (this.paused) {
            this.renderer.renderCurrentFrame();
            this.frameCounter.frameRendered();
            requestAnimationFrame((time) => this.renderScene(time));
            return;
        }

        this.renderer.drawFrame(millisecondsSinceLastRender, this.repellent);
        this.frameCounter.frameRendered();
        requestAnimationFrame((time) => this.renderScene(time));
    }

    private setBallCount(value: string) {
        const parsed = Number.parseInt(value, 10);
        this.ballCount = clampNumber(
            Number.isFinite(parsed) ? parsed : DEFAULT_BALL_COUNT,
            MIN_BALL_COUNT,
            MAX_BALL_COUNT
        );
        this.renderer.ballCount = this.ballCount;
        this.syncBallCountControls();
    }

    private syncBallCountControls() {
        const value = String(this.ballCount);
        this.ballCountRange.value = value;
        this.ballCountInput.value = value;
    }

    private setBallScale(value: string) {
        const parsed = Number.parseFloat(value);
        this.ballScale = clampNumber(
            Number.isFinite(parsed) ? parsed : DEFAULT_BALL_SCALE,
            MIN_BALL_SCALE,
            MAX_BALL_SCALE
        );
        this.syncBallSizeControls();
        this.resetBalls();
    }

    private adjustBallScale(delta: number) {
        this.ballScale = clampNumber(this.ballScale + delta, MIN_BALL_SCALE, MAX_BALL_SCALE);
        this.syncBallSizeControls();
        this.resetBalls();
    }

    private syncBallSizeControls() {
        this.ballSizeRange.value = String(this.ballScale);
        this.ballSizeValue.value = `${this.ballScale.toFixed(2)}x`;
    }

    private createInitialBalls() {
        const balls = new Float32Array(MAX_BALL_COUNT * FLOATS_PER_BALL);
        for (let index = 0; index < MAX_BALL_COUNT; index++) {
            const radius = randomInRange(15, 45) * this.ballScale;
            const margin = radius + 10;
            const offset = index * FLOATS_PER_BALL;
            const angle = randomInRange(0, TWO_PI);
            balls[offset] = randomInRange(margin, Math.max(margin, this.width - margin));
            balls[offset + 1] = randomInRange(margin, Math.max(margin, this.height - margin));
            balls[offset + 2] = radius;
            balls[offset + 3] = 0;
            balls[offset + 4] = MAX_VELOCITY * Math.cos(angle);
            balls[offset + 5] = MAX_VELOCITY * Math.sin(angle);
            balls[offset + 6] = 0;
            balls[offset + 7] = 0;
            balls[offset + 8] = randomInRange(10, 255) / 255;
            balls[offset + 9] = randomInRange(10, 255) / 255;
            balls[offset + 10] = randomInRange(10, 255) / 255;
            balls[offset + 11] = 1;
        }
        return balls;
    }

    private resetBalls() {
        this.repellent = null;
        this.lastAnimated = 0;
        this.renderer.resetBalls(this.createInitialBalls());
    }

    private getRenderWidth() {
        return Math.max(1, Math.floor(this.width * window.devicePixelRatio));
    }

    private getRenderHeight() {
        return Math.max(1, Math.floor(this.height * window.devicePixelRatio));
    }

}

function randomInRange(minVal: number, maxVal: number) {
    return minVal + Math.random() * (maxVal - minVal);
}

function clampNumber(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

window.onload = () => {
    const scene = new Scene();
    scene.start().catch((error: unknown) => {
        const statusBarElement = document.getElementById("statusBar") as HTMLDivElement;
        statusBarElement.textContent = error instanceof Error ? error.message : String(error);
    });
};

// Run with root Vite running: node tools/swarm-performance.mjs [output.json]
// BASE_URL, BASELINE_REF, ROUNDS and FILTER can override the defaults.
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const baselineRef = process.env.BASELINE_REF || '1de2685b7ce1fc8522f4f1332bffd87af9e1e05d';
const snapshot = await mkdtemp(resolve(root, '.swarm-perf-'));
const baseURL = process.env.BASE_URL || 'http://127.0.0.1:5176';
const output = resolve(process.argv[2] || 'tools/swarm-performance-results.json');
const scenarios = [
  { name: 'Swarm 2 · default', version: 2, count: 2500, width: 800, height: 600, dpr: 1 },
  { name: 'Swarm 2 · Retina', version: 2, count: 2500, width: 1440, height: 900, dpr: 2 },
  { name: 'Swarm 2 · 250k', version: 2, count: 250000, width: 800, height: 600, dpr: 1 },
  { name: 'Swarm 3 · default', version: 3, count: 5000, apples: 0, width: 800, height: 600, dpr: 1 },
  { name: 'Swarm 3 · Retina + overlays', version: 3, count: 5000, apples: 4, overlays: true, width: 1440, height: 900, dpr: 2 },
  { name: 'Swarm 3 · 32 apples', version: 3, count: 10000, apples: 32, width: 800, height: 600, dpr: 1 },
  { name: 'Swarm 3 · 250k + 4 apples', version: 3, count: 250000, apples: 4, width: 800, height: 600, dpr: 1 },
  { name: 'Swarm 3 · 250k triangles', version: 3, count: 250000, apples: 4, triangles: true, width: 800, height: 600, dpr: 1 },
].filter(s => !process.env.FILTER || s.name.includes(process.env.FILTER));
let browser;
const report = { baselineRef, date: new Date().toISOString(), rounds: Number(process.env.ROUNDS || 3), scenarios: [] };
try {
  const files = execFileSync('git', ['ls-tree', '-r', '--name-only', baselineRef, 'rebuilds/swarm-2', 'rebuilds/swarm-3'], { cwd: root, encoding: 'utf8' }).trim().split('\n');
  for (const file of files) {
    const target = resolve(snapshot, file);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, execFileSync('git', ['show', `${baselineRef}:${file}`], { cwd: root }));
  }
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const scenario of scenarios) {
    const entry = { ...scenario, before: [], after: [] };
    for (let round = 0; round < report.rounds; round++) {
      // Alternate order to reduce bias from warm caches and thermal drift.
      for (const variant of round % 2 ? ['after', 'before'] : ['before', 'after']) {
        const page = await browser.newPage({ viewport: { width: scenario.width, height: scenario.height }, deviceScaleFactor: scenario.dpr });
        const errors = [];
        page.on('pageerror', error => errors.push(String(error)));
        await page.route('**/@vite/client', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
        await page.goto(baseURL);
        const prefix = variant === 'before' ? `/${relative(root, snapshot)}` : '';
        const result = await page.evaluate(runScenario, { ...scenario, prefix });
        if (errors.length || result.errors.length) throw new Error(JSON.stringify({ errors, gpuErrors: result.errors }));
        report.environment = result.environment;
        entry[variant].push(result);
        console.log(scenario.name, round + 1, variant, JSON.stringify({ ms: result.medianMsPerFrame, gpu: result.gpuPassMsPerFrame, passes: result.passesPerFrame }));
        await page.close();
      }
    }
    report.scenarios.push(entry);
    await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  }
} finally {
  await browser?.close();
  await rm(snapshot, { recursive: true, force: true });
}

async function runScenario(s) {
  document.body.replaceChildren();
  const canvas = document.createElement('canvas');
  document.body.append(canvas);
  const errors = [];
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter || !adapter.features.has('timestamp-query')) throw new Error('Hardware WebGPU timestamps are required');
  const device = await adapter.requestDevice({ requiredFeatures: ['timestamp-query'] });
  device.addEventListener('uncapturederror', e => errors.push(e.error.message));
  const environment = { userAgent: navigator.userAgent, vendor: adapter.info.vendor, architecture: adapter.info.architecture };
  // Use one timestamp-enabled device without adding profiling overhead to production.
  navigator.gpu.requestAdapter = async () => adapter;
  adapter.requestDevice = async () => device;
  const batchSize = 120;
  const batchCount = 11;
  const warmup = 240;
  const profileBatchSize = 40;
  const querySet = device.createQuerySet({ type: 'timestamp', count: 1024 });
  const resolved = device.createBuffer({ size: 8192, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
  const readback = device.createBuffer({ size: 8192, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  let queries = 0;
  let profiling = false;
  let passTypes = [];
  const createEncoder = device.createCommandEncoder.bind(device);
  device.createCommandEncoder = (...args) => {
    const encoder = createEncoder(...args);
    for (const [method, type] of [['beginRenderPass', 'render'], ['beginComputePass', 'compute']]) {
      const original = encoder[method].bind(encoder);
      encoder[method] = (descriptor = {}) => {
        if (!profiling) return original(descriptor);
        const start = queries;
        queries += 2;
        passTypes.push(type);
        return original({ ...descriptor, timestampWrites: { querySet, beginningOfPassWriteIndex: start, endOfPassWriteIndex: start + 1 } });
      };
    }
    return encoder;
  };
  let renderer, sprites, motion;
  if (s.version === 2) {
    const common = await import(`${s.prefix}/rebuilds/swarm-2/swarm-common.js`);
    const module = await import(`${s.prefix}/rebuilds/swarm-2/swarm-webgpu.js`);
    sprites = common.createSprites(s.count, s.width, s.height, common.createRandom(0x51a7f00d));
    motion = { width: s.width, height: s.height, pointerX: s.width / 2, pointerY: s.height / 2, repelMode: false };
    renderer = await module.createWebgpuComputeRenderer(canvas, s.width, s.height, s.width * s.dpr, s.height * s.dpr, sprites, motion);
  } else {
    const module = await import(`${s.prefix}/rebuilds/swarm-3/swarm-3-webgpu.ts`);
    renderer = await module.createWebgpuComputeRenderer(canvas, s.width, s.height, s.width * s.dpr, s.height * s.dpr, s.count);
    for (let i = 0; i < s.apples; i++) {
      const cols = Math.min(8, s.apples);
      const rows = Math.ceil(s.apples / cols);
      renderer.queueApplePlacement(70 + (i % cols) * (s.width - 140) / Math.max(1, cols - 1), 80 + Math.floor(i / cols) * (s.height - 160) / Math.max(1, rows - 1));
    }
    if (s.triangles) renderer.setRenderMode('triangles');
    if (s.overlays) {
      renderer.setRepellents([{ x: s.width / 2, y: s.height / 2 }]);
      renderer.setApplePreview(s.width * 0.6, s.height * 0.6, true);
    }
  }
  // Fixed simulation step, fade, seeds and apple population in every run.
  // Bite rate is zero here so a measured apple scenario cannot turn into motion-only.
  const draw = s.version === 2
    ? () => renderer.drawFrame(sprites, motion, false, 1000 / 60, 0.9)
    : () => renderer.drawFrame(1000 / 60, 0.9, 0, 1, 1, s.apples > 0, s.width / 2, s.height / 2, s.overlays ? 1 : 0);
  for (let i = 0; i < warmup; i++) draw();
  await renderer.finish();
  const samples = [], gpuSamples = [], cpuSamples = [], passSamples = [];
  for (let batch = 0; batch < batchCount; batch++) {
    // Throughput includes command encoding, uploads, rendering and GPU completion.
    const started = performance.now();
    for (let i = 0; i < batchSize; i++) draw();
    cpuSamples.push((performance.now() - started) / batchSize);
    await renderer.finish();
    samples.push((performance.now() - started) / batchSize);
  }
  // Separate GPU profiling from the uninstrumented throughput samples.
  profiling = true;
  for (let batch = 0; batch < 3; batch++) {
    queries = 0;
    passTypes = [];
    for (let i = 0; i < profileBatchSize; i++) draw();
    const encoder = createEncoder();
    encoder.resolveQuerySet(querySet, 0, queries, resolved, 0);
    encoder.copyBufferToBuffer(resolved, 0, readback, 0, queries * 8);
    device.queue.submit([encoder.finish()]);
    await readback.mapAsync(GPUMapMode.READ);
    const times = new BigUint64Array(readback.getMappedRange());
    const totals = {};
    for (let i = 0; i < queries; i += 2) {
      const key = `${i / 2 % (queries / profileBatchSize / 2)}:${passTypes[i / 2]}`;
      totals[key] = (totals[key] || 0) + Number(times[i + 1] - times[i]) / 1e6 / profileBatchSize;
    }
    gpuSamples.push(totals);
    passSamples.push(queries / profileBatchSize / 2);
    readback.unmap();
  }
  profiling = false;
  await renderer.finish();
  const percentile = (values, q) => [...values].sort((a,b) => a-b)[Math.ceil((values.length - 1) * q)];
  const gpuPassMsPerFrame = Object.fromEntries(Object.keys(gpuSamples[0]).map(key => [key, percentile(gpuSamples.map(x => x[key]), 0.5)]));
  return { environment, errors, batchSize, batchCount, warmup, samples, cpuSamples, medianMsPerFrame: percentile(samples, .5), p95BatchMsPerFrame: percentile(samples, .95), gpuPassMsPerFrame, passesPerFrame: passSamples[0], capacityWormCount: renderer.capacityWormCount, vertexBufferBytes: renderer.vertexBuffer.size };
}

// Deterministic GPU-state, rendered-image and interactive smoke checks.
// Requires root Vite; accepts BASE_URL and BASELINE_REF like swarm-performance.mjs.
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
const baselineRef = process.env.BASELINE_REF || '1de2685b7ce1fc8522f4f1332bffd87af9e1e05d';
const baseURL = process.env.BASE_URL || 'http://127.0.0.1:5176';
const snapshot = await mkdtemp(resolve(root, '.swarm-verify-'));
const output = resolve(process.env.OUTPUT_DIR || '/tmp/swarm-verification');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const files = execFileSync('git', ['ls-tree', '-r', '--name-only', baselineRef, 'rebuilds/swarm-2', 'rebuilds/swarm-3'], { cwd: root, encoding: 'utf8' }).trim().split('\n');
  for (const file of files) {
    const target = resolve(snapshot, file);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, execFileSync('git', ['show', `${baselineRef}:${file}`], { cwd: root }));
  }
  for (const version of [2, 3]) {
    for (const mode of version === 2 ? ['attract', 'repel', 'no-fade'] : ['lines', 'triangles', 'no-fade', 'grow']) {
      const variants = [];
      for (const variant of ['before', 'after']) {
        const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
        await page.route('**/@vite/client', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
        await page.goto(baseURL);
        const result = await page.evaluate(checkRenderer, { version, mode, prefix: variant === 'before' ? `/${relative(root, snapshot)}` : '' });
        assert.deepEqual(result.errors, []);
        variants.push(result);
        await page.screenshot({ path: resolve(output, `swarm-${version}-${mode}-${variant}.png`) });
        await page.close();
      }
      assert.deepEqual(variants[1].state, variants[0].state, `Swarm ${version} ${mode}: GPU simulation changed`);
      assert.deepEqual(
        await readFile(resolve(output, `swarm-${version}-${mode}-after.png`)),
        await readFile(resolve(output, `swarm-${version}-${mode}-before.png`)),
        `Swarm ${version} ${mode}: rendered image changed`
      );
      console.log(`PASS: Swarm ${version} ${mode}: byte-identical GPU state`);
    }
  }
  for (const version of [2, 3]) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.addInitScript(() => {
      window.gpuErrors = [];
      const request = GPUAdapter.prototype.requestDevice;
      GPUAdapter.prototype.requestDevice = async function(...args) {
        const device = await request.apply(this, args);
        device.addEventListener('uncapturederror', e => window.gpuErrors.push(e.error.message));
        return device;
      };
    });
    await page.goto(`${baseURL}/rebuilds/swarm-${version}/`);
    await page.waitForFunction(() => /FPS/.test(document.querySelector('#stats').textContent));
    await page.locator('#pauseButton').click();
    assert.equal(await page.locator('#pauseButton').getAttribute('aria-pressed'), 'true');
    await page.locator('#pauseButton').click();
    if (version === 2) {
      for (const value of ['5000', '1000', '3500']) {
        await page.locator('#spriteCount').fill(value);
        await page.locator('#spriteCount').press('Tab');
        await page.waitForTimeout(150);
      }
      for (const mode of ['cpu', 'webgl', 'webgpu-compute']) {
        await page.locator('#rendererMode').selectOption(mode);
        await page.waitForTimeout(200);
      }
      await page.mouse.move(500, 350);
      await page.mouse.down();
      await page.waitForTimeout(200);
      await page.mouse.up();
    } else {
      await page.mouse.click(220, 260);
      await page.waitForTimeout(200);
      await page.mouse.click(750, 250);
      await page.locator('#repellentPlacementButton').click();
      await page.mouse.click(600, 500);
      await page.waitForTimeout(200);
      await page.locator('#trianglesModeButton').click();
      for (const value of ['9000', '260000', '5000']) {
        await page.locator('#wormCount').fill(value);
        await page.locator('#wormCount').press('Tab');
        await page.waitForTimeout(150);
      }
      await page.locator('#linesModeButton').click();
      await page.locator('#resetApplesButton').click();
      await page.locator('#applePlacementButton').click();
      await page.mouse.click(300, 300);
    }
    await page.setViewportSize({ width: 700, height: 600 });
    await page.waitForTimeout(1000);
    assert.deepEqual(errors, []);
    assert.deepEqual(await page.evaluate(() => window.gpuErrors), []);
    await page.screenshot({ path: resolve(output, `swarm-${version}-interactive.png`) });
    console.log(`PASS: Swarm ${version}: controls, renderer modes, counts, resize; no browser/GPU errors`);
    await page.close();
  }
} finally {
  await browser.close();
  await rm(snapshot, { recursive: true, force: true });
}

async function checkRenderer({ version, mode, prefix }) {
  document.body.innerHTML = '<canvas></canvas>';
  document.body.style.cssText = 'margin:0;background:black;overflow:hidden';
  const canvas = document.querySelector('canvas');
  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter.requestDevice();
  const errors = [];
  device.addEventListener('uncapturederror', e => errors.push(e.error.message));
  navigator.gpu.requestAdapter = async () => adapter;
  adapter.requestDevice = async () => device;
  const storage = [];
  const createBuffer = device.createBuffer.bind(device);
  device.createBuffer = descriptor => {
    const isStorage = descriptor.usage & GPUBufferUsage.STORAGE;
    const buffer = createBuffer({ ...descriptor, usage: descriptor.usage | (isStorage ? GPUBufferUsage.COPY_SRC : 0) });
    if (isStorage) storage.push(buffer);
    return buffer;
  };
  let renderer, draw, buffers;
  const fade = mode === 'no-fade' ? null : 0.9;
  if (version === 2) {
    const common = await import(`${prefix}/rebuilds/swarm-2/swarm-common.js`);
    const module = await import(`${prefix}/rebuilds/swarm-2/swarm-webgpu.js`);
    const sprites = common.createSprites(2500, 800, 600, common.createRandom(0x51a7f00d));
    const motion = { width: 800, height: 600, pointerX: 400, pointerY: 300, repelMode: mode === 'repel' };
    renderer = await module.createWebgpuComputeRenderer(canvas, 800, 600, 800, 600, sprites, motion);
    buffers = storage.slice(0, 6).map(buffer => ({ buffer, size: buffer.size }));
    draw = () => renderer.drawFrame(sprites, motion, motion.repelMode, 1000 / 60, fade);
  } else {
    const module = await import(`${prefix}/rebuilds/swarm-3/swarm-3-webgpu.ts`);
    renderer = await module.createWebgpuComputeRenderer(canvas, 800, 600, 800, 600, 5000);
    renderer.setRenderMode(mode === 'triangles' ? 'triangles' : 'lines');
    for (let i = 0; i < 32; i++) renderer.queueApplePlacement(80 + (i % 8) * 90, 100 + Math.floor(i / 8) * 120);
    renderer.setRepellents([{ x: 400, y: 300 }]);
    renderer.setApplePreview(560, 250, true);
    draw = () => renderer.drawFrame(1000 / 60, fade, 0.00016, 1, 1, true, 400, 300, 1);
    if (mode === 'grow') {
      for (let i = 0; i < 10; i++) draw();
      renderer.setWormCount(9000);
      for (let i = 0; i < 10; i++) draw();
      renderer.setWormCount(260000);
      draw();
      renderer.setWormCount(5000);
    }
    buffers = [renderer.motionABuffer, renderer.motionBBuffer, renderer.motionCBuffer, renderer.randomBuffer].map((buffer, i) => ({ buffer, size: 5000 * (i === 3 ? 4 : 16) }));
    buffers.push({ buffer: renderer.appleBuffer, size: renderer.appleBuffer.size });
  }
  for (let i = 0; i < 120; i++) draw();
  await renderer.finish();
  const state = [];
  for (const { buffer, size } of buffers) {
    const readback = createBuffer({ size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const encoder = device.createCommandEncoder();
    encoder.copyBufferToBuffer(buffer, 0, readback, 0, size);
    device.queue.submit([encoder.finish()]);
    await readback.mapAsync(GPUMapMode.READ);
    const digest = await crypto.subtle.digest('SHA-256', readback.getMappedRange());
    state.push(Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, '0')).join(''));
    readback.unmap();
    readback.destroy();
  }
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  return { state, errors };
}

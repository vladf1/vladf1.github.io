# Swarm 3

Swarm 3 is a WebGPU rebuild of the old swarm canvas experiment. It renders a large flock of colored worms that leave fading trails, respond to planted apples, and scatter away from repellents. The browser/TypeScript layer owns the page, controls, URL state, and animation clock. The WebGPU layer owns the high-volume simulation and drawing work.

The app lives at `rebuilds/swarm-3/` and is part of the root Vite build for the site.

## Running It

Run from the repo root:

```sh
npm run dev:swarm-3
```

That starts Vite and opens:

```text
http://127.0.0.1:5173/rebuilds/swarm-3/
```

Use the root Vite setup for local testing. Do not use `python3 -m http.server` for iterative work here; stale ES module responses can make debugging misleading.

The HTTPS variant is useful when testing WebGPU behavior from another device or tunnel:

```sh
npm run dev:swarm-3:https
```

Validate production integration from the repo root:

```sh
npm run build
```

`vite.config.ts` includes `rebuilds/swarm-3/index.html` as the `swarm3` Rollup input, so this project is built as part of the main site artifact.

## User Controls

- Click, tap, or pointer down on the canvas to place an apple.
- Hold Shift and click to place a repellent.
- Shift while moving the pointer switches the preview from apple mode to repellent mode.
- Click an existing repellent marker while in repellent placement mode to remove it.
- Press Space to pause or resume, unless focus is inside a control.
- Use the bottom controls for worm count, craziness, speed, pause/resume, and reset.

The URL is kept in sync with the main simulation settings:

```text
?NumberOfSprites=2500&Craziness=1&Speed=1
```

These names are intentionally legacy-flavored. Keep them stable unless you are deliberately changing external links or saved configurations.

## File Map

- `index.html`: full-screen canvas, stats overlay, hint text, notice bubble, controls, and inline CSS.
- `swarm-3.ts`: app shell. Owns DOM queries, URL parameters, input handling, animation scheduling, stats text, apple/repellent lists used by the UI, and renderer lifecycle.
- `swarm-3-webgpu.ts`: renderer factory and WebGPU resource owner. Creates the device context, buffers, textures, bind groups, pipelines, per-frame command encoder work, readbacks, and resize handling.
- `shaders/webgpu-compute.wgsl`: worm initialization and per-frame worm simulation. Updates worm state, writes line vertices, applies apple attraction, applies repellent scattering, and counts apple eaters with integer atomics.
- `shaders/webgpu-apple.wgsl`: GPU-side apple maintenance. Applies bite damage from eater counts, updates apple radius/volume, manages the free-slot list, handles queued apple placements, and writes apple marker vertices.
- `shaders/webgpu-line.wgsl`: shared line rendering for worm segments, apple outlines, repellent markers, and previews.
- `shaders/webgpu-fade.wgsl`: translucent black fullscreen pass that fades the trail texture over time.
- `shaders/webgpu-present.wgsl`: fullscreen texture copy from the offscreen trail texture to the current canvas texture.

## Runtime Architecture

`startSwarmApp()` in `swarm-3.ts` is the browser entry point. It reads controls and URL params, sizes the canvas, creates the renderer, installs event handlers, and starts `requestAnimationFrame`.

The frame loop is still owned by JavaScript:

1. `renderFrame(now)` computes elapsed milliseconds.
2. Once per second it updates FPS and asks the renderer for an apple snapshot.
3. It picks an active repellent from the stored repellent list.
4. It calls `renderer.drawFrame(...)` with elapsed time, fade amount, bite rate, craziness, speed, apple presence, and repellent data.
5. It updates stats text only when the displayed value changes.
6. It schedules the next `requestAnimationFrame`.

The large worm state does not round-trip through JavaScript. After initialization, positions, velocities, angle state, random state, and line vertices live in GPU buffers. JavaScript sends small uniform values each frame; the compute shader updates the buffers in place.

Apples are GPU-owned for simulation, with a small JavaScript mirror for UI and placement rules. JavaScript queues apple placements and keeps a local list for overlap checks and stats. The renderer periodically copies the GPU apple buffer to a readback buffer, maps it, and `syncApplesFromGpu()` refreshes the local list.

Repellents are simpler. JavaScript owns the persistent list of repellent centers, uploads marker vertices with `setRepellents(...)`, and sends one active repellent center to the worm compute shader each frame.

## Per-Frame GPU Work

`renderer.drawFrame(...)` in `swarm-3-webgpu.ts` performs the important GPU work in this order:

1. Upload queued apple placement data, if any.
2. Update the shared params uniform buffer.
3. Fade the offscreen trail texture.
4. Run `webgpu-compute.wgsl` to update worm state and write line vertices.
5. Run `webgpu-apple.wgsl` to shrink/remove apples and write apple marker vertices when apples are active or placements are queued.
6. Run the apple placement compute pass when new apples were queued.
7. Draw worm line vertices into the trail texture.
8. Optionally copy the apple buffer into the readback buffer.
9. Present the trail texture to the canvas.
10. Draw apple, repellent, and preview overlays onto the current canvas texture.

The trail effect depends on rendering worm lines into the offscreen trail texture, fading that texture, and then presenting it. Do not collapse this into direct canvas rendering unless you are intentionally replacing the trail model.

## Data Ownership

High-volume GPU-owned state:

- Worm positions and previous positions.
- Worm motion parameters and angle-change state.
- Per-worm random states.
- Worm line vertices.
- Apple storage buffer.
- Apple marker vertices.
- Apple free-slot list and free-count buffer.

JavaScript-owned state:

- URL parameters and form control values.
- Pause/resume state.
- FPS and stats text.
- Local apple summary used for UI, overlap checks, and stats.
- Persistent repellent centers.
- Pointer preview mode and notice/hint state.

Shared per-frame params are packed into one `Float32Array(20)` in `swarm-3-webgpu.ts`. The WGSL `SimParams` layout must stay aligned with that array. If you add or reorder fields, update both TypeScript and all shaders that declare `SimParams`.

## Important Constants

The main public tuning constants are exported from `swarm-3-webgpu.ts`:

- `DEFAULT_WORM_COUNT`: initial worm count.
- `MAX_SAFE_WORM_COUNT`: hard UI cap, still clamped further by adapter limits.
- `MAX_APPLES`: apple storage slots.
- `MAX_REPELLENTS`: persistent repellent marker limit.
- `APPLE_BITE_PERCENT_PER_SECOND`: base per-worm bite rate.
- `DEFAULT_FADE_AMOUNT` and `FADE_AMOUNT_PER_MS_SCALE`: trail fade behavior.
- `MIN_CRAZINESS`, `DEFAULT_CRAZINESS`, `MAX_CRAZINESS`: random turning scale.
- `MIN_SPEED`, `DEFAULT_SPEED`, `MAX_SPEED`: movement speed scale.

Some matching constants are duplicated inside WGSL files because shaders cannot import TypeScript constants. When changing values such as apple radius, repellent radius, vertex counts, or struct shapes, check both the TypeScript and shader definitions.

## WebGPU Details To Be Careful With

- The renderer caches the adapter/device promise in `webgpuContextPromise`, so renderer recreation reuses the same WebGPU device.
- `setWormCount()` can grow capacity without recreating every resource. Capacity grows in `WORM_CAPACITY_BUCKET_SIZE` buckets.
- New worm ranges are initialized by `initWormRange(...)`; if you bypass it, new buffer ranges may contain undefined motion state.
- Apple shrinking uses integer atomics. Worms call `atomicAdd(&appleEaters[index], 1u)`, then the apple compute pass converts eater counts into volume loss.
- Apple placement uses a GPU free-list. Resetting apples must reset the apple buffer, eater buffer, free slots, free count, vertex buffer, and queued placement count.
- `requestAppleSnapshot(...)` is intentionally asynchronous and one-at-a-time. Avoid adding readbacks inside the hot path unless you really need CPU-visible data.
- The visible canvas size and render backing size are separate. CSS owns the visual size; TypeScript multiplies by `devicePixelRatio` and resizes the WebGPU backing store.
- WebGPU errors can surface during `drawFrame(...)` or device loss. The app turns those into status text instead of crashing the page.

## Editing Guidance

- Keep `swarm-3.ts` as the owner of UI and app orchestration.
- Keep `swarm-3-webgpu.ts` as the owner of GPU resources and command encoding.
- Prefer changing shader behavior in WGSL when the work scales with worm count.
- Prefer changing TypeScript when the behavior is UI, URL state, controls, placement policy, or low-volume orchestration.
- Avoid moving large worm data back into JavaScript per frame.
- Keep URL parameter names stable unless there is a migration reason.
- When adding a new renderable marker, define its vertex count and buffer shape deliberately. Several draw calls rely on exact line-list vertex counts.
- When adding a new uniform param, update every `SimParams` declaration and the `paramsData` indices together.

## Quick Debug Checklist

- Blank canvas: confirm the browser supports WebGPU and check the stats overlay for initialization errors.
- Stale behavior after edits: restart the Vite dev server and hard-refresh the page.
- Worm count change fails: check adapter limits from `getMaxSupportedWormCount(...)` and the current capacity growth path.
- Apples do not appear: check placement queue upload, free-list state, `placementMain`, and whether `hasAppleWork` is true.
- Apples do not shrink: check the worm shader's `atomicAdd`, the apple compute pass, and `appleBitePercentPerSecond`.
- Stats look stale: check `requestAppleSnapshot(...)`, `readApples()`, and `syncApplesFromGpu(...)`.
- Trails disappear too quickly or never fade: check `DEFAULT_FADE_AMOUNT`, `FADE_AMOUNT_PER_MS_SCALE`, and `webgpu-fade.wgsl`.

## Verification

Use these from the repo root after meaningful changes:

```sh
npm run build
```

For visual/runtime checks, run:

```sh
npm run dev:swarm-3
```

Then open `/rebuilds/swarm-3/`, place apples, place/remove repellents with Shift, change worm count, pause/resume, and resize the window.

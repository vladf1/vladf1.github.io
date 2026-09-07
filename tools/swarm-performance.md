# Swarm 2 and Swarm 3 performance — September 7, 2026

Normal Swarm 2 scenarios use 13–20% less time per simulated/rendered frame. Swarm 3 uses 9–51% less time in the default and interactive scenes, and reserves 97% less worm-buffer memory at its default count. Rendering resolution, colors, trail behavior, simulation steps, and worm counts are preserved.

Measured on an Apple M3 Max MacBook Pro with 48 GB RAM, Chrome 152, hardware WebGPU through Metal. Values below are milliseconds per frame, including JavaScript command encoding, uploads, GPU rendering, and waiting for GPU completion. These are uncapped throughput measurements; they are not display FPS or individual-frame latency.

| Scene | Sprites / worms | Backing pixels | Before (ms) | After (ms) | Less time | p95 batch average, before → after (ms) |
| --- | ---: | --- | ---: | ---: | ---: | --- |
| Swarm 2 · default | 2,500 | 800 × 600 | 0.224 | 0.195 | 13.0% | 0.267 → 0.215 |
| Swarm 2 · Retina | 2,500 | 2880 × 1800 | 0.287 | 0.228 | 20.3% | 0.326 → 0.283 |
| Swarm 2 · 250k | 250,000 | 800 × 600 | 0.649 | 0.559 | 13.9% | 0.703 → 0.629 |
| Swarm 3 · default | 5,000 | 800 × 600 | 0.291 | 0.263 | 9.5% | 0.349 → 0.329 |
| Swarm 3 · Retina + overlays | 5,000 | 2880 × 1800 | 0.613 | 0.298 | 51.3% | 0.695 → 0.385 |
| Swarm 3 · 32 apples | 10,000 | 800 × 600 | 0.425 | 0.291 | 31.6% | 0.492 → 0.334 |
| Swarm 3 · 250k + 4 apples | 250,000 | 800 × 600 | 0.667 | 0.687 | -2.9% | 0.757 → 0.752 |
| Swarm 3 · 250k triangles | 250,000 | 800 × 600 | 1.108 | 1.054 | 4.9% | 1.198 → 1.149 |

The 250,000-worm Swarm 3 paths keep their original render scheduling. The line case measured 2.9% slower in this run; triangles measured 4.9% faster. Treat those large cases as roughly unchanged, with no reliable performance gain claimed. An initial attempt to combine every pass slowed the large line case by about 8%, so that approach was limited to swarms below 100,000 worms. This threshold is an empirical choice on the tested GPU and may have a different crossover on other hardware.

Both production pages displayed 60 FPS in the interactive smoke checks. At ordinary swarm sizes, the benefit is lower frame workload and more available processing time, rather than exceeding the display refresh rate. The p95 column measures the tail of batch averages, not animation pacing.

## Changes

- **Swarm 2:** fade and worm drawing share one render pass (three compute/render passes become two). Vertex colors use the existing 8-bit channel precision in a packed format, reducing each vertex from 32 to 16 bytes. Vertex storage and compute-to-render vertex traffic are halved: 16 MB becomes 8 MB at 250,000 sprites. Uniform typed arrays are reused, and the FPS text updates only when it changes. Replaced WebGPU renderers now release their devices and GPU resources; superseded async creations are discarded.
- **Swarm 3:** for swarms below 100,000 worms, fade and worm drawing share a render pass; presentation, apple markers, repellent markers, and placement previews share another. The Retina overlay scene drops from eight compute/render passes to four. Larger swarms retain separate passes to avoid the measured scheduling regression.
- **Swarm 3 memory:** initial worm capacity grows geometrically for small swarms instead of always reserving 250,000 slots. The default 5,000 worms reserve 8,192 slots. The five worm buffers total **25,000,000 → 819,200 bytes**, a **96.7% reduction**. This excludes textures, apple/marker buffers, browser memory, and driver overhead. Growing past capacity still preserves the existing worm state.
- **Tooling:** [benchmark runner](swarm-performance.mjs), [verification runner](swarm-verify.mjs), and [raw results](swarm-performance-results.json). Profiling code is outside the production renderers.

## Method and validation

Baseline: commit `1de2685b7ce1fc8522f4f1332bffd87af9e1e05d`. The runner reconstructs only the two Swarm directories from Git in a temporary local folder and removes it afterward. Each variant runs in a fresh isolated Chrome page; before/after order alternates across three rounds. Each round uses 240 warm-up frames, followed by 11 batches of 120 measured frames, waiting for the GPU after each batch. The table is the median of the three run medians (3,960 measured frames per variant per scene). The p95 column is the median of each run’s nearest-rank p95 batch average.

Both versions use identical deterministic seeds, a fixed 16.667 ms simulation step, fade factor 0.9, and matching backing resolutions. The Retina scenes use a 1440 × 900 logical viewport at DPR 2. Swarm 2 holds its pointer at the center. The Swarm 3 overlay scene includes four apples, a repellent marker, its active force, and a placement preview. The 32-apple scene uses 10,000 worms. Apple bite rate is zero only during throughput measurements, keeping the apple population constant throughout the run; equivalence tests use the normal bite rate. Other browser/system activity was not stopped, so timings can vary between runs.

Three additional timestamp-instrumented batches are collected separately after the uninstrumented timing. Their raw per-pass values are diagnostic only: GPU stages can overlap, timestamp granularity is limited, and inserting timestamps changes scheduling. Do not sum those values or substitute them for the table’s completed-work timings.

- `npm run build` passed. The existing size warning concerns the unrelated Astra Snake bundle.
- Seven deterministic before/after cases passed: Swarm 2 attraction, repelling, and no fade; Swarm 3 lines, triangles, no fade, and buffer growth across 9,000 and 260,000 worms.
- All seven cases produced byte-identical GPU simulation data and identical PNG screenshots after 120 fixed steps. This includes apple state and normal bite damage.
- Both pages passed pause/resume, count changes, resize, and renderer-mode interactions without browser or WebGPU errors. Swarm 2 CPU and WebGL fallbacks were smoke-tested; throughput results apply to WebGPU.
- Both built production pages loaded their bundled shader assets and ran without errors.

## Reproduce

From the repository root, start Vite using the existing setup:

```sh
npm run dev:swarm-2
```

Use the port printed by Vite (5176 in this session):

```sh
BASE_URL=http://127.0.0.1:5176 node tools/swarm-performance.mjs /tmp/swarm-results.json
BASE_URL=http://127.0.0.1:5176 node tools/swarm-verify.mjs
npm run build
```

`ROUNDS`, `FILTER`, and `BASELINE_REF` optionally override the benchmark defaults. Verification screenshots go to `/tmp/swarm-verification` unless `OUTPUT_DIR` is set. Run timing and verification separately so they do not compete for the GPU.

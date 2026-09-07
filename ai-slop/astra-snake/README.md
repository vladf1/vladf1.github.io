# Astra Snake

A small, finished arcade game in a luminous 3D garden. Built with Three.js, strict TypeScript, and Vite; no UI framework, remote assets, or backend.

## Play

Use Node.js 24 or newer. From the repository root:

```sh
npm ci
npm run dev:astra-snake
```

The game runs at **http://127.0.0.1:5173/ai-slop/astra-snake/** (or the port Vite reports).

```sh
npm run build
npx vite preview --host 127.0.0.1
```

The game is included in the site's production build at `dist/ai-slop/astra-snake/`.
Deploy the complete root `dist/` folder, which also contains its shared bundled assets.

## Controls

| Action | Controls |
| --- | --- |
| Steer | Arrow keys, WASD, touch direction pad, or swipe the arena |
| Start | Let's play, Space, or Enter |
| Pause / resume | Pause button, Esc, P, or Space |
| Restart after a run | Play again, Space, Enter, or R |
| Restart while paused | R |
| Sound | Sound button or M |
| Flashes / shake | Sparkle button on the desktop toolbar or mobile title screen |

Focused buttons also support standard keyboard activation. The game pauses when its window loses focus or the page is hidden. It never resumes automatically.

## The loop

- The arena is 20 × 20. Walls and the body are lethal; the vacating tail cell is legal.
- Coral fruit grows the snake by one cell and earns **10 × combo** points.
- Quick pickups build a multiplier up to **×5**. Food placement favors a nearby routing opportunity while still respecting occupied cells.
- Every fifth ordinary fruit creates a golden star, if room is available. Gold lasts **8 seconds**, earns **50 × active combo** points, and refreshes an active combo without growing the snake.
- Speed increases every four ordinary pickups, up to level 11. A completely filled board wins the run.
- Settings and separate personal bests for each difficulty persist locally. Blocked or corrupt storage falls back to an in-memory session.

| Difficulty | Initial → maximum cells/second | Combo window |
| --- | --- | --- |
| Chill | 5 → 9 | 3.4 seconds |
| Normal | 7 → 13 | 2.8 seconds |
| Frenzy | 10 → 18 | 2.5 seconds |

The refinements are deliberately focused: a two-turn input queue, food placement that makes chains achievable, and an expressive continuous snake. Its anatomy is based on [Florida Museum rough greensnake photographs](https://www.floridamuseum.ufl.edu/florida-snake-id/snake/rough-greensnake/): a slender neck, rounded trunk, and a long tapering tail in the last third, with overlapping bright green dorsal scales and pale belly plates. The skin uses coordinated color, raised-scale bump, and roughness textures: darker seams and varied scale highlights remain visible at the normal arena view. New snakes begin at 65% of adult thickness; the body and head smoothly reach their full proportions at 18 cells, without growing any thicker beyond that. The low, elongated head has small dark side-facing eyes, a defined mouth, and a fine forked tongue. During gameplay, rounded bends and subtle muscular movement stay inside occupied cells; the head and tail follow cardinal paths. The title snake follows a separate, freely curving presentation path. Sound intervals, floor rings, and small particle bursts supply feedback without covering the route. On death, the full snake bursts into spinning textured fragments with an impact ring, sparks, and a short explosion sound; the result screen appears after 0.52 seconds while the fragments continue flying and fading behind it for up to 2.4 seconds. Restart immediately clears the remaining fragments. Reduced motion replaces the flying pieces with a quiet disappearance and impact ring.

## Code map

- `src/simulation.ts`: pure grid rules, scoring, timers, difficulty, spawning, input queue.
- `src/renderer.ts`: orthographic 3D diorama, continuous tube mesh, procedural pickups, pooled effects.
- `src/input.ts`: keyboard, touch pad, swipe recognition, reversal-safe input delivery.
- `src/audio.ts`: gesture-initialized Web Audio cues and bounded voice lifecycle.
- `src/ui.ts` / `src/style.css`: screens, responsive HUD, accessible buttons and dialogs.
- `src/storage.ts`: validated and exception-safe preferences.
- `src/main.ts`: fixed 120 Hz simulation loop, lifecycle, event coordination.

Simulation clocks do not depend on draw frequency. Pauses freeze gameplay time. Backgrounding or a stall over half a second pauses safely. The renderer caps pixel ratio at 1.7, particles at 200, death fragments at 160, and ring effects at 10; geometries and materials are reused. Ambient animation, particles, flashes, and camera shake respect reduced-motion settings. Typography uses the device’s standard system fonts; no font files or font services are loaded.

## Verification

```sh
npm run test:astra-snake
npx playwright install chromium
npm run test:astra-snake:browser
```

The browser suite uses Chromium's Metal backend on this macOS host. Remove `--use-angle=metal` from `playwright.config.ts` to use a platform's default backend elsewhere. Browser tests need access to the local Vite server.

**17 simulation tests** cover input buffering, reversal rejection, collisions, legal tail entry, growth, combo scoring and expiry, bonus spawning/collection/expiry, pause, reset, filled boards, last-free-cell handling, difficulty, frame-rate independence, and malformed or unavailable storage.

**6 browser tests** cover actual keyboard routing through fruit and gold, rapid corners, touch taps and swipes, pause/resume, death and new-best results, restart, saved settings, background pause, responsive sizes, reduced motion, audio initialization, storage denial, rendering stress, full-body explosions on wall and self-collision, continued motion and fading behind the result dialog, fragment cleanup, and reduced-motion death feedback. The production build was also played in the browser, with no console warnings or errors.

Measured stress case with the reference-based anatomy, detailed scale textures, and slithering animation on Apple M3 Max / Chromium Metal: **300-cell moving snake, up to 200 active particles, 1440 × 900 viewport, 1.7 rendering pixel ratio**. Over 360 frames: **16.65 ms mean**, **16.80 ms p95**, **2.58 ms mean CPU frame work**, **2.90 ms p95 CPU frame work**, and **47 draw calls**. The browser's initial software-rendered test was slower; these numbers specifically describe hardware rendering and are not claims about other devices.

Limitations: WebGL 2 and hardware acceleration are required for the intended experience. Mobile interaction was verified with Chromium touch emulation; physical phones and Safari/Firefox have not been validated. Audio playback initialization was verified programmatically; subjective sound balance may vary by speakers.

Development builds expose a small `window.__astra` inspection harness used by tests. Vite removes it from production builds.

API references: [Three.js renderer](https://threejs.org/docs/pages/WebGLRenderer.html), [responsive rendering](https://threejs.org/manual/en/responsive.html), and [Vite](https://vite.dev/guide/).

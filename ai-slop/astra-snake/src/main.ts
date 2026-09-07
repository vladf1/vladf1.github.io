import './style.css';
import { Simulation, FIXED_DT, type Difficulty } from './simulation.ts';
import { ArenaRenderer } from './renderer.ts';
import { AudioEngine } from './audio.ts';
import { Interface } from './ui.ts';
import { bindInput } from './input.ts';
import { readPreferences, savePreferences } from './storage.ts';

const preferences = readPreferences();
const game = new Simulation(preferences.mode);
const ui = new Interface(preferences);
const audio = new AudioEngine();
let view: ArenaRenderer;
try { view = new ArenaRenderer(ui.arena); }
catch (error) {
  const fatal = ui.get('fatal'); fatal.hidden = false;
  fatal.textContent = 'This little world needs WebGL 2. Try enabling hardware acceleration in your browser, then reload.';
  throw error;
}
const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
let demo = true;
let accumulator = 0;
let last = performance.now();
let bestBefore = 0;
let bestSaved = false;
let runVersion = 0;
function configure() {
  audio.enabled = preferences.sound;
  if (!audio.enabled) audio.clear();
  view.configure(preferences.effects, motion.matches);
  ui.updateSettings(); savePreferences(preferences);
}
configure(); motion.addEventListener('change', configure);
function start() {
  const version = ++runVersion;
  audio.clear();
  void audio.unlock().then(() => { if (version === runVersion && game.phase === 'playing' && !demo) audio.play('start'); });
  game.reset(preferences.mode); game.start(); demo = false;
  accumulator = 0; last = performance.now();
  bestBefore = preferences.best[game.mode]; bestSaved = false;
  view.clear(); ui.reset();
}
function resume() { void audio.unlock(); game.resume(); accumulator = 0; last = performance.now(); }
function pause() {
  if (demo) return;
  if (game.phase === 'paused') { resume(); return; }
  if (game.phase === 'playing') { game.pause(); audio.clear(); audio.play('pause'); }
}
function home() {
  runVersion++;
  demo = true; game.reset(preferences.mode); accumulator = 0;
  audio.clear(); view.clear(); ui.reset();
}
function toggleSound() { void audio.unlock(); preferences.sound = !preferences.sound; configure(); }
ui.onStart = start; ui.onPause = pause; ui.onResume = resume; ui.onHome = home; ui.onSound = toggleSound;
ui.onEffects = () => { preferences.effects = !preferences.effects; configure(); };
ui.onMode = (mode: Difficulty) => { preferences.mode = mode; game.reset(mode); configure(); };
bindInput(ui.arena, {
  turn: d => { game.turn(d); },
  primary: () => { if (demo || ['over', 'won'].includes(game.phase)) start(); else pause(); },
  pause,
  restart: () => { if (['over', 'won', 'paused'].includes(game.phase)) start(); },
  sound: toggleSound,
});
function suspend() { if (!demo && game.phase === 'playing') { game.pause(); audio.clear(); } accumulator = 0; last = performance.now(); }
document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); else { last = performance.now(); accumulator = 0; } });
window.addEventListener('blur', suspend);
window.addEventListener('pagehide', suspend);
ui.arena.querySelector('canvas')!.addEventListener('webglcontextlost', e => {
  e.preventDefault(); suspend(); ui.get('fatal').hidden = false;
  ui.get('fatal').innerHTML = 'The graphics context was interrupted.<br/><button class="primary" id="reload">Reload game</button>';
  ui.get('reload').addEventListener('click', () => location.reload());
});

const timings: number[] = [];
const cpuTimings: number[] = [];
function frame(now: number) {
  const cpuStart = performance.now();
  const rawDelta = (now - last) / 1000; last = now;
  // Never catch up a suspended tab or a multi-second OS hitch into a wall.
  if (rawDelta > .5 && game.phase === 'playing' && !demo) suspend();
  const dt = Math.min(.5, Math.max(0, rawDelta));
  if (!demo) {
    if (game.phase !== 'paused') accumulator += dt;
    while (accumulator + 1e-9 >= FIXED_DT) { game.update(FIXED_DT); accumulator -= FIXED_DT; }
    for (const event of game.drainEvents()) {
      view.event(event);
      if (event.type === 'food') { audio.play('food', event.combo); if ((event.combo ?? 0) > 1) ui.notify(`+${event.points}  /  ×${event.combo} combo`); }
      if (event.type === 'bonus') { audio.play('bonus'); ui.notify(`✦ +${event.points}  /  Golden bite`, true); }
      if (event.type === 'bonus-spawn') { audio.play('spawn'); ui.notify('✦ Gold is here. Take the detour?', true); }
      if (event.type === 'bonus-expired') ui.notify('Gold slipped away. Keep your flow.');
      if (event.type === 'death') audio.play('death');
      if (event.type === 'win') audio.play('best');
    }
    if (!bestSaved && ['dying', 'won'].includes(game.phase)) {
      const isBest = game.score > bestBefore;
      if (isBest) { preferences.best[game.mode] = game.score; savePreferences(preferences); }
      ui.celebrateBest(isBest); bestSaved = true;
    }
  }
  const wasDying = document.querySelector('#app')?.getAttribute('data-screen') === 'dying';
  ui.update(game, dt, demo);
  if (wasDying && game.phase === 'over' && game.score > bestBefore) audio.play('best');
  if (!document.hidden) view.render(game, dt, demo);
  if (import.meta.env.DEV) { timings.push(rawDelta * 1000); cpuTimings.push(performance.now() - cpuStart); if (timings.length > 900) { timings.shift(); cpuTimings.shift(); } }
  requestAnimationFrame(frame);
}
ui.update(game, 0, demo);
requestAnimationFrame(frame);

// Explicit development-only harness; absent from production builds.
if (import.meta.env.DEV) {
  Object.assign(window, { __astra: {
    game, start, pause, resume, home, view, preferences, configure,
    snapshot: () => ({ phase: game.phase, body: game.body.map(c => ({ ...c })), food: game.food, bonus: game.bonus, score: game.score, combo: game.combo, elapsed: game.elapsed, level: game.level, speed: game.speed, queue: [...game.queue], mode: game.mode, best: { ...preferences.best } }),
    performance: () => { const samples = timings.filter(n => n > 0).sort((a,b) => a-b); const cpu = [...cpuTimings].sort((a,b)=>a-b); const gl = view.renderer.getContext(); const ext = gl.getExtension('WEBGL_debug_renderer_info'); return { frames: samples.length, meanMs: samples.reduce((a,b) => a+b, 0) / samples.length, p95Ms: samples[Math.floor(samples.length * .95)], cpuMeanMs: cpu.reduce((a,b)=>a+b,0)/cpu.length, cpuP95Ms: cpu[Math.floor(cpu.length*.95)], gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unavailable', ...view.stats }; },
    resetPerformance: () => { timings.length = 0; cpuTimings.length = 0; },
  } });
}

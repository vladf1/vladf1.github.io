import type { Direction } from './simulation.ts';
type Actions = { turn: (d: Direction) => void; primary: () => void; pause: () => void; restart: () => void; sound: () => void };
const KEYS: Record<string, Direction> = { ArrowUp: 'up', ArrowRight: 'right', ArrowDown: 'down', ArrowLeft: 'left', w: 'up', d: 'right', s: 'down', a: 'left' };
export function bindInput(arena: HTMLElement, actions: Actions) {
  window.addEventListener('keydown', e => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (KEYS[key]) { e.preventDefault(); if (!e.repeat) actions.turn(KEYS[key]); }
    if (key === ' ' || key === 'Enter') {
      // Let keyboard activation of a focused button produce exactly one click.
      if (document.activeElement instanceof HTMLButtonElement) return;
      e.preventDefault(); if (!e.repeat) actions.primary();
    }
    if (key === 'Escape' || key === 'p') { e.preventDefault(); if (!e.repeat) actions.pause(); }
    if (key === 'r') { e.preventDefault(); if (!e.repeat) actions.restart(); }
    if (key === 'm') { e.preventDefault(); if (!e.repeat) actions.sound(); }
  });
  document.querySelectorAll<HTMLButtonElement>('[data-dir]').forEach(button => {
    button.addEventListener('pointerdown', e => {
      e.preventDefault(); actions.turn(button.dataset.dir as Direction);
      button.classList.add('pressed'); button.setPointerCapture(e.pointerId);
    });
    const release = () => button.classList.remove('pressed');
    button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
    // Keyboard/assistive activation has detail=0; pointer clicks were handled on down.
    button.addEventListener('click', e => { if (e.detail === 0) actions.turn(button.dataset.dir as Direction); });
  });
  let pointer: { id: number; x: number; y: number } | null = null;
  arena.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;
    e.preventDefault(); pointer = { id: e.pointerId, x: e.clientX, y: e.clientY }; arena.setPointerCapture(e.pointerId);
  });
  arena.addEventListener('pointermove', e => {
    if (!pointer || pointer.id !== e.pointerId) return;
    e.preventDefault();
    const dx = e.clientX - pointer.x, dy = e.clientY - pointer.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 16) return;
    actions.turn(Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 'right' : 'left' : dy > 0 ? 'down' : 'up');
    pointer.x = e.clientX; pointer.y = e.clientY;
  });
  const release = () => { pointer = null; };
  arena.addEventListener('pointerup', release); arena.addEventListener('pointercancel', release); arena.addEventListener('lostpointercapture', release);
  arena.addEventListener('contextmenu', e => e.preventDefault());
}

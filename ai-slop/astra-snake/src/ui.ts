import { BONUS_SECONDS, MODES, type Difficulty, type Simulation } from './simulation.ts';
import type { Preferences } from './storage.ts';

const icons = {
  sound: '<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  muted: '<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 6 6m0-6-6 6"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  effects: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
  lightning: '<path d="m13 2-9 12h7l-1 8 10-13h-8l1-7Z"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  crown: '<path d="m3 7 4 4 5-6 5 6 4-4-2 12H5L3 7Z"/>',
};
export const icon = (name: keyof typeof icons) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
export class Interface {
  readonly arena: HTMLElement;
  private root: HTMLElement;
  private lastPhase = '';
  private lastScore = -1;
  private toastTime = 0;
  private newBest = false;
  onStart = () => {};
  onPause = () => {};
  onResume = () => {};
  onHome = () => {};
  onSound = () => {};
  onEffects = () => {};
  onMode = (_mode: Difficulty) => {};
  constructor(private preferences: Preferences) {
    this.root = document.querySelector('#app')!;
    this.root.innerHTML = `
      <header class="topbar">
        <a class="brand" href="#" aria-label="AstraSnake home"><span class="brand-mark">${icon('effects')}</span><span>AstraSnake</span></a>
        <div class="hud" aria-label="Game statistics">
          <div class="stat score-stat"><span class="eyebrow">SCORE</span><strong id="score">000</strong></div>
          <div class="stat"><span class="eyebrow">BEST</span><strong id="best">000</strong></div>
          <div class="stat speed-stat"><span class="eyebrow">SPEED</span><strong><span id="level">01</span><span class="stat-unit" id="speed"> / 7.0</span></strong></div>
        </div>
        <div class="toolbar">
          <button class="icon-button" id="effects" aria-label="Turn off flashes and camera shake">${icon('lightning')}</button>
          <button class="icon-button" id="sound" aria-label="Mute sound" title="Sound · M">${icon('sound')}</button>
          <button class="icon-button" id="pause" aria-label="Pause game" title="Pause · Esc or P">${icon('pause')}</button>
        </div>
      </header>
      <main class="workspace">
        <div class="arena-aura" aria-hidden="true"></div>
        <div id="arena"></div>
        <section id="title-screen" class="title-screen" aria-labelledby="game-title">
          <h1 id="game-title">One more<br/> <span>bite.</span></h1>
          <p class="intro">Eat. Grow. Chase the gold.<br/> Mind the walls and your tail.</p>
          <fieldset class="difficulty"><legend>CHOOSE YOUR PACE</legend><div class="difficulty-options">
            ${(['chill', 'normal', 'frenzy'] as Difficulty[]).map((mode, i) => `<button data-mode="${mode}" aria-pressed="false"><span class="pace-bars" aria-hidden="true">${'<i></i>'.repeat(i + 1)}</span>${MODES[mode].name}</button>`).join('')}
          </div><p id="mode-description"></p></fieldset>
          <button class="primary" id="start">Let's play ${icon('arrow')}</button>
          <div class="start-hint">or press <kbd>SPACE</kbd></div>
        </section>
        <div class="toast" id="toast" role="status" aria-live="polite"></div>
        <div id="overlay" class="overlay" hidden>
          <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" tabindex="-1">
            <div class="dialog-kicker" id="dialog-kicker">TAKE A BREATH</div>
            <h2 id="dialog-title">On pause.</h2>
            <p id="dialog-description">Your next move can wait.</p>
            <div id="results" class="results" hidden>
              <div class="final-score" id="final-score">000</div><span class="eyebrow">FINAL SCORE</span>
              <div class="run-summary"><div><strong id="final-food">0</strong><span>FRUIT</span></div><div><strong id="final-combo">×1</strong><span>TOP COMBO</span></div><div><strong id="final-time">0:00</strong><span>SURVIVED</span></div></div>
            </div>
            <button class="primary" id="dialog-primary">Keep going ${icon('arrow')}</button>
            <button class="text-button" id="home">Back to menu</button>
            <span class="dialog-hint" id="dialog-hint">SPACE or ESC to resume</span>
          </section>
        </div>
      </main>
      <footer class="bottom-bar">
        <div class="control-guide"><span><kbd>↑ ↓ ← →</kbd> / <kbd>WASD</kbd> steer</span><span><kbd>Esc</kbd> pause</span></div>
        <div class="food-guide"><span title="Fruit grows the snake and earns 10 points times your combo."><i class="berry-dot"></i> Eat & grow · +10</span><span title="Gold appears every five fruit. Collect it within eight seconds for 50 points times your combo."><i class="gold-star">✦</i> Chase the gold</span></div>
        <aside class="run-status" aria-label="Pickup status">
          <div class="combo-status" id="combo-status" hidden><div><span>COMBO</span><strong id="combo">×2</strong></div><div class="meter"><i id="combo-meter"></i></div></div>
          <div class="bonus-status" id="bonus-status" hidden><div><span>✦ GOLD</span><strong id="bonus-time">8.0s</strong></div><div class="meter"><i id="bonus-meter"></i></div></div>
        </aside>
        <div class="touch-guide">Swipe or tap to steer</div>
        <div class="dpad" aria-label="Touch direction controls"><button data-dir="up" aria-label="Move up">↑</button><button data-dir="left" aria-label="Move left">←</button><span aria-hidden="true">✦</span><button data-dir="right" aria-label="Move right">→</button><button data-dir="down" aria-label="Move down">↓</button></div>
      </footer>
      <div id="fatal" hidden role="alert"></div>
    `;
    this.arena = this.get('arena');
    this.get('start').addEventListener('click', () => this.onStart());
    this.get('pause').addEventListener('click', () => this.onPause());
    this.get('sound').addEventListener('click', () => this.onSound());
    this.get('effects').addEventListener('click', () => this.onEffects());
    this.get('home').addEventListener('click', () => this.onHome());
    this.root.querySelector('.brand')!.addEventListener('click', e => { e.preventDefault(); this.onPause(); });
    this.get('dialog-primary').addEventListener('click', () => this.lastPhase === 'paused' ? this.onResume() : this.onStart());
    this.root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button => button.addEventListener('click', () => this.onMode(button.dataset.mode as Difficulty)));
    this.updateSettings();
  }
  get(id: string) { return document.getElementById(id)!; }
  text(id: string, text: string) { const el = this.get(id); if (el.textContent !== text) el.textContent = text; }
  updateSettings() {
    this.root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === this.preferences.mode)));
    this.text('mode-description', MODES[this.preferences.mode].description);
    this.get('sound').innerHTML = icon(this.preferences.sound ? 'sound' : 'muted');
    this.get('sound').setAttribute('aria-label', this.preferences.sound ? 'Mute sound' : 'Enable sound');
    this.get('sound').setAttribute('aria-pressed', String(this.preferences.sound));
    this.get('effects').setAttribute('aria-label', this.preferences.effects ? 'Turn off flashes and camera shake' : 'Turn on flashes and camera shake');
    this.get('effects').setAttribute('data-tooltip', `Flashes & camera shake: ${this.preferences.effects ? 'on' : 'off'}. Click to ${this.preferences.effects ? 'disable' : 'enable'}.`);
    this.get('effects').setAttribute('aria-pressed', String(this.preferences.effects));
  }
  reset() { this.newBest = false; this.lastScore = -1; this.toastTime = 0; this.get('toast').classList.remove('visible'); this.get('score').getAnimations().forEach(animation => animation.cancel()); }
  celebrateBest(value: boolean) { this.newBest = value; }
  notify(text: string, gold = false) {
    this.text('toast', text); this.get('toast').classList.add('visible'); this.get('toast').classList.toggle('gold', gold); this.toastTime = 1.6;
  }
  update(game: Simulation, dt: number, demo: boolean) {
    const phase = demo ? 'title' : game.phase;
    if (phase !== this.lastPhase) {
      this.lastPhase = phase;
      this.root.dataset.screen = phase;
      this.get('title-screen').hidden = !demo;
      const dialog = ['paused', 'over', 'won'].includes(phase);
      this.get('overlay').hidden = !dialog;
      (this.get('pause') as HTMLButtonElement).disabled = demo || !['playing', 'paused'].includes(phase);
      this.get('pause').setAttribute('aria-label', phase === 'paused' ? 'Resume game' : 'Pause game');
      if (dialog) {
        const paused = phase === 'paused';
        this.get('results').hidden = paused;
        this.text('dialog-kicker', paused ? 'TAKE A BREATH' : phase === 'won' ? 'EVERY LAST BITE' : this.newBest ? '✦ A NEW PERSONAL BEST' : 'UNTIL THE NEXT BITE');
        this.text('dialog-title', paused ? 'On pause.' : phase === 'won' ? 'Perfectly full.' : this.newBest ? 'Look at you.' : 'One more?');
        this.text('dialog-description', paused ? 'Your next move can wait.' : phase === 'won' ? 'All 400 cells. That was extraordinary.' : game.reason);
        this.get('dialog-primary').innerHTML = `${paused ? 'Keep going' : 'Play again'} ${icon('arrow')}`;
        this.text('dialog-hint', paused ? 'SPACE or ESC to resume' : 'SPACE or R for another round');
        this.get('dialog-kicker').classList.toggle('gold', this.newBest && !paused);
        this.text('final-score', game.score.toLocaleString());
        this.text('final-food', String(game.eaten)); this.text('final-combo', `×${Math.max(1, game.maxCombo)}`);
        this.text('final-time', `${Math.floor(game.elapsed / 60)}:${String(Math.floor(game.elapsed % 60)).padStart(2, '0')}`);
        this.get('dialog-primary').focus({ preventScroll: true });
      } else if (demo) this.get('start').focus({ preventScroll: true });
      else if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      this.root.querySelectorAll<HTMLElement>('.topbar, .bottom-bar, .title-screen').forEach(el => { el.inert = dialog; });
    }
    const score = demo ? 0 : game.score;
    if (score !== this.lastScore) {
      this.text('score', String(score).padStart(3, '0'));
      if (score > 0 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) this.get('score').animate([{ color: '#b6ffdb', transform: 'translateY(-2px)' }, { color: '#eef7f3', transform: 'translateY(0)' }], { duration: 220 });
      this.lastScore = score;
    }
    this.text('best', String(this.preferences.best[game.mode]).padStart(3, '0'));
    this.text('level', String(game.level).padStart(2, '0')); this.text('speed', ` / ${game.speed.toFixed(1)}`);
    this.text('combo', `×${Math.max(1, game.combo)}`);
    this.get('combo-status').hidden = demo || game.combo < 2;
    this.get('combo-meter').style.transform = `scaleX(${game.comboRemaining / MODES[game.mode].combo})`;
    this.get('bonus-status').hidden = demo || !game.bonus;
    if (game.bonus) {
      this.text('bonus-time', `${game.bonus.remaining.toFixed(1)}s`);
      this.get('bonus-meter').style.transform = `scaleX(${game.bonus.remaining / BONUS_SECONDS})`;
    }
    if (game.phase !== 'paused') this.toastTime -= dt;
    if (this.toastTime <= 0) this.get('toast').classList.remove('visible');
  }
}

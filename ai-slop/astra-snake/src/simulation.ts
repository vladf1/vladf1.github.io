export const SIZE = 20;
export const FIXED_DT = 1 / 120;
export const BONUS_SECONDS = 8;
export const DIRECTIONS = { up: { x: 0, y: -1 }, right: { x: 1, y: 0 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 } } as const;
export type Direction = keyof typeof DIRECTIONS;
export type Difficulty = 'chill' | 'normal' | 'frenzy';
export type Cell = { x: number; y: number };
export type Phase = 'ready' | 'playing' | 'paused' | 'dying' | 'over' | 'won';
export const MODES = {
  chill: { name: 'Chill', start: 5, max: 9, increment: 0.4, combo: 3.4, description: 'Room to breathe. Find your rhythm.' },
  normal: { name: 'Normal', start: 7, max: 13, increment: 0.6, combo: 2.8, description: 'A little pressure. A lot of flow.' },
  frenzy: { name: 'Frenzy', start: 10, max: 18, increment: 0.8, combo: 2.5, description: 'Quick hands. No second guesses.' },
} as const;
export type GameEvent = { type: 'food' | 'bonus' | 'bonus-spawn' | 'bonus-expired' | 'death' | 'win'; cell: Cell; points?: number; combo?: number; reason?: string };
export const sameCell = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;
export const distance = (a: Cell, b: Cell) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const copy = (cells: Cell[]) => cells.map(c => ({ ...c }));

// Pure gameplay. Every timer advances here, in fixed simulation steps.
export class Simulation {
  mode: Difficulty;
  phase: Phase = 'ready';
  body: Cell[] = [];
  previous: Cell[] = [];
  direction: Direction = 'right';
  queue: Direction[] = [];
  food: Cell | null = null;
  bonus: (Cell & { remaining: number }) | null = null;
  score = 0;
  eaten = 0;
  bonusEaten = 0;
  combo = 0;
  maxCombo = 0;
  comboRemaining = 0;
  elapsed = 0;
  moveClock = 0;
  deathClock = 0;
  reason = '';
  events: GameEvent[] = [];
  private random: () => number;

  constructor(mode: Difficulty = 'normal', random = Math.random) {
    this.mode = mode;
    this.random = random;
    this.reset(mode);
  }
  get level() { return Math.min(11, 1 + Math.floor(this.eaten / 4)); }
  get speed() { const m = MODES[this.mode]; return Math.min(m.max, m.start + (this.level - 1) * m.increment); }
  get interval() { return 1 / this.speed; }
  get alpha() { return this.phase === 'playing' || this.phase === 'paused' ? Math.min(1, this.moveClock / this.interval) : 1; }
  reset(mode: Difficulty = this.mode) {
    this.mode = mode;
    this.phase = 'ready';
    this.body = [{ x: 7, y: 10 }, { x: 6, y: 10 }, { x: 5, y: 10 }, { x: 4, y: 10 }];
    this.previous = copy(this.body);
    this.direction = 'right'; this.queue = [];
    this.food = { x: 11, y: 10 }; this.bonus = null;
    this.score = this.eaten = this.bonusEaten = this.combo = this.maxCombo = 0;
    this.comboRemaining = this.elapsed = this.moveClock = this.deathClock = 0;
    this.reason = ''; this.events = [];
  }
  start() { this.phase = 'playing'; }
  pause() { if (this.phase === 'playing') this.phase = 'paused'; }
  resume() { if (this.phase === 'paused') this.phase = 'playing'; }
  turn(next: Direction) {
    if (this.phase !== 'playing' || this.queue.length >= 2) return false;
    const last = this.queue.at(-1) ?? this.direction;
    const a = DIRECTIONS[last], b = DIRECTIONS[next];
    if (last === next || (a.x + b.x === 0 && a.y + b.y === 0)) return false;
    this.queue.push(next);
    return true;
  }
  update(dt: number) {
    if (this.phase === 'dying') {
      this.deathClock += dt;
      if (this.deathClock >= 0.52) this.phase = 'over';
      return;
    }
    if (this.phase !== 'playing') return;
    this.elapsed += dt;
    this.comboRemaining = Math.max(0, this.comboRemaining - dt);
    if (this.comboRemaining <= 0) this.combo = 0;
    if (this.bonus) {
      this.bonus.remaining -= dt;
      if (this.bonus.remaining <= 0) {
        this.events.push({ type: 'bonus-expired', cell: { x: this.bonus.x, y: this.bonus.y } });
        this.bonus = null;
      }
    }
    this.moveClock += dt;
    while (this.moveClock + 1e-9 >= this.interval && this.phase === 'playing') {
      this.moveClock = Math.max(0, this.moveClock - this.interval);
      this.move();
    }
  }
  move() {
    if (this.phase !== 'playing') return;
    const nextDirection = this.queue.shift();
    if (nextDirection) this.direction = nextDirection;
    const d = DIRECTIONS[this.direction], head = this.body[0];
    const next = { x: head.x + d.x, y: head.y + d.y };
    const grows = !!this.food && sameCell(next, this.food);
    const wall = next.x < 0 || next.y < 0 || next.x >= SIZE || next.y >= SIZE;
    // The tail is no longer occupied when this move doesn't grow the snake.
    const hitsBody = this.body.slice(0, grows ? this.body.length : -1).some(c => sameCell(c, next));
    if (wall || hitsBody) {
      this.phase = 'dying'; this.deathClock = 0;
      this.reason = wall ? 'The edge got you.' : 'A little too close to yourself.';
      this.queue = [];
      this.events.push({ type: 'death', cell: { ...head }, reason: this.reason });
      return;
    }
    this.previous = copy(this.body);
    this.body.unshift(next);
    if (!grows) this.body.pop();
    if (grows) {
      this.food = null;
      this.eaten++;
      this.combo = this.comboRemaining > 0 ? Math.min(5, this.combo + 1) : 1;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.comboRemaining = MODES[this.mode].combo;
      const points = 10 * this.combo;
      this.score += points;
      this.events.push({ type: 'food', cell: next, points, combo: this.combo });
      if (this.body.length === SIZE * SIZE) {
        this.phase = 'won'; this.bonus = null; this.queue = [];
        this.events.push({ type: 'win', cell: next });
        return;
      }
      this.food = this.spawn('food');
      // If the sole free cell held gold, ordinary food takes priority.
      if (!this.food && this.bonus) { this.bonus = null; this.food = this.spawn('food'); }
      if (this.eaten % 5 === 0 && !this.bonus) {
        const cell = this.spawn('bonus');
        if (cell) { this.bonus = { ...cell, remaining: BONUS_SECONDS }; this.events.push({ type: 'bonus-spawn', cell }); }
      }
    } else if (this.bonus && sameCell(next, this.bonus)) {
      const points = 50 * Math.max(1, this.combo);
      this.score += points; this.bonusEaten++;
      this.events.push({ type: 'bonus', cell: next, points, combo: Math.max(1, this.combo) });
      // Gold extends an active chain without growing the snake.
      if (this.combo) this.comboRemaining = MODES[this.mode].combo;
      this.bonus = null;
    }
  }
  spawn(kind: 'food' | 'bonus'): Cell | null {
    const occupied = new Set(this.body.map(c => c.y * SIZE + c.x));
    if (this.food) occupied.add(this.food.y * SIZE + this.food.x);
    if (this.bonus) occupied.add(this.bonus.y * SIZE + this.bonus.x);
    const free: Cell[] = [], preferred: Cell[] = [];
    const head = this.body[0];
    const reach = Math.floor(this.speed * MODES[this.mode].combo * 0.64);
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      if (occupied.has(y * SIZE + x)) continue;
      const c = { x, y }, dist = distance(head, c);
      free.push(c);
      if (kind === 'food' ? dist >= 3 && dist <= reach : dist >= 8 && dist <= 18) preferred.push(c);
    }
    // Enumerating the board also guarantees termination on a crowded board.
    const pool = preferred.length ? preferred : free;
    return pool.length ? pool[Math.min(pool.length - 1, Math.floor(this.random() * pool.length))] : null;
  }
  drainEvents() { const events = this.events; this.events = []; return events; }
}

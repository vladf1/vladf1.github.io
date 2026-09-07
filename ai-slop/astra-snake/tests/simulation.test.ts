import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, SIZE, FIXED_DT, MODES, sameCell, type Cell, type Difficulty } from '../src/simulation.ts';
import { readPreferences, savePreferences } from '../src/storage.ts';

function live(mode: Difficulty = 'normal') { const g = new Simulation(mode, () => .4); g.start(); return g; }
function step(g: Simulation, seconds: number) { for (let i = 0; i < Math.round(seconds / FIXED_DT); i++) g.update(FIXED_DT); }
function place(g: Simulation, body: Cell[], direction: 'up' | 'right' | 'down' | 'left' = 'right') { g.body = body; g.previous = body.map(c => ({ ...c })); g.direction = direction; }

test('two-turn buffering uses the last queued direction and rejects repeats / reversals', () => {
  const g = live();
  assert.equal(g.turn('left'), false);
  assert.equal(g.turn('up'), true);
  assert.equal(g.turn('down'), false);
  assert.equal(g.turn('left'), true);
  assert.equal(g.turn('down'), false);
  g.move(); assert.deepEqual(g.body[0], { x: 7, y: 9 });
  g.move(); assert.deepEqual(g.body[0], { x: 6, y: 9 });
  assert.equal(g.phase, 'playing');
});
test('the current tail cell can be entered when vacated', () => {
  const g = live(); place(g, [{x:2,y:2},{x:2,y:3},{x:1,y:3},{x:1,y:2}], 'left');
  g.move(); assert.equal(g.phase, 'playing'); assert.deepEqual(g.body[0], {x:1,y:2});
});
test('body collision excludes only a vacating tail, not internal cells', () => {
  const g = live(); place(g, [{x:2,y:2},{x:2,y:3},{x:1,y:3},{x:1,y:2},{x:0,y:2}], 'left');
  g.move(); assert.equal(g.phase, 'dying'); assert.match(g.reason, /yourself/);
});
test('wall collision has a short death phase, then ends the run', () => {
  const g = live(); place(g, [{x:19,y:5},{x:18,y:5},{x:17,y:5}]);
  g.move(); assert.equal(g.phase, 'dying'); step(g, .6); assert.equal(g.phase, 'over');
});
test('ordinary fruit grows, combo scores increase and cap at five', () => {
  const g = live();
  for (let i = 0; i < 7; i++) { g.food = {x:g.body[0].x+1,y:10}; g.move(); }
  assert.equal(g.body.length, 11); assert.equal(g.score, 250); assert.equal(g.combo, 5); assert.equal(g.maxCombo, 5);
  assert.equal(g.level, 2); assert.equal(g.speed, 7.6);
});
test('combo expires in game time and the next fruit resets it to one', () => {
  const g = live('chill'); g.food = {x:8,y:10}; g.move();
  g.moveClock = -100; step(g, MODES.chill.combo + .1);
  assert.equal(g.combo, 0);
  g.food = {x:9,y:10}; g.move(); assert.equal(g.combo, 1); assert.equal(g.score, 20);
});
test('the fifth fruit creates gold without overlapping snake or ordinary fruit', () => {
  const g = live();
  for (let i = 0; i < 5; i++) { g.food = {x:g.body[0].x+1,y:10}; g.move(); }
  assert.ok(g.bonus); assert.equal(g.bonus.remaining, 8);
  assert.ok(!g.body.some(c => sameCell(c, g.bonus!))); assert.ok(!sameCell(g.food!, g.bonus));
});
test('gold awards 50 times the active combo and refreshes it without growth', () => {
  const g = live(); g.combo = 3; g.comboRemaining = 1;
  g.bonus = {x:8,y:10,remaining:4}; g.food = {x:3,y:3}; g.move();
  assert.equal(g.score, 150); assert.equal(g.body.length, 4); assert.equal(g.bonus, null);
  assert.equal(g.comboRemaining, MODES.normal.combo); assert.equal(g.bonusEaten, 1);
});
test('bonus expiration is exact and cannot be collected after expiry', () => {
  const g = live(); g.bonus = {x:8,y:10,remaining:FIXED_DT}; g.update(FIXED_DT);
  assert.equal(g.bonus, null); g.move(); assert.equal(g.score, 0);
  assert.equal(g.drainEvents().filter(e => e.type === 'bonus-expired').length, 1);
});
test('pause freezes movement, combo, gold countdown, elapsed time, and input', () => {
  const g = live(); g.combo = 2; g.comboRemaining = 1.5; g.bonus = {x:2,y:2,remaining:5}; g.pause();
  const before = JSON.stringify(g); step(g, 10);
  assert.equal(JSON.stringify(g), before); assert.equal(g.turn('up'), false);
  g.resume(); g.update(FIXED_DT); assert.ok(g.elapsed > 0); assert.ok(g.bonus!.remaining < 5);
});
test('crowded spawning terminates with the only free cell; full board returns null', () => {
  const g = live(); g.body = [];
  for (let y=0;y<SIZE;y++) for (let x=0;x<SIZE;x++) if (x!==19 || y!==19) g.body.push({x,y});
  g.food = null; assert.deepEqual(g.spawn('food'), {x:19,y:19});
  g.body.push({x:19,y:19}); assert.equal(g.spawn('food'), null);
});
test('filling the final cell wins cleanly', () => {
  const g = live(); const body: Cell[] = [];
  for (let y=0;y<20;y++) for (let x=0;x<20;x++) if (x!==19 || y!==0) body.push({x,y});
  const headIndex = body.findIndex(c=>c.x===18&&c.y===0); const [head] = body.splice(headIndex,1); body.unshift(head);
  place(g, body); g.food = {x:19,y:0}; g.move();
  assert.equal(g.phase, 'won'); assert.equal(g.body.length, 400); assert.equal(g.food, null); assert.equal(g.spawn('food'), null);
});
test('ordinary food takes the gold cell when it is the last free cell', () => {
  const g = live(); const body: Cell[] = [];
  for (let y=0;y<20;y++) for (let x=0;x<20;x++) if (!(y===0&&(x===18||x===19))) body.push({x,y});
  const index = body.findIndex(c=>c.x===17&&c.y===0); body.unshift(...body.splice(index,1));
  place(g,body); g.food = {x:18,y:0}; g.bonus={x:19,y:0,remaining:8}; g.move();
  assert.equal(g.phase,'playing'); assert.equal(g.bonus,null); assert.deepEqual(g.food,{x:19,y:0});
});
test('restart removes queues, pending events, bonuses, scores and old timing', () => {
  const g=live(); g.turn('up');g.combo=4;g.score=100;g.bonus={x:3,y:4,remaining:3};g.events.push({type:'death',cell:{x:2,y:2}});g.deathClock=.4;g.reset('frenzy');
  assert.equal(g.phase,'ready');assert.equal(g.mode,'frenzy');assert.equal(g.score,0);assert.equal(g.combo,0);assert.equal(g.bonus,null);assert.deepEqual(g.queue,[]);assert.deepEqual(g.events,[]);assert.equal(g.deathClock,0);assert.equal(g.body.length,4);
});
test('render frame grouping does not change simulation outcome', () => {
  function run(fps:number) {
    const g=live();g.food=null; let accumulator=0;
    for(let i=0;i<fps;i++){accumulator+=1/fps;while(accumulator+1e-9>=FIXED_DT){g.update(FIXED_DT);accumulator-=FIXED_DT;}}
    return {body:g.body,elapsed:g.elapsed,clock:g.moveClock,score:g.score};
  }
  assert.deepEqual(run(30),run(60)); assert.deepEqual(run(60),run(144));
});
test('all modes progress in speed, remain distinct, and have bounded top speed', () => {
  for (const mode of ['chill','normal','frenzy'] as Difficulty[]) { const g=live(mode);assert.equal(g.speed,MODES[mode].start);g.eaten=400;assert.equal(g.speed,MODES[mode].max);assert.equal(g.level,11); }
});
test('invalid, malicious or unavailable local storage cannot prevent play', () => {
  const bad = ['broken','null','42','{"mode":"__proto__","best":{"chill":-1,"normal":1e999,"frenzy":"99"}}'];
  for(const value of bad){const p=readPreferences({getItem:()=>value});assert.equal(p.mode,'normal');assert.equal(p.best.normal,0);}
  assert.equal(readPreferences({getItem:()=>{throw new Error('blocked');}}).sound,true);
  assert.doesNotThrow(()=>savePreferences(readPreferences({getItem:()=>null}),{setItem:()=>{throw new Error('quota');}}));
  const p=readPreferences({getItem:()=>'{"mode":"frenzy","sound":false,"effects":false,"best":{"normal":120,"frenzy":55}}'});
  assert.equal(p.mode,'frenzy');assert.equal(p.sound,false);assert.equal(p.best.normal,120);assert.equal(p.best.frenzy,55);
});

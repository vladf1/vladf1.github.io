import { MODES, type Difficulty } from './simulation.ts';
export type Preferences = { mode: Difficulty; sound: boolean; effects: boolean; best: Record<Difficulty, number> };
const KEY = 'astra-snake.v1';
export function readPreferences(storage?: Pick<Storage, 'getItem'>): Preferences {
  const defaults: Preferences = { mode: 'normal', sound: true, effects: true, best: { chill: 0, normal: 0, frenzy: 0 } };
  try {
    const value = JSON.parse((storage ?? localStorage).getItem(KEY) ?? 'null');
    if (!value || typeof value !== 'object') return defaults;
    if (typeof value.mode === 'string' && Object.hasOwn(MODES, value.mode)) defaults.mode = value.mode as Difficulty;
    if (typeof value.sound === 'boolean') defaults.sound = value.sound;
    if (typeof value.effects === 'boolean') defaults.effects = value.effects;
    for (const mode of Object.keys(MODES) as Difficulty[]) {
      const best = value.best?.[mode];
      if (Number.isSafeInteger(best) && best >= 0) defaults.best[mode] = best;
    }
  } catch { /* Storage can be blocked, corrupt, or absent. Play still works. */ }
  return defaults;
}
export function savePreferences(value: Preferences, storage?: Pick<Storage, 'setItem'>) {
  try { (storage ?? localStorage).setItem(KEY, JSON.stringify(value)); } catch { /* In-memory records remain usable. */ }
}

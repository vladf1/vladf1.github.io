import { randomBetween } from "./swarm-common.js";

export const MAX_APPLES = 128;
export const APPLE_MIN_RADIUS = 24;
export const APPLE_MAX_RADIUS = 62;
export const APPLE_MIN_ACTIVE_RADIUS = 10;
export const APPLE_GRAVITY_RADIUS_SCALE = 7.2;
export const APPLE_BITE_PERCENT_PER_SECOND = 0.00016;

export class Apple {
  constructor(random, x, y) {
    this.fullRadius = randomBetween(random, APPLE_MIN_RADIUS, APPLE_MAX_RADIUS);
    this.reset(x, y);
  }

  get radius() {
    return this.volume <= 0 ? 0 : Math.max(APPLE_MIN_ACTIVE_RADIUS, this.fullRadius * Math.cbrt(this.volume));
  }

  get gravityStrength() {
    return this.volume <= 0 ? 0 : 0.1 + 0.9 * Math.sqrt(this.volume);
  }

  get gravityRadius() {
    return this.radius * APPLE_GRAVITY_RADIUS_SCALE;
  }

  get isVisible() {
    return this.volume > 0;
  }

  reset(x, y) {
    this.x = x;
    this.y = y;
    this.volume = 1;
  }
}

export function clampApplesToViewport(apples, width, height) {
  for (const apple of apples) {
    const radius = apple.fullRadius;
    apple.x = Math.min(width - radius, Math.max(radius, apple.x));
    apple.y = Math.min(height - radius, Math.max(radius, apple.y));
  }
}

export function updateApples(apples, eaterCounts, elapsedMs) {
  for (let i = apples.length - 1; i >= 0; i--) {
    const apple = apples[i];
    const eaterCount = eaterCounts[i] ?? 0;
    if (eaterCount > 0) {
      apple.volume = Math.max(0, apple.volume - APPLE_BITE_PERCENT_PER_SECOND * elapsedMs / 1000 * eaterCount);
      if (apple.volume <= 0) {
        apples.splice(i, 1);
      }
    }
  }
}

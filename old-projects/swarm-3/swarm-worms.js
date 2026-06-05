import { randomBetween } from "./swarm-common.js";

export const DEFAULT_WORM_COUNT = 2500;
export const MAX_SAFE_WORM_COUNT = 2000000;
const TWO_PI = Math.PI * 2;

export class Worm {
  static maxVelocityPerMs = 0.36;
  static maxOffsetAmount = 10;
  static appleTurnMs = 83.33333333333333;
  static changeDirectionMs = 166.66666666666666;
  static maxRandomAngleChange = 1.5;
  static maxCrazinessPerMs = 0.018;

  constructor(random, startX, startY) {
    this.random = random;
    this.xPosition = startX;
    this.yPosition = startY;
    this.previousX = startX;
    this.previousY = startY;
    this.speed = Worm.maxVelocityPerMs * randomBetween(random, 0.4, 1);
    this.crazinessPerMs = randomBetween(random, 0, Worm.maxCrazinessPerMs);
    this.offsetX = randomBetween(random, -Worm.maxOffsetAmount, Worm.maxOffsetAmount);
    this.offsetY = randomBetween(random, -Worm.maxOffsetAmount, Worm.maxOffsetAmount);
    this.angle = randomBetween(random, 0, TWO_PI);
    this.angleStepPerMs = 0;
    this.angleChangeMsLeft = 0;
    this.xVelocity = this.speed * Math.cos(this.angle);
    this.yVelocity = this.speed * Math.sin(this.angle);
  }
}

export function createWorms(count, width, height, random) {
  const worms = [];
  for (let i = 0; i < count; i++) {
    worms.push(new Worm(random, Math.floor(randomBetween(random, 0, width)), Math.floor(randomBetween(random, 0, height))));
  }
  return worms;
}

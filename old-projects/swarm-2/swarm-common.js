export const DEFAULT_SPRITE_COUNT = 2500;
export const DEFAULT_FADE_AMOUNT = 0.1;
export const FADE_AMOUNT_PER_MS_SCALE = 0.06;
export const DEFAULT_REPEL_DISTANCE = 200;
export const MIN_REPEL_DISTANCE = 90;
export const REPEL_DISTANCE_VIEWPORT_SCALE = 0.28;
export const TWO_PI = Math.PI * 2;
export const FLOATS_PER_VERTEX = 5;
export const VERTICES_PER_LINE = 2;
export const LINE_FLOATS_PER_SPRITE = FLOATS_PER_VERTEX * VERTICES_PER_LINE;
export const RendererMode = {
  cpu: "cpu",
  webgl: "webgl",
  webgpuCompute: "webgpu-compute"
};

export class Sprite {
  static minColor = 40;
  static maxVelocityPerMs = 0.36;
  static maxOffsetAmount = 10;
  static tooFar = 650;
  static tooFarSquared = Sprite.tooFar * Sprite.tooFar;
  static minDistance = DEFAULT_REPEL_DISTANCE;
  static minDistanceSquared = Sprite.minDistance * Sprite.minDistance;
  static pointerTurnMs = 83.33333333333333;
  static changeDirectionMs = 166.66666666666666;
  static maxRandomAngleChange = 1.5;
  static maxCrazinessPerMs = 0.006;

  constructor(random, startX, startY) {
    this.random = random;
    this.xPosition = startX;
    this.yPosition = startY;
    this.previousX = startX;
    this.previousY = startY;
    this.speed = Sprite.maxVelocityPerMs * randomBetween(random, 0.4, 1);
    this.crazinessPerMs = randomBetween(random, 0, Sprite.maxCrazinessPerMs);
    this.offsetX = randomBetween(random, -Sprite.maxOffsetAmount, Sprite.maxOffsetAmount);
    this.offsetY = randomBetween(random, -Sprite.maxOffsetAmount, Sprite.maxOffsetAmount);
    this.gravityDistance = Sprite.minDistance * randomBetween(random, 0.7, 1.4);
    this.gravityDistanceSquared = this.gravityDistance * this.gravityDistance;
    this.angle = randomBetween(random, 0, TWO_PI);
    this.xVelocity = 0;
    this.yVelocity = 0;
    this.angleStepPerMs = 0;
    this.angleChangeMsLeft = 0;

    const red = Math.floor(randomBetween(random, Sprite.minColor, 255));
    const green = Math.floor(randomBetween(random, Sprite.minColor, 255));
    const blue = Math.floor(randomBetween(random, Sprite.minColor, 255));
    this.red = red / 255;
    this.green = green / 255;
    this.blue = blue / 255;
    this.updateVector();
  }

  updateVector() {
    this.xVelocity = this.speed * Math.cos(this.angle);
    this.yVelocity = this.speed * Math.sin(this.angle);
  }

  updateMotion(elapsedMs, motionState) {
    if (motionState.pointerX > 0 && motionState.pointerY > 0) {
      const pointerDeltaX = this.xPosition - motionState.pointerX;
      const pointerDeltaY = this.yPosition - motionState.pointerY;
      const distanceSquared = pointerDeltaX * pointerDeltaX + pointerDeltaY * pointerDeltaY;

      if (motionState.repelMode && distanceSquared < Sprite.minDistanceSquared) {
        this.angleChangeMsLeft = 0;
        this.angle = Math.atan2(pointerDeltaY, pointerDeltaX);
        this.updateVector();
      } else if (distanceSquared > this.gravityDistanceSquared && distanceSquared < Sprite.tooFarSquared) {
        this.angleChangeMsLeft = Sprite.pointerTurnMs;
        const targetX = motionState.pointerX - this.xPosition + this.offsetX;
        const targetY = motionState.pointerY - this.yPosition + this.offsetY;
        const newAngle = Math.atan2(targetY, targetX);
        this.angleStepPerMs = angleDifference(newAngle, this.angle) / this.angleChangeMsLeft;
      }
    }

    if (this.angleChangeMsLeft <= 0 && this.random() < this.crazinessPerMs * elapsedMs) {
      const angleChange = randomBetween(this.random, -Sprite.maxRandomAngleChange, Sprite.maxRandomAngleChange);
      this.angleStepPerMs = angleChange / Sprite.changeDirectionMs;
      this.angleChangeMsLeft = Sprite.changeDirectionMs;
    }

    if (this.angleChangeMsLeft > 0) {
      this.angle += this.angleStepPerMs * elapsedMs;
      if (this.angle < 0) {
        this.angle += TWO_PI;
      } else if (this.angle >= TWO_PI) {
        this.angle -= TWO_PI;
      }
      this.updateVector();
      this.angleChangeMsLeft -= elapsedMs;
    }

    let nextX = this.xPosition + this.xVelocity * elapsedMs;
    let nextY = this.yPosition + this.yVelocity * elapsedMs;
    let bounced = false;

    if (nextY < 0) {
      this.yPosition = 0;
      this.yVelocity *= -1;
      bounced = true;
    } else if (nextY > motionState.height) {
      this.yPosition = motionState.height;
      this.yVelocity *= -1;
      bounced = true;
    }

    if (nextX < 0) {
      this.xPosition = 0;
      this.xVelocity *= -1;
      bounced = true;
    } else if (nextX > motionState.width) {
      this.xPosition = motionState.width;
      this.xVelocity *= -1;
      bounced = true;
    }

    if (bounced) {
      nextX = this.xPosition + this.xVelocity * elapsedMs;
      nextY = this.yPosition + this.yVelocity * elapsedMs;
      this.angle = Math.atan2(this.yVelocity, this.xVelocity);
      this.angleChangeMsLeft = 0;
    }

    this.xPosition = nextX;
    this.yPosition = nextY;
  }
}

export function setSpriteInteractionDistances(width, height) {
  const viewportDistance = Math.min(width, height) * REPEL_DISTANCE_VIEWPORT_SCALE;
  Sprite.minDistance = Math.min(DEFAULT_REPEL_DISTANCE, Math.max(MIN_REPEL_DISTANCE, viewportDistance));
  Sprite.minDistanceSquared = Sprite.minDistance * Sprite.minDistance;
}

export function createSprite(random, width, height) {
  return new Sprite(random, Math.floor(randomBetween(random, 0, width)), Math.floor(randomBetween(random, 0, height)));
}

export function createSprites(count, width, height, random) {
  setSpriteInteractionDistances(width, height);
  const sprites = [];
  for (let i = 0; i < count; i++) {
    sprites.push(createSprite(random, width, height));
  }
  return sprites;
}

export function updateSprites(sprites, elapsedMs, motionState) {
  for (const sprite of sprites) {
    sprite.updateMotion(elapsedMs, motionState);
  }
}

export function createLineVertexBuffer(spriteCount) {
  return new Float32Array(spriteCount * LINE_FLOATS_PER_SPRITE);
}

export function randomBetween(random, min, max) {
  return min + (max - min) * random();
}

export function createRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const shaderTextPromises = new Map();

export function loadShaders(shaders) {
  return Promise.all(shaders.map(loadShaderText));
}

function loadShaderText(fileName) {
  let shaderPromise = shaderTextPromises.get(fileName);
  if (shaderPromise === undefined) {
    shaderPromise = fetch(new URL(`./shaders/${fileName}`, import.meta.url)).then((response) => {
      if (!response.ok) {
        throw new Error(`Unable to load shader: ${fileName}`);
      }
      return response.text();
    });
    shaderTextPromises.set(fileName, shaderPromise);
  }
  return shaderPromise;
}

function angleDifference(targetAngle, currentAngle) {
  const difference = targetAngle - currentAngle;
  if (difference > Math.PI) {
    return difference - TWO_PI;
  }
  if (difference < -Math.PI) {
    return difference + TWO_PI;
  }
  return difference;
}

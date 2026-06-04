export const DEFAULT_SPRITE_COUNT = 2500;
export const DEFAULT_FADE_AMOUNT = 0.1;
export const FADE_AMOUNT_PER_MS_SCALE = 0.06;
export const TWO_PI = Math.PI * 2;
export const VERTICES_PER_LINE = 2;

export class Sprite {
  static minColor = 40;
  static maxVelocityPerMs = 0.36;
  static maxOffsetAmount = 10;
  static attractorTurnMs = 83.33333333333333;
  static changeDirectionMs = 166.66666666666666;
  static maxRandomAngleChange = 1.5;
  static maxCrazinessPerMs = 0.018;

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
}

export function createSprite(random, width, height) {
  return new Sprite(random, Math.floor(randomBetween(random, 0, width)), Math.floor(randomBetween(random, 0, height)));
}

export function createSprites(count, width, height, random) {
  const sprites = [];
  for (let i = 0; i < count; i++) {
    sprites.push(createSprite(random, width, height));
  }
  return sprites;
}

export function randomBetween(random, min, max) {
  return min + (max - min) * random();
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

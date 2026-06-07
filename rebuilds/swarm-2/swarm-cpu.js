import { updateSprites as updateSpriteMotion } from "./swarm-common.js";

export function createCpuRenderer(canvas, width, height, renderWidth = width, renderHeight = height) {
  const renderer = {
    canvas,
    context: canvas.getContext("2d", { alpha: false }),
    width: 0,
    height: 0,
    renderWidth: 0,
    renderHeight: 0,
    renderScaleX: 1,
    renderScaleY: 1,
    bitmap: null,
    bitmapWords: null,
    resize(nextWidth, nextHeight, nextRenderWidth = nextWidth, nextRenderHeight = nextHeight) {
      this.width = nextWidth;
      this.height = nextHeight;
      this.renderWidth = nextRenderWidth;
      this.renderHeight = nextRenderHeight;
      this.renderScaleX = nextRenderWidth / nextWidth;
      this.renderScaleY = nextRenderHeight / nextHeight;
      this.canvas.width = nextRenderWidth;
      this.canvas.height = nextRenderHeight;
      this.bitmap = this.context.createImageData(nextRenderWidth, nextRenderHeight);
      this.bitmapWords = new Uint32Array(this.bitmap.data.buffer);
      this.clear();
    },
    clear() {
      this.bitmapWords.fill(0xff000000);
      this.context.putImageData(this.bitmap, 0, 0);
    },
    fade(amount) {
      fadePixels(this.bitmapWords, amount);
    },
    updateSprites(sprites, elapsedMs, motionState) {
      updateSpriteMotion(sprites, elapsedMs, motionState);
    },
    drawSprites(sprites, repelMode) {
      for (const sprite of sprites) {
        drawCpuSprite(sprite, this.bitmapWords, this.renderWidth, this.renderHeight, this.renderScaleX, this.renderScaleY, repelMode);
      }
      this.context.putImageData(this.bitmap, 0, 0);
    },
    drawFrame(sprites, motionState, repelMode, elapsedMs, fadeAmount) {
      this.fade(fadeAmount);
      this.updateSprites(sprites, elapsedMs, motionState);
      this.drawSprites(sprites, repelMode);
    }
  };
  renderer.resize(width, height, renderWidth, renderHeight);
  return renderer;
}

function drawCpuSprite(sprite, pixelWords, width, height, scaleX, scaleY, repelMode) {
  const colorWord = repelMode ? 0xffffffff : packSpriteColor(sprite);
  let endX = Math.round(sprite.xPosition * scaleX);
  let endY = Math.round(sprite.yPosition * scaleY);
  let startX = Math.round(sprite.previousX * scaleX);
  let startY = Math.round(sprite.previousY * scaleY);

  if (endX < 0) {
    endX = 0;
  } else if (endX >= width) {
    endX = width - 1;
  }
  if (endY < 0) {
    endY = 0;
  } else if (endY >= height) {
    endY = height - 1;
  }
  if (startX < 0) {
    startX = 0;
  } else if (startX >= width) {
    startX = width - 1;
  }
  if (startY < 0) {
    startY = 0;
  } else if (startY >= height) {
    startY = height - 1;
  }

  drawLine(pixelWords, width, startX, startY, endX, endY, colorWord);
  sprite.previousX = sprite.xPosition;
  sprite.previousY = sprite.yPosition;
}

function fadePixels(pixelWords, amount) {
  const clampedAmount = Math.max(0, Math.min(1, amount));
  if (clampedAmount >= 1) {
    return;
  }

  const fadeScale = (clampedAmount * 256) | 0;

  for (let index = 0; index < pixelWords.length; index++) {
    const pixel = pixelWords[index];
    pixelWords[index] =
      (pixel & 0xff000000) |
      ((((pixel & 0x00ff00ff) * fadeScale) >>> 8) & 0x00ff00ff) |
      ((((pixel & 0x0000ff00) * fadeScale) >>> 8) & 0x0000ff00);
  }
}

function drawLine(pixelWords, rowStride, startX, startY, endX, endY, colorWord) {
  let deltaX = endX - startX;
  let deltaY = endY - startY;
  let stepX = 0;
  let stepY = 0;

  if (deltaX < 0) {
    deltaX = -deltaX;
    stepX = -1;
  } else if (deltaX > 0) {
    stepX = 1;
  }

  if (deltaY < 0) {
    deltaY = -deltaY;
    stepY = -1;
  } else if (deltaY > 0) {
    stepY = 1;
  }

  const xIsLongAxis = deltaX > deltaY;
  const yPixelStep = stepY * rowStride;
  const primaryPixelStep = xIsLongAxis ? stepX : yPixelStep;
  const diagonalPixelStep = stepX + yPixelStep;
  const shortAxisDistance = xIsLongAxis ? deltaY : deltaX;
  const longAxisDistance = xIsLongAxis ? deltaX : deltaY;
  let error = longAxisDistance >> 1;
  let pixelIndex = startY * rowStride + startX;
  pixelWords[pixelIndex] = colorWord;

  for (let lineStep = 0; lineStep < longAxisDistance; lineStep++) {
    error -= shortAxisDistance;
    if (error < 0) {
      error += longAxisDistance;
      pixelIndex += diagonalPixelStep;
    } else {
      pixelIndex += primaryPixelStep;
    }
    pixelWords[pixelIndex] = colorWord;
  }
}

function packSpriteColor(sprite) {
  const red = Math.round(sprite.red * 255);
  const green = Math.round(sprite.green * 255);
  const blue = Math.round(sprite.blue * 255);
  return 0xff000000 | (blue << 16) | (green << 8) | red;
}

import {
  FLOATS_PER_VERTEX,
  LINE_FLOATS_PER_SPRITE,
  loadShaders,
  updateSprites as updateSpriteMotion
} from "./swarm-common.js";

export async function createWebglRenderer(canvas, width, height) {
  const gl = canvas.getContext("webgl", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: true
  });
  const shaders = await loadWebglShaders();
  const lineProgram = createProgram(gl, shaders.lineVertex, shaders.lineFragment);
  const fadeProgram = createProgram(gl, shaders.fadeVertex, shaders.fadeFragment);
  const renderer = {
    canvas,
    gl,
    width: 0,
    height: 0,
    lineProgram,
    fadeProgram,
    lineVertices: null,
    linePositionLocation: gl.getAttribLocation(lineProgram, "a_position"),
    lineColorLocation: gl.getAttribLocation(lineProgram, "a_color"),
    lineResolutionLocation: gl.getUniformLocation(lineProgram, "u_resolution"),
    fadePositionLocation: gl.getAttribLocation(fadeProgram, "a_position"),
    fadeAlphaLocation: gl.getUniformLocation(fadeProgram, "u_alpha"),
    lineBuffer: gl.createBuffer(),
    fadeBuffer: gl.createBuffer(),
    resize(nextWidth, nextHeight) {
      this.width = nextWidth;
      this.height = nextHeight;
      this.canvas.width = nextWidth;
      this.canvas.height = nextHeight;
      this.gl.viewport(0, 0, nextWidth, nextHeight);
      this.clear();
    },
    clear() {
      this.gl.clearColor(0, 0, 0, 1);
      this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    },
    fade(amount) {
      const fadeAlpha = Math.max(0, Math.min(1, 1 - amount));
      if (fadeAlpha <= 0) {
        return;
      }

      this.gl.useProgram(this.fadeProgram);
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.fadeBuffer);
      this.gl.enableVertexAttribArray(this.fadePositionLocation);
      this.gl.vertexAttribPointer(this.fadePositionLocation, 2, this.gl.FLOAT, false, 0, 0);
      this.gl.uniform1f(this.fadeAlphaLocation, fadeAlpha);
      this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
      this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
    },
    updateSprites(sprites, elapsedMs, motionState) {
      updateSpriteMotion(sprites, elapsedMs, motionState);
    },
    drawSprites(sprites, repelMode) {
      this.ensureLineVertexCapacity(sprites.length);
      let vertexFloatCount = 0;
      for (const sprite of sprites) {
        vertexFloatCount = writeLineVertices(sprite, this.lineVertices, vertexFloatCount, this.width, this.height, repelMode);
      }
      this.drawLines(vertexFloatCount);
    },
    drawLines(vertexFloatCount) {
      if (vertexFloatCount === 0) {
        return;
      }

      this.gl.useProgram(this.lineProgram);
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.lineBuffer);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, this.lineVertices.subarray(0, vertexFloatCount), this.gl.DYNAMIC_DRAW);
      this.gl.enableVertexAttribArray(this.linePositionLocation);
      this.gl.vertexAttribPointer(this.linePositionLocation, 2, this.gl.FLOAT, false, FLOATS_PER_VERTEX * 4, 0);
      this.gl.enableVertexAttribArray(this.lineColorLocation);
      this.gl.vertexAttribPointer(this.lineColorLocation, 3, this.gl.FLOAT, false, FLOATS_PER_VERTEX * 4, 2 * 4);
      this.gl.uniform2f(this.lineResolutionLocation, this.width, this.height);
      this.gl.blendFunc(this.gl.ONE, this.gl.ZERO);
      this.gl.drawArrays(this.gl.LINES, 0, vertexFloatCount / FLOATS_PER_VERTEX);
    },
    finish() {
      this.gl.finish();
    },
    ensureLineVertexCapacity(spriteCount) {
      if (this.lineVertices !== null && this.lineVertices.length >= spriteCount * LINE_FLOATS_PER_SPRITE) {
        return;
      }

      this.lineVertices = new Float32Array(spriteCount * LINE_FLOATS_PER_SPRITE);
    },
    drawFrame(sprites, motionState, repelMode, elapsedMs, fadeAmount) {
      this.fade(fadeAmount);
      this.updateSprites(sprites, elapsedMs, motionState);
      this.drawSprites(sprites, repelMode);
    }
  };

  gl.bindBuffer(gl.ARRAY_BUFFER, renderer.fadeBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,
    1, -1,
    -1, 1,
    -1, 1,
    1, -1,
    1, 1
  ]), gl.STATIC_DRAW);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.enable(gl.BLEND);
  renderer.resize(width, height);
  return renderer;
}

function createProgram(gl, vertexSource, fragmentSource) {
  const program = gl.createProgram();
  gl.attachShader(program, createShader(gl, gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, createShader(gl, gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  return program;
}

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}

async function loadWebglShaders() {
  const [lineVertex, lineFragment, fadeVertex, fadeFragment] = await loadShaders([
    "webgl-line.vert",
    "webgl-line.frag",
    "webgl-fade.vert",
    "webgl-fade.frag"
  ]);
  return { lineVertex, lineFragment, fadeVertex, fadeFragment };
}

function writeLineVertices(sprite, vertices, index, width, height, repelMode) {
  const red = repelMode ? 1 : sprite.red;
  const green = repelMode ? 1 : sprite.green;
  const blue = repelMode ? 1 : sprite.blue;
  let endX = sprite.xPosition;
  let endY = sprite.yPosition;
  let startX = sprite.previousX;
  let startY = sprite.previousY;

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

  vertices[index++] = startX;
  vertices[index++] = startY;
  vertices[index++] = red;
  vertices[index++] = green;
  vertices[index++] = blue;
  vertices[index++] = endX;
  vertices[index++] = endY;
  vertices[index++] = red;
  vertices[index++] = green;
  vertices[index++] = blue;
  sprite.previousX = sprite.xPosition;
  sprite.previousY = sprite.yPosition;

  return index;
}

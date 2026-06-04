export const DEFAULT_FADE_AMOUNT = 0.1;
export const FADE_AMOUNT_PER_MS_SCALE = 0.06;

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

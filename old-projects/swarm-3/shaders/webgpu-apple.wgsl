const TWO_PI = 6.283185307179586;
const WORKGROUP_SIZE = 64u;
const APPLE_RADIUS_SEGMENTS = 96u;
const VERTICES_PER_APPLE_MARKER = APPLE_RADIUS_SEGMENTS * 2u + 16u;
const APPLE_STEM_SIZE = 12.0;
const APPLE_HEALTH_BAR_WIDTH = 42.0;
const APPLE_HEALTH_BAR_HEIGHT = 6.0;
const APPLE_HEALTH_BAR_Y_OFFSET = 14.0;
const APPLE_MAX_RADIUS = 62.0;

struct SimParams {
  canvasWormsApples: vec4f,
  elapsedDistances: vec4f,
  turn: vec4f,
  reserved: vec4f,
};

struct Apple {
  position: vec2f,
  volume: f32,
  radius: f32,
};

struct LineVertex {
  position: vec2f,
  color: vec4f,
};

struct FreeList {
  count: atomic<u32>,
};

struct Placement {
  position: vec2f,
  volume: f32,
  radius: f32,
};

@group(0) @binding(0) var<storage, read_write> apples: array<Apple>;
@group(0) @binding(1) var<storage, read_write> appleEaters: array<atomic<u32>>;
@group(0) @binding(2) var<storage, read_write> vertices: array<LineVertex>;
@group(0) @binding(3) var<uniform> params: SimParams;
@group(0) @binding(4) var<storage, read_write> freeSlots: array<u32>;
@group(0) @binding(5) var<storage, read_write> freeList: FreeList;
@group(0) @binding(6) var<storage, read> placements: array<Placement>;

fn appleRadius(volume: f32, minRadius: f32, maxRadius: f32) -> f32 {
  if (volume <= 0.0) {
    return 0.0;
  }
  return max(minRadius, maxRadius * pow(volume, 1.0 / 3.0));
}

fn writeMarkerVertex(vertexIndex: u32, position: vec2f, color: vec4f) {
  vertices[vertexIndex] = LineVertex(position, color);
}

fn clearAppleVertices(baseVertex: u32) {
  let hidden = LineVertex(vec2f(0.0, 0.0), vec4f(0.0, 0.0, 0.0, 0.0));
  for (var vertexIndex = 0u; vertexIndex < VERTICES_PER_APPLE_MARKER; vertexIndex++) {
    vertices[baseVertex + vertexIndex] = hidden;
  }
}

fn writeAppleVertices(baseVertex: u32, center: vec2f, radius: f32, volume: f32) {
  let appleColor = vec4f(1.0, 0.12, 0.22, 0.88);
  var vertexIndex = baseVertex;
  for (var segment = 0u; segment < APPLE_RADIUS_SEGMENTS; segment++) {
    let startAngle = f32(segment) / f32(APPLE_RADIUS_SEGMENTS) * TWO_PI;
    let endAngle = f32(segment + 1u) / f32(APPLE_RADIUS_SEGMENTS) * TWO_PI;
    writeMarkerVertex(
      vertexIndex,
      center + vec2f(cos(startAngle), sin(startAngle)) * radius,
      appleColor
    );
    vertexIndex++;
    writeMarkerVertex(
      vertexIndex,
      center + vec2f(cos(endAngle), sin(endAngle)) * radius,
      appleColor
    );
    vertexIndex++;
  }

  writeMarkerVertex(vertexIndex, center + vec2f(0.0, -radius * 0.92), vec4f(0.36, 0.18, 0.07, 0.95));
  vertexIndex++;
  writeMarkerVertex(vertexIndex, center + vec2f(APPLE_STEM_SIZE * 0.25, -radius - APPLE_STEM_SIZE), vec4f(0.36, 0.18, 0.07, 0.95));
  vertexIndex++;

  let health = clamp(volume, 0.0, 1.0);
  let left = center.x - APPLE_HEALTH_BAR_WIDTH * 0.5;
  let right = center.x + APPLE_HEALTH_BAR_WIDTH * 0.5;
  let fillLeft = left + 2.0;
  let fillWidth = max(0.0, APPLE_HEALTH_BAR_WIDTH - 4.0);
  let fillRight = fillLeft + fillWidth * health;
  let top = center.y - APPLE_MAX_RADIUS - APPLE_HEALTH_BAR_Y_OFFSET;
  let bottom = top + APPLE_HEALTH_BAR_HEIGHT;
  let outlineColor = vec4f(0.02, 0.02, 0.02, 0.88);
  let fillColor = mix(vec4f(1.0, 0.08, 0.04, 0.96), vec4f(0.35, 1.0, 0.16, 0.96), health);

  writeMarkerVertex(vertexIndex, vec2f(left, top), outlineColor);
  vertexIndex++;
  writeMarkerVertex(vertexIndex, vec2f(right, top), outlineColor);
  vertexIndex++;
  writeMarkerVertex(vertexIndex, vec2f(right, top), outlineColor);
  vertexIndex++;
  writeMarkerVertex(vertexIndex, vec2f(right, bottom), outlineColor);
  vertexIndex++;
  writeMarkerVertex(vertexIndex, vec2f(right, bottom), outlineColor);
  vertexIndex++;
  writeMarkerVertex(vertexIndex, vec2f(left, bottom), outlineColor);
  vertexIndex++;
  writeMarkerVertex(vertexIndex, vec2f(left, bottom), outlineColor);
  vertexIndex++;
  writeMarkerVertex(vertexIndex, vec2f(left, top), outlineColor);
  vertexIndex++;
  writeMarkerVertex(vertexIndex, vec2f(fillLeft, top + 2.0), fillColor);
  vertexIndex++;
  writeMarkerVertex(vertexIndex, vec2f(fillRight, top + 2.0), fillColor);
  vertexIndex++;
  writeMarkerVertex(vertexIndex, vec2f(fillLeft, top + 3.0), fillColor);
  vertexIndex++;
  writeMarkerVertex(vertexIndex, vec2f(fillRight, top + 3.0), fillColor);
  vertexIndex++;
  writeMarkerVertex(vertexIndex, vec2f(fillLeft, top + 4.0), fillColor);
  vertexIndex++;
  writeMarkerVertex(vertexIndex, vec2f(fillRight, top + 4.0), fillColor);
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn computeMain(@builtin(global_invocation_id) id: vec3u) {
  let index = id.x;
  let appleCount = u32(params.canvasWormsApples.w);
  if (index >= appleCount) {
    return;
  }

  let baseVertex = index * VERTICES_PER_APPLE_MARKER;
  var apple = apples[index];
  let eaterCount = atomicLoad(&appleEaters[index]);
  atomicStore(&appleEaters[index], 0u);

  if (apple.volume <= 0.0 || apple.radius <= 0.0) {
    clearAppleVertices(baseVertex);
    return;
  }

  let maxRadius = params.elapsedDistances.w;
  let minPosition = vec2f(maxRadius, maxRadius);
  let maxPosition = max(params.canvasWormsApples.xy - minPosition, minPosition);
  apple.position = clamp(apple.position, minPosition, maxPosition);

  if (eaterCount > 0u) {
    apple.volume = max(
      0.0,
      apple.volume - params.elapsedDistances.y * params.elapsedDistances.x / 1000.0 * f32(eaterCount)
    );
    apple.radius = appleRadius(apple.volume, params.elapsedDistances.z, maxRadius);
    apples[index] = apple;
  }

  if (apple.volume <= 0.0 || apple.radius <= 0.0) {
    apples[index] = Apple(vec2f(0.0, 0.0), 0.0, 0.0);
    clearAppleVertices(baseVertex);
    let freeIndex = atomicAdd(&freeList.count, 1u);
    if (freeIndex < appleCount) {
      freeSlots[freeIndex] = index;
    }
    return;
  }

  writeAppleVertices(baseVertex, apple.position, apple.radius, apple.volume);
}

@compute @workgroup_size(1)
fn placementMain(@builtin(global_invocation_id) id: vec3u) {
  if (id.x > 0u) {
    return;
  }

  let appleCount = u32(params.canvasWormsApples.w);
  let placementCount = u32(params.reserved.x);
  var freeCount = atomicLoad(&freeList.count);

  for (var placementIndex = 0u; placementIndex < placementCount; placementIndex++) {
    if (freeCount == 0u) {
      break;
    }

    freeCount--;
    let appleIndex = freeSlots[freeCount];
    if (appleIndex >= appleCount) {
      continue;
    }

    let placement = placements[placementIndex];
    let baseVertex = appleIndex * VERTICES_PER_APPLE_MARKER;
    apples[appleIndex] = Apple(placement.position, placement.volume, placement.radius);
    writeAppleVertices(baseVertex, placement.position, placement.radius, placement.volume);
  }

  atomicStore(&freeList.count, freeCount);
}

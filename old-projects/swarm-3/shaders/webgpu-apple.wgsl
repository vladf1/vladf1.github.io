const TWO_PI = 6.283185307179586;
const WORKGROUP_SIZE = 64u;
const APPLE_RADIUS_SEGMENTS = 96u;
const VERTICES_PER_APPLE_MARKER = APPLE_RADIUS_SEGMENTS * 2u + 2u;
const APPLE_STEM_SIZE = 12.0;

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

@group(0) @binding(0) var<storage, read_write> apples: array<Apple>;
@group(0) @binding(1) var<storage, read_write> appleEaters: array<atomic<u32>>;
@group(0) @binding(2) var<storage, read_write> vertices: array<LineVertex>;
@group(0) @binding(3) var<uniform> params: SimParams;

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

fn writeAppleVertices(baseVertex: u32, center: vec2f, radius: f32) {
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

  if (eaterCount > 0u && apple.volume > 0.0) {
    let elapsedMs = params.elapsedDistances.x;
    let bitePercentPerSecond = params.elapsedDistances.y;
    apple.volume = max(0.0, apple.volume - bitePercentPerSecond * elapsedMs / 1000.0 * f32(eaterCount));
    apple.radius = appleRadius(apple.volume, params.elapsedDistances.z, params.elapsedDistances.w);
    apples[index] = apple;
  }

  if (apple.volume <= 0.0 || apple.radius <= 0.0) {
    clearAppleVertices(baseVertex);
    return;
  }

  writeAppleVertices(baseVertex, apple.position, apple.radius);
}

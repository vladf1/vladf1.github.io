struct Resolution {
  size: vec2f,
};

struct Preview {
  center: vec2f,
  visible: f32,
  padding: f32,
};

@group(0) @binding(0) var<uniform> resolution: Resolution;
@group(0) @binding(1) var<uniform> preview: Preview;

struct VertexInput {
  @location(0) position: vec2f,
  @location(1) color: vec4f,
};

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
};

const APPLE_MAX_RADIUS = 62.0;
const APPLE_GRAVITY_RADIUS_SCALE = 7.2;
const REPELLENT_RADIUS = 220.0;
const REPELLENT_BURST_RADIUS = 34.0;
const REPELLENT_BURST_RAYS = 8u;
const APPLE_RADIUS_SEGMENTS = 96u;
const TWO_PI = 6.283185307179586;

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  let zeroToOne = input.position / resolution.size;
  let clipSpace = zeroToOne * 2.0 - vec2f(1.0, 1.0);
  output.position = vec4f(clipSpace.x, -clipSpace.y, 0.0, 1.0);
  output.color = input.color;
  return output;
}

@vertex
fn previewVertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  let verticesPerRing = APPLE_RADIUS_SEGMENTS * 2u;
  let ringIndex = vertexIndex / verticesPerRing;
  let segmentIndex = (vertexIndex % verticesPerRing) / 2u;
  let endpointIndex = vertexIndex % 2u;
  let angle = (f32(segmentIndex + endpointIndex) / f32(APPLE_RADIUS_SEGMENTS)) * TWO_PI;
  let rayAngle = f32(segmentIndex) / f32(REPELLENT_BURST_RAYS) * TWO_PI;
  let appleRadius = select(APPLE_MAX_RADIUS * APPLE_GRAVITY_RADIUS_SCALE, APPLE_MAX_RADIUS, ringIndex == 1u);
  let repellentRingPosition = preview.center + vec2f(cos(angle), sin(angle)) * REPELLENT_RADIUS;
  let repellentBurstPosition = preview.center + vec2f(cos(rayAngle), sin(rayAngle)) * REPELLENT_BURST_RADIUS * f32(endpointIndex);
  let applePosition = preview.center + vec2f(cos(angle), sin(angle)) * appleRadius;
  let repellentPosition = select(repellentRingPosition, repellentBurstPosition, ringIndex == 1u);
  let canvasPosition = select(applePosition, repellentPosition, preview.padding > 0.0);
  let zeroToOne = canvasPosition / resolution.size;
  let clipSpace = zeroToOne * 2.0 - vec2f(1.0, 1.0);
  let outerColor = vec4f(1.0, 0.9, 0.15, 0.42);
  let innerColor = vec4f(1.0, 0.12, 0.22, 0.62);
  let repellentOuterColor = vec4f(0.12, 0.88, 1.0, 0.82);
  let repellentInnerColor = vec4f(0.72, 0.96, 1.0, 0.72);
  let appleColor = select(outerColor, innerColor, ringIndex == 1u);
  let repellentColor = select(repellentOuterColor, repellentInnerColor, ringIndex == 1u);
  let repellentVisible = select(select(1.0, 0.0, segmentIndex >= REPELLENT_BURST_RAYS), 1.0, ringIndex == 0u);

  var output: VertexOutput;
  output.position = vec4f(clipSpace.x, -clipSpace.y, 0.0, 1.0);
  output.color = select(appleColor, repellentColor * repellentVisible, preview.padding > 0.0) * preview.visible;
  return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  return input.color;
}

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
  let radius = select(APPLE_MAX_RADIUS * APPLE_GRAVITY_RADIUS_SCALE, APPLE_MAX_RADIUS, ringIndex == 1u);
  let canvasPosition = preview.center + vec2f(cos(angle), sin(angle)) * radius;
  let zeroToOne = canvasPosition / resolution.size;
  let clipSpace = zeroToOne * 2.0 - vec2f(1.0, 1.0);
  let outerColor = vec4f(1.0, 0.9, 0.15, 0.16);
  let innerColor = vec4f(1.0, 0.12, 0.22, 0.62);

  var output: VertexOutput;
  output.position = vec4f(clipSpace.x, -clipSpace.y, 0.0, 1.0);
  output.color = select(outerColor, innerColor, ringIndex == 1u) * preview.visible;
  return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  return input.color;
}

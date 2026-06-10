struct Ball {
  positionRadius: vec4f,
  velocity: vec4f,
  color: vec4f,
};

struct Resolution {
  size: vec2f,
};

@group(0) @binding(0) var<storage, read> balls: array<Ball>;
@group(0) @binding(1) var<uniform> resolution: Resolution;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
};

const SEGMENTS = 40u;
const VERTICES_PER_BALL = SEGMENTS * 3u;
const TWO_PI = 6.283185307179586;

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  let ballIndex = vertexIndex / VERTICES_PER_BALL;
  let localIndex = vertexIndex % VERTICES_PER_BALL;
  let segmentIndex = localIndex / 3u;
  let pointIndex = localIndex % 3u;

  let ball = balls[ballIndex];
  let center = ball.positionRadius.xy;
  let radius = ball.positionRadius.z;
  let startAngle = f32(segmentIndex) / f32(SEGMENTS) * TWO_PI;
  let endAngle = f32(segmentIndex + 1u) / f32(SEGMENTS) * TWO_PI;

  var canvasPosition = center;
  if (pointIndex == 1u) {
    canvasPosition = center + vec2f(cos(startAngle), sin(startAngle)) * radius;
  } else if (pointIndex == 2u) {
    canvasPosition = center + vec2f(cos(endAngle), sin(endAngle)) * radius;
  }

  let zeroToOne = canvasPosition / resolution.size;
  let clipSpace = zeroToOne * 2.0 - vec2f(1.0, 1.0);

  var output: VertexOutput;
  output.position = vec4f(clipSpace.x, -clipSpace.y, 0.0, 1.0);
  output.color = ball.color;
  return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  return input.color;
}

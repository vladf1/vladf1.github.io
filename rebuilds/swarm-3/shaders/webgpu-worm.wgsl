struct RenderInfo {
  resolution: vec2f,
  counts: vec2f,
};

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
};

@group(0) @binding(0) var<storage, read> segmentPositions: array<vec2f>;
@group(0) @binding(1) var<storage, read> colors: array<vec4f>;
@group(0) @binding(2) var<uniform> renderInfo: RenderInfo;

fn clipPosition(canvasPosition: vec2f) -> vec4f {
  let zeroToOne = canvasPosition / renderInfo.resolution;
  let clipSpace = zeroToOne * 2.0 - vec2f(1.0, 1.0);
  return vec4f(clipSpace.x, -clipSpace.y, 0.0, 1.0);
}

@vertex
fn vertexMain(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32
) -> VertexOutput {
  let segmentCount = max(1u, u32(renderInfo.counts.x));
  let segmentNodeCount = max(segmentCount + 1u, u32(renderInfo.counts.y));
  let wormIndex = instanceIndex;
  let segmentIndex = vertexIndex >> 1u;
  let endpointIndex = vertexIndex & 1u;
  let baseOffset = wormIndex * segmentNodeCount;
  let startPosition = segmentPositions[baseOffset + segmentIndex];
  let endPosition = segmentPositions[baseOffset + segmentIndex + 1u];
  let canvasPosition = select(startPosition, endPosition, endpointIndex == 1u);
  let baseColor = colors[wormIndex];
  let segmentT = select(0.0, f32(segmentIndex) / f32(max(segmentCount - 1u, 1u)), segmentCount > 1u);
  let fade = pow(1.0 - segmentT, 1.28);
  let intensity = 0.12 + 0.88 * fade;
  let alpha = baseColor.a * (0.08 + 0.92 * fade);

  var output: VertexOutput;
  output.position = clipPosition(canvasPosition);
  output.color = vec4f(baseColor.rgb * intensity, alpha);
  return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  return input.color;
}

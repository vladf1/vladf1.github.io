struct Resolution {
  size: vec2f,
};

@group(0) @binding(0) var<uniform> resolution: Resolution;

struct VertexInput {
  @location(0) position: vec2f,
  @location(1) color: vec4f,
};

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
};

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  let zeroToOne = input.position / resolution.size;
  let clipSpace = zeroToOne * 2.0 - vec2f(1.0, 1.0);
  output.position = vec4f(clipSpace.x, -clipSpace.y, 0.0, 1.0);
  output.color = input.color;
  return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  return input.color;
}

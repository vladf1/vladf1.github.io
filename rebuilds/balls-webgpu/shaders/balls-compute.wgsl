struct Ball {
  positionRadius: vec4f,
  velocity: vec4f,
  color: vec4f,
};

struct Params {
  sizeElapsedCount: vec4f,
  repellent: vec4f,
};

@group(0) @binding(0) var<storage, read> ballsIn: array<Ball>;
@group(0) @binding(1) var<storage, read_write> ballsOut: array<Ball>;
@group(0) @binding(2) var<uniform> params: Params;

const MAX_SPEED = 1.5;

fn is_collided(ax: f32, ay: f32, ar: f32, bx: f32, by: f32, br: f32) -> bool {
  let dx = ax - bx;
  let dy = ay - by;
  let distance = ar + br;
  return dx * dx + dy * dy < distance * distance;
}

fn direction_from(delta: vec2f) -> vec2f {
  let distance = length(delta);
  if (distance < 0.0001) {
    return vec2f(1.0, 0.0);
  }
  return delta / distance;
}

fn limit_velocity(velocity: vec2f) -> vec2f {
  let speed = length(velocity);
  if (speed > MAX_SPEED) {
    return velocity / speed * MAX_SPEED;
  }
  return velocity;
}

@compute @workgroup_size(64)
fn computeMain(@builtin(global_invocation_id) globalId: vec3u) {
  let index = globalId.x;
  let ballCount = u32(params.sizeElapsedCount.w);
  if (index >= ballCount) {
    return;
  }

  let input = ballsIn[index];
  let radius = input.positionRadius.z;
  var position = input.positionRadius.xy;
  var velocity = input.velocity.xy;

  for (var otherIndex = 0u; otherIndex < ballCount; otherIndex++) {
    if (otherIndex == index) {
      continue;
    }

    let other = ballsIn[otherIndex];
    let otherRadius = other.positionRadius.z;
    if (!is_collided(position.x, position.y, radius, other.positionRadius.x, other.positionRadius.y, otherRadius)) {
      continue;
    }

    let combinedSpeed = length(velocity) + length(other.velocity.xy) * 0.98;
    let thisBallRatio = 1.0 - radius / (radius + otherRadius);
    velocity = limit_velocity(direction_from(position - other.positionRadius.xy) * combinedSpeed * thisBallRatio);
  }

  if (params.repellent.w > 0.0) {
    let repellentPosition = params.repellent.xy;
    let repellentRadius = params.repellent.z;
    if (is_collided(position.x, position.y, radius, repellentPosition.x, repellentPosition.y, repellentRadius)) {
      velocity = limit_velocity(direction_from(position - repellentPosition) * params.repellent.w);
    }
  }

  let canvasSize = params.sizeElapsedCount.xy;
  let elapsedMs = params.sizeElapsedCount.z;
  var change = velocity * elapsedMs;

  if (position.y + change.y - radius < 0.0) {
    position.y = radius;
    change.y *= -1.0;
    velocity.y *= -1.0;
  } else if (position.y + change.y + radius > canvasSize.y) {
    position.y = canvasSize.y - radius;
    change.y *= -1.0;
    velocity.y *= -1.0;
  }

  if (position.x + change.x - radius < 0.0) {
    position.x = radius;
    change.x *= -1.0;
    velocity.x *= -1.0;
  } else if (position.x + change.x + radius > canvasSize.x) {
    position.x = canvasSize.x - radius;
    change.x *= -1.0;
    velocity.x *= -1.0;
  }

  position += change;
  position = clamp(position, vec2f(radius), canvasSize - vec2f(radius));

  ballsOut[index].positionRadius = vec4f(position, radius, 0.0);
  ballsOut[index].velocity = vec4f(velocity, 0.0, 0.0);
  ballsOut[index].color = input.color;
}

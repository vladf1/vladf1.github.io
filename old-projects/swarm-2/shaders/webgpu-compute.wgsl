const TWO_PI = 6.283185307179586;
const WORKGROUP_SIZE = 256u;

struct SimParams {
  canvasPointer: vec4f,
  elapsedDistances: vec4f,
  turn: vec4f,
};

struct LineVertex {
  position: vec2f,
  color: vec4f,
};

@group(0) @binding(0) var<storage, read_write> positions: array<vec4f>;
@group(0) @binding(1) var<storage, read_write> motionA: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> motionB: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> motionC: array<vec4f>;
@group(0) @binding(4) var<storage, read> colors: array<vec4f>;
@group(0) @binding(5) var<storage, read_write> randomStates: array<u32>;
@group(0) @binding(6) var<storage, read_write> vertices: array<LineVertex>;
@group(0) @binding(7) var<uniform> params: SimParams;

fn randomUnit(index: u32) -> f32 {
  let next = randomStates[index] * 1664525u + 1013904223u;
  randomStates[index] = next;
  return f32(next) / 4294967296.0;
}

fn randomBetween(index: u32, minimum: f32, maximum: f32) -> f32 {
  return minimum + (maximum - minimum) * randomUnit(index);
}

fn angleDifference(targetAngle: f32, currentAngle: f32) -> f32 {
  let difference = targetAngle - currentAngle;
  if (difference > 3.141592653589793) {
    return difference - TWO_PI;
  }
  if (difference < -3.141592653589793) {
    return difference + TWO_PI;
  }
  return difference;
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn computeMain(@builtin(global_invocation_id) id: vec3u) {
  let index = id.x;
  let spriteCount = u32(params.turn.w);
  if (index >= spriteCount) {
    return;
  }

  let width = params.canvasPointer.x;
  let height = params.canvasPointer.y;
  let pointerX = params.canvasPointer.z;
  let pointerY = params.canvasPointer.w;
  let elapsedMs = params.elapsedDistances.x;
  let minDistanceSquared = params.elapsedDistances.y;
  let tooFarSquared = params.elapsedDistances.z;
  let repelMode = params.elapsedDistances.w > 0.5;
  let pointerTurnMs = params.turn.x;
  let changeDirectionMs = params.turn.y;
  let maxRandomAngleChange = params.turn.z;

  var position = positions[index];
  var velocity = motionA[index].xy;
  let speed = motionA[index].z;
  let crazinessPerMs = motionA[index].w;
  let offset = motionB[index].xy;
  let gravityDistanceSquared = motionB[index].z;
  var angle = motionB[index].w;
  var angleStepPerMs = motionC[index].x;
  var angleChangeMsLeft = motionC[index].y;
  let startPosition = position.xy;

  if (pointerX > 0.0 && pointerY > 0.0) {
    let pointerDelta = position.xy - vec2f(pointerX, pointerY);
    let distanceSquared = dot(pointerDelta, pointerDelta);

    if (repelMode && distanceSquared < minDistanceSquared) {
      angleChangeMsLeft = 0.0;
      angle = atan2(pointerDelta.y, pointerDelta.x);
      velocity = vec2f(speed * cos(angle), speed * sin(angle));
    } else if (distanceSquared > gravityDistanceSquared && distanceSquared < tooFarSquared) {
      angleChangeMsLeft = pointerTurnMs;
      let targetVector = vec2f(pointerX, pointerY) - position.xy + offset;
      let newAngle = atan2(targetVector.y, targetVector.x);
      angleStepPerMs = angleDifference(newAngle, angle) / angleChangeMsLeft;
    }
  }

  if (angleChangeMsLeft <= 0.0 && randomUnit(index) < crazinessPerMs * elapsedMs) {
    let angleChange = randomBetween(index, -maxRandomAngleChange, maxRandomAngleChange);
    angleStepPerMs = angleChange / changeDirectionMs;
    angleChangeMsLeft = changeDirectionMs;
  }

  if (angleChangeMsLeft > 0.0) {
    angle += angleStepPerMs * elapsedMs;
    if (angle < 0.0) {
      angle += TWO_PI;
    } else if (angle >= TWO_PI) {
      angle -= TWO_PI;
    }
    velocity = vec2f(speed * cos(angle), speed * sin(angle));
    angleChangeMsLeft -= elapsedMs;
  }

  var nextPosition = position.xy + velocity * elapsedMs;
  var bounced = false;

  if (nextPosition.y < 0.0) {
    position.y = 0.0;
    velocity.y *= -1.0;
    bounced = true;
  } else if (nextPosition.y > height) {
    position.y = height;
    velocity.y *= -1.0;
    bounced = true;
  }

  if (nextPosition.x < 0.0) {
    position.x = 0.0;
    velocity.x *= -1.0;
    bounced = true;
  } else if (nextPosition.x > width) {
    position.x = width;
    velocity.x *= -1.0;
    bounced = true;
  }

  if (bounced) {
    nextPosition = position.xy + velocity * elapsedMs;
    angle = atan2(velocity.y, velocity.x);
    angleChangeMsLeft = 0.0;
  }

  let clampedStart = clamp(startPosition, vec2f(0.0, 0.0), vec2f(width - 1.0, height - 1.0));
  let clampedEnd = clamp(nextPosition, vec2f(0.0, 0.0), vec2f(width - 1.0, height - 1.0));
  let color = select(colors[index], vec4f(1.0, 1.0, 1.0, 1.0), repelMode);
  vertices[index * 2u] = LineVertex(clampedStart, color);
  vertices[index * 2u + 1u] = LineVertex(clampedEnd, color);

  positions[index] = vec4f(nextPosition, nextPosition);
  motionA[index] = vec4f(velocity, speed, crazinessPerMs);
  motionB[index] = vec4f(offset, gravityDistanceSquared, angle);
  motionC[index] = vec4f(angleStepPerMs, angleChangeMsLeft, 0.0, 0.0);
}

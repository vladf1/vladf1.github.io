const TWO_PI = 6.283185307179586;
const WORKGROUP_SIZE = 256u;
const APPLE_GRAVITY_RADIUS_SCALE = 7.2;

struct SimParams {
  canvasWormsApples: vec4f,
  elapsedDistances: vec4f,
  turn: vec4f,
  reserved: vec4f,
  cursorRepellent: vec4f,
};

struct LineVertex {
  position: vec2f,
  color: u32,
};

struct Apple {
  position: vec2f,
  volume: f32,
  radius: f32,
};

@group(0) @binding(1) var<storage, read_write> motionA: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> motionB: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> motionC: array<vec4f>;
@group(0) @binding(4) var<storage, read_write> randomStates: array<u32>;
@group(0) @binding(5) var<storage, read_write> vertices: array<LineVertex>;
@group(0) @binding(6) var<uniform> params: SimParams;
@group(0) @binding(7) var<storage, read> apples: array<Apple>;
@group(0) @binding(8) var<storage, read_write> appleEaters: array<atomic<u32>>;

fn randomUnit(index: u32) -> f32 {
  let next = randomStates[index] * 1664525u + 1013904223u;
  randomStates[index] = next;
  return f32(next) / 4294967296.0;
}

fn randomBetween(index: u32, minimum: f32, maximum: f32) -> f32 {
  return minimum + (maximum - minimum) * randomUnit(index);
}

fn colorUnit(seed: u32) -> f32 {
  return f32(seed & 255u) / 255.0;
}

fn wormColor(index: u32) -> vec4f {
  let hashed = index * 747796405u + 2891336453u;
  return vec4f(
    0.28 + 0.72 * colorUnit(hashed),
    0.28 + 0.72 * colorUnit(hashed >> 8u),
    0.28 + 0.72 * colorUnit(hashed >> 16u),
    0.86
  );
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
fn initMain(@builtin(global_invocation_id) id: vec3u) {
  let initStart = u32(params.reserved.x);
  let initEnd = u32(params.reserved.y);
  let index = initStart + id.x;
  if (index >= initEnd) {
    return;
  }

  let width = params.canvasWormsApples.x;
  let height = params.canvasWormsApples.y;
  randomStates[index] = (0x9e3779b9u ^ (index * 747796405u) ^ initEnd) | 1u;

  let startX = floor(randomBetween(index, 0.0, width));
  let startY = floor(randomBetween(index, 0.0, height));
  let speed = 0.36 * randomBetween(index, 0.4, 1.0);
  let crazinessPerMs = randomBetween(index, 0.0, 0.018);
  let offsetX = randomBetween(index, -10.0, 10.0);
  let offsetY = randomBetween(index, -10.0, 10.0);
  let angle = randomBetween(index, 0.0, TWO_PI);
  let velocity = vec2f(speed * cos(angle), speed * sin(angle));

  motionA[index] = vec4f(startX, startY, velocity);
  motionB[index] = vec4f(angle, 0.0, 0.0, 0.0);
  motionC[index] = vec4f(speed, crazinessPerMs, offsetX, offsetY);
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn computeMain(@builtin(global_invocation_id) id: vec3u) {
  let index = id.x;
  let wormCount = u32(params.canvasWormsApples.z);
  if (index >= wormCount) {
    return;
  }

  let width = params.canvasWormsApples.x;
  let height = params.canvasWormsApples.y;
  let appleCount = u32(params.canvasWormsApples.w);
  let elapsedMs = params.elapsedDistances.x;
  let speedScale = params.reserved.y;
  let appleTurnMs = params.turn.x;
  let changeDirectionMs = params.turn.y;
  let maxRandomAngleChange = params.turn.z;
  let crazinessScale = params.turn.w;
  let cursorRepellentPosition = params.cursorRepellent.xy;
  let cursorRepellentActive = params.cursorRepellent.z;
  let cursorRepellentRadius = params.cursorRepellent.w;
  let renderTriangles = params.reserved.w > 0.5;

  let dynamicMotionA = motionA[index];
  let dynamicMotionB = motionB[index];
  let staticMotion = motionC[index];
  var position = dynamicMotionA.xy;
  var velocity = dynamicMotionA.zw;
  let speed = staticMotion.x;
  let crazinessPerMs = staticMotion.y;
  let offset = staticMotion.zw;
  var angle = dynamicMotionB.x;
  var angleStepPerMs = dynamicMotionB.y;
  var angleChangeMsLeft = dynamicMotionB.z;
  let startPosition = position.xy;
  var attraction = vec2f(0.0, 0.0);
  var strongestPull = 0.0;
  var appleGlow = 0.0;
  var eatingGlow = 0.0;
  var repellentGlow = 0.0;

  if (appleCount > 0u) {
    var secondAttraction = vec2f(0.0, 0.0);
    var secondPull = 0.0;
    var eatenAppleIndex = appleCount;
    var eatenAppleDistanceSquared = 1e30;
    for (var appleIndex = 0u; appleIndex < appleCount; appleIndex++) {
      let apple = apples[appleIndex];
      if (apple.radius <= 0.0 || apple.volume <= 0.0) {
        continue;
      }

      let appleStrength = 0.1 + 0.9 * sqrt(apple.volume);
      let appleDelta = apple.position - position.xy;
      let appleDistanceSquared = dot(appleDelta, appleDelta);
      if (appleDistanceSquared <= apple.radius * apple.radius && appleDistanceSquared < eatenAppleDistanceSquared) {
        eatenAppleIndex = appleIndex;
        eatenAppleDistanceSquared = appleDistanceSquared;
      }

      let gravityRadius = max(apple.radius * APPLE_GRAVITY_RADIUS_SCALE, apple.radius + 1.0);
      let delta = apple.position - position.xy + offset * appleStrength;
      let distanceSquared = max(dot(delta, delta), 16.0);
      let radiusSquared = gravityRadius * gravityRadius;
      if (distanceSquared < radiusSquared) {
        let distance = sqrt(distanceSquared);
        let minimumPullDistance = max(apple.radius, gravityRadius * 0.18);
        let outerFalloff = 1.0 - distance / gravityRadius;
        let innerDistance = clamp(distance / minimumPullDistance, 0.0, 1.0);
        let innerFalloff = smoothstep(0.0, 1.0, innerDistance);
        let pull = outerFalloff * outerFalloff * outerFalloff * outerFalloff * (0.04 + 0.96 * innerFalloff) * appleStrength;
        let inward = normalize(delta);
        let randomAngle = randomUnit(index) * TWO_PI;
        let randomDirection = vec2f(cos(randomAngle), sin(randomAngle));
        let tangent = vec2f(-inward.y, inward.x) * randomBetween(index, -1.0, 1.0);
        let attractionDirection = normalize(
          inward * (0.08 + 0.62 * innerFalloff) +
          randomDirection * (0.27 + (1.0 - innerFalloff) * 1.4) +
          tangent * outerFalloff * (0.22 + 0.26 * crazinessScale)
        );
        if (pull > strongestPull) {
          secondPull = strongestPull;
          secondAttraction = attraction;
          strongestPull = pull;
          attraction = attractionDirection * pull;
        } else if (pull > secondPull) {
          secondPull = pull;
          secondAttraction = attractionDirection * pull;
        }
      }
    }

    if (eatenAppleIndex < appleCount) {
      atomicAdd(&appleEaters[eatenAppleIndex], 1u);
      eatingGlow = 1.0;
    }
    appleGlow = max(clamp(strongestPull * 3.0, 0.0, 1.0), eatingGlow);

    let weakerChance = 0.08 + 0.20 * clamp(secondPull / max(strongestPull, 0.0001), 0.0, 1.0);
    if (secondPull > 0.0 && randomUnit(index) < weakerChance) {
      attraction = secondAttraction;
    }

    if (dot(attraction, attraction) > 0.0001) {
      angleChangeMsLeft = appleTurnMs;
      let attractionJitter = randomBetween(index, -maxRandomAngleChange, maxRandomAngleChange) * appleGlow * (0.13 + 0.11 * crazinessScale);
      let newAngle = atan2(attraction.y, attraction.x) + attractionJitter;
      angleStepPerMs = angleDifference(newAngle, angle) / angleChangeMsLeft;
    }
  }

  if (angleChangeMsLeft <= 0.0 && randomUnit(index) < crazinessPerMs * crazinessScale * elapsedMs) {
    let angleChange = randomBetween(index, -maxRandomAngleChange, maxRandomAngleChange);
    angleStepPerMs = angleChange / changeDirectionMs;
    angleChangeMsLeft = changeDirectionMs;
  }

  if (cursorRepellentActive > 0.0) {
    let repellentDelta = position.xy - cursorRepellentPosition;
    let repellentDistanceSquared = dot(repellentDelta, repellentDelta);
    let repellentRadiusSquared = cursorRepellentRadius * cursorRepellentRadius;
    if (repellentDistanceSquared > 1.0 && repellentDistanceSquared < repellentRadiusSquared) {
      let repellentDistance = sqrt(repellentDistanceSquared);
      let repellentFalloff = 1.0 - repellentDistance / cursorRepellentRadius;
      let applePriority = smoothstep(0.006, 0.035, strongestPull);
      let repellentPressure = repellentFalloff * (1.0 - applePriority * 0.96);
      if (repellentPressure > 0.01) {
        let randomAngle = randomUnit(index) * TWO_PI;
        let escapeDirection = normalize(repellentDelta);
        let tangent = vec2f(-escapeDirection.y, escapeDirection.x) * randomBetween(index, -1.0, 1.0);
        let scatter = vec2f(cos(randomAngle), sin(randomAngle)) * repellentPressure * (0.34 + 0.12 * crazinessScale);
        let escape = escapeDirection * (0.95 + repellentPressure * 0.45) + scatter + tangent * repellentPressure * (0.14 + 0.1 * crazinessScale);
        angleChangeMsLeft = mix(changeDirectionMs * 0.42, changeDirectionMs * 0.78, 1.0 - repellentPressure);
        let repellentJitter = randomBetween(index, -maxRandomAngleChange, maxRandomAngleChange) * repellentPressure * (0.08 + 0.06 * crazinessScale);
        let newAngle = atan2(escape.y, escape.x) + repellentJitter;
        angleStepPerMs = angleDifference(newAngle, angle) / angleChangeMsLeft;
        let immediateTurn = repellentPressure * (0.08 + 0.04 * crazinessScale);
        angle += angleDifference(newAngle, angle) * immediateTurn;
        velocity = vec2f(speed * cos(angle), speed * sin(angle));
        repellentGlow = max(repellentGlow, min(1.0, repellentPressure * 1.2));
      }
    }
  }

  if (angleChangeMsLeft > 0.0) {
    angle += angleStepPerMs * elapsedMs;
    if (appleGlow > 0.0 || repellentGlow > 0.0) {
      angle += randomBetween(index, -1.0, 1.0) * (appleGlow * 0.096 + repellentGlow * 0.192) * (0.52 + 0.28 * crazinessScale);
    }
    if (angle < 0.0) {
      angle += TWO_PI;
    } else if (angle >= TWO_PI) {
      angle -= TWO_PI;
    }
    velocity = vec2f(speed * cos(angle), speed * sin(angle));
    angleChangeMsLeft -= elapsedMs;
  }

  var nextPosition = position.xy + velocity * elapsedMs * speedScale;
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
    nextPosition = position.xy + velocity * elapsedMs * speedScale;
    angle = atan2(velocity.y, velocity.x);
    angleChangeMsLeft = 0.0;
  }

  let baseColor = wormColor(index);
  let appleTint = vec3f(1.0, 0.18, 0.05);
  let eatingTint = vec3f(1.0, 0.92, 0.3);
  let repellentTint = vec3f(0.05, 0.82, 1.0);
  let attractedColor = mix(baseColor.rgb, appleTint, appleGlow * 0.65);
  let hungryColor = mix(attractedColor, eatingTint, eatingGlow * 0.55);
  let color = vec4f(mix(hungryColor, repellentTint, repellentGlow * 0.7), min(1.0, baseColor.a + appleGlow * 0.14 + repellentGlow * 0.2));
  let packedColor = pack4x8unorm(color);
  if (renderTriangles) {
    let triangleCenter = clamp(nextPosition, vec2f(0.0, 0.0), vec2f(width - 1.0, height - 1.0));
    let forward = vec2f(cos(angle), sin(angle));
    let side = vec2f(-forward.y, forward.x);
    let triangleSize = 3.6 + 2.2 * colorUnit((index * 1103515245u + 12345u) >> 16u);
    let nose = triangleSize * 1.35;
    let tail = triangleSize * 0.82;
    let halfWidth = triangleSize * 0.62;
    vertices[index * 3u] = LineVertex(triangleCenter + forward * nose, packedColor);
    vertices[index * 3u + 1u] = LineVertex(triangleCenter - forward * tail + side * halfWidth, packedColor);
    vertices[index * 3u + 2u] = LineVertex(triangleCenter - forward * tail - side * halfWidth, packedColor);
  } else {
    let clampedStart = clamp(startPosition, vec2f(0.0, 0.0), vec2f(width - 1.0, height - 1.0));
    let clampedEnd = clamp(nextPosition, vec2f(0.0, 0.0), vec2f(width - 1.0, height - 1.0));
    vertices[index * 2u] = LineVertex(clampedStart, packedColor);
    vertices[index * 2u + 1u] = LineVertex(clampedEnd, packedColor);
  }

  motionA[index] = vec4f(nextPosition, velocity);
  motionB[index] = vec4f(angle, angleStepPerMs, angleChangeMsLeft, 0.0);
}

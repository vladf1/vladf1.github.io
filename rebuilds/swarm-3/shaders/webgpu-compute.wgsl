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
  color: vec4f,
};

struct Apple {
  position: vec2f,
  volume: f32,
  radius: f32,
};

@group(0) @binding(0) var<storage, read_write> positions: array<vec4f>;
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

  positions[index] = vec4f(startX, startY, startX, startY);
  motionA[index] = vec4f(velocity, speed, crazinessPerMs);
  motionB[index] = vec4f(offsetX, offsetY, 0.0, angle);
  motionC[index] = vec4f(0.0, 0.0, 0.0, 0.0);
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

  var position = positions[index];
  var velocity = motionA[index].xy;
  let speed = motionA[index].z;
  let crazinessPerMs = motionA[index].w;
  let offset = motionB[index].xy;
  var angle = motionB[index].w;
  var angleStepPerMs = motionC[index].x;
  var angleChangeMsLeft = motionC[index].y;
  let startPosition = position.xy;
  var appleGlow = 0.0;
  var eatingGlow = 0.0;
  var repellentGlow = 0.0;

  if (appleCount > 0u) {
    var attraction = vec2f(0.0, 0.0);
    var strongestPull = 0.0;
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
      let randomAngle = randomUnit(index) * TWO_PI;
      let escapeDirection = normalize(repellentDelta);
      let tangent = vec2f(-escapeDirection.y, escapeDirection.x) * randomBetween(index, -1.0, 1.0);
      let scatter = vec2f(cos(randomAngle), sin(randomAngle)) * repellentFalloff * (0.72 + 0.24 * crazinessScale);
      let escape = escapeDirection + scatter + tangent * repellentFalloff * (0.38 + 0.22 * crazinessScale);
      angleChangeMsLeft = mix(changeDirectionMs * 0.45, changeDirectionMs, repellentFalloff);
      let repellentJitter = randomBetween(index, -maxRandomAngleChange, maxRandomAngleChange) * repellentFalloff * (0.22 + 0.14 * crazinessScale);
      let newAngle = atan2(escape.y, escape.x) + repellentJitter;
      angleStepPerMs = angleDifference(newAngle, angle) / angleChangeMsLeft;
      repellentGlow = max(repellentGlow, repellentFalloff);
    }
  }

  if (angleChangeMsLeft > 0.0) {
    angle += angleStepPerMs * elapsedMs;
    angle += randomBetween(index, -1.0, 1.0) * (appleGlow * 0.096 + repellentGlow * 0.192) * (0.52 + 0.28 * crazinessScale);
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

  let clampedStart = clamp(startPosition, vec2f(0.0, 0.0), vec2f(width - 1.0, height - 1.0));
  let clampedEnd = clamp(nextPosition, vec2f(0.0, 0.0), vec2f(width - 1.0, height - 1.0));
  let baseColor = wormColor(index);
  let appleTint = vec3f(1.0, 0.18, 0.05);
  let eatingTint = vec3f(1.0, 0.92, 0.3);
  let repellentTint = vec3f(0.05, 0.82, 1.0);
  let attractedColor = mix(baseColor.rgb, appleTint, appleGlow * 0.65);
  let hungryColor = mix(attractedColor, eatingTint, eatingGlow * 0.55);
  let color = vec4f(mix(hungryColor, repellentTint, repellentGlow * 0.7), min(1.0, baseColor.a + appleGlow * 0.14 + repellentGlow * 0.2));
  vertices[index * 2u] = LineVertex(clampedStart, color);
  vertices[index * 2u + 1u] = LineVertex(clampedEnd, color);

  positions[index] = vec4f(nextPosition, nextPosition);
  motionA[index] = vec4f(velocity, speed, crazinessPerMs);
  motionB[index] = vec4f(offset, 0.0, angle);
  motionC[index] = vec4f(angleStepPerMs, angleChangeMsLeft, 0.0, 0.0);
}

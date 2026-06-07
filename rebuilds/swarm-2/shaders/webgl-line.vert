attribute vec2 a_position;
attribute vec3 a_color;
uniform vec2 u_resolution;
varying vec3 v_color;

void main() {
  vec2 zeroToOne = a_position / u_resolution;
  vec2 clipSpace = zeroToOne * 2.0 - 1.0;

  gl_Position = vec4(clipSpace.x, -clipSpace.y, 0.0, 1.0);
  v_color = a_color;
}

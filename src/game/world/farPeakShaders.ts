/**
 * The far peak's shaders (farPeak.ts). Every point is pinned to the far plane along its direction from
 * the camera, so the outline is the true mountain from wherever you stand, and only claims open sky.
 *
 * Fitted to the frame. The chase camera looks ~13 deg down with a 38 deg lens, so the top edge of the
 * frame is only ~6 deg above the horizon, and from the cabin the true summit stands ~5 deg up and the
 * beacon ~7: the mast you are walking to was drawn above the top of the screen, and the drawing used
 * to be stood up taller still with distance, which pushed it further out. Now, while it is further
 * away than the room allows, the drawing is shrunk about its own foot until the beacon sits just under
 * the top edge (`uMaxRise`, the tangent of that angle, kept by farPeak.ts from the camera), and drawn
 * a little narrower than tall so it reads as a peak rather than a mesa. Close enough to fit, it is the
 * true mountain again.
 */

export const PIN = /* glsl */ `
uniform vec3 uPeak;
uniform float uNear0, uNear1, uTop, uMaxRise;
varying float vFade;
vec3 lifted(vec3 world) {
  float d = distance(cameraPosition.xz, uPeak.xz);
  float k = clamp((cameraPosition.y + uMaxRise * d) / uTop, 0.3, 1.0);
  vec3 o = world - vec3(uPeak.x, 0.0, uPeak.z);
  return vec3(uPeak.x, 0.0, uPeak.z) + o * vec3(pow(k, 1.5), k, pow(k, 1.5));
}
vec4 pinned(vec3 world) {
  vec3 dir = normalize(world - cameraPosition);
  vec4 clip = projectionMatrix * viewMatrix * vec4(cameraPosition + dir * 100.0, 1.0);
  clip.z = clip.w * 0.99998; // just in front of the aurora, behind everything solid
  // Gone as you near the summit, where the real mountain stands in front of it; and never drawn from
  // a point next to the camera, which would smear across the whole sky.
  vFade = smoothstep(uNear0, uNear1, distance(cameraPosition.xz, uPeak.xz))
    * smoothstep(60.0, 120.0, distance(world, cameraPosition));
  return clip;
}
`;

export const MASSIF_VERT = PIN + /* glsl */ `
attribute float aT;
varying float vT;
varying vec3 vWorld;
void main() { vT = aT; vWorld = lifted((modelMatrix * vec4(position, 1.0)).xyz); gl_Position = pinned(vWorld); }
`;

/**
 * A few flat colours and no gradients, like everything else in the valley: sunlit snow, snow in
 * shade, and the haze the foot stands in. Each facet takes the normal of its own triangle, so the
 * coarse grid reads as chunky lit and shaded planes. (A rock tone for steep faces was tried: at this
 * distance it read as purple blotches, not stone.)
 */
export const MASSIF_FRAG = /* glsl */ `
uniform vec3 uLit, uShade, uHaze, uSun;
varying float vT;
varying float vFade;
varying vec3 vWorld;
void main() {
  if (vFade < 0.01) discard;
  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (n.y < 0.0) n = -n;
  vec3 c = dot(n, uSun) > 0.18 ? uLit : uShade;
  // Below the snow line the mountain stands in the valley's haze: one hard step, not a ramp.
  if (vT < 0.22) c = mix(c, uHaze, 0.6);
  if (vT < 0.08) c = uHaze;
  gl_FragColor = vec4(c, vFade);
}
`;

export const BEACON_VERT = PIN + /* glsl */ `
uniform float uSize;
void main() { gl_Position = pinned(lifted((modelMatrix * vec4(position, 1.0)).xyz)); gl_PointSize = uSize; }
`;

export const BEACON_FRAG = /* glsl */ `
uniform float uBlink;
varying float vFade;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  if (r > 1.0 || vFade < 0.01) discard;
  float core = step(r, 0.42);
  float halo = (1.0 - r) * (1.0 - r) * 0.7;
  gl_FragColor = vec4(mix(vec3(0.95, 0.16, 0.08), vec3(1.0, 0.55, 0.4), core * 0.5), min(1.0, core + halo) * uBlink * vFade);
}
`;

export const LINE_VERT = PIN + 'void main() { gl_Position = pinned(lifted((modelMatrix * vec4(position, 1.0)).xyz)); }';
export const LINE_FRAG =
  'uniform vec3 uColor; varying float vFade; void main() { if (vFade < 0.01) discard; gl_FragColor = vec4(uColor, vFade); }';

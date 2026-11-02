/**
 * The shader text for the view fade (viewFade.ts): the face test for props, the stipple that takes a
 * whole object away at the lens, and the same judgement made for a glow round a light.
 */

/** Pip's body for the on-screen box: radius round the feet and height, world units (actors/playerMesh). */
export const PIP_RADIUS = 0.5;
export const PIP_HEIGHT = 1.4;
/** A face must cross the sightline at least this far in front of Pip's middle to count as in front. */
export const IN_FRONT = 0.8;
/** Narrower than this on screen (frame heights: 0.04 is about four internal pixels) is a sliver. */
const SLIVER = 0.04;
/** A face with a corner nearer the lens than this is not drawn. */
export const NEAR = 2.2;
/** Closer to Pip than this the camera is the viewfinder: nothing is cut. */
export const EYE = 3.0;
/** How many objects may be cleared whole at once, and how near an origin must be to a named spot. */
export const CLEAR = 4;
export const MATCH = 0.35;
const f = (n: number): string => n.toFixed(3);

export const VERT_PROLOGUE = `
attribute vec3 fadeA;
attribute vec3 fadeB;
attribute vec3 fadeC;
uniform vec3 uView;
uniform vec3 uTarget;
uniform vec4 uPipRect;
uniform float uOn;
flat varying float vFaceCut;
varying vec2 vFadeOrigin;
// Is the edge p->q (o the third corner) a line with the whole rect on the far side from o?
bool fadeApart(vec2 p, vec2 q, vec2 o, vec4 r) {
  vec2 n = vec2(q.y - p.y, p.x - q.x);
  float s = sign(dot(n, o - p));
  float m = max(max(dot(n, r.xy - p), dot(n, r.zw - p)), max(dot(n, r.xw - p), dot(n, r.zy - p)));
  float l = min(min(dot(n, r.xy - p), dot(n, r.zw - p)), min(dot(n, r.xw - p), dot(n, r.zy - p)));
  return s > 0.0 ? m < 0.0 : l > 0.0;
}
`;
export const VERT_BODY = `
  #include <begin_vertex>
  {
    mat4 fadeModel = modelMatrix;
    #ifdef USE_INSTANCING
      fadeModel = modelMatrix * instanceMatrix;
    #endif
    vFadeOrigin = (fadeModel * vec4(0.0, 0.0, 0.0, 1.0)).xz;
    vFaceCut = 0.0;
    vec3 pip = uTarget + vec3(0.0, ${f(PIP_HEIGHT * 0.5)}, 0.0);
    float dp = distance(uView, pip);
    if (uOn > 0.5 && dp > ${f(EYE)} && fadeA != fadeB) {
      vec3 a = (fadeModel * vec4(fadeA, 1.0)).xyz - uView;
      vec3 b = (fadeModel * vec4(fadeB, 1.0)).xyz - uView;
      vec3 c = (fadeModel * vec4(fadeC, 1.0)).xyz - uView;
      if (min(min(length(a), length(b)), length(c)) < ${f(NEAR)}) vFaceCut = 1.0;
      // Where the face's plane crosses the sightline to Pip, as a distance from the lens.
      vec3 axis = (pip - uView) / dp;
      vec3 n = cross(b - a, c - a);
      float across = dot(n, axis);
      float hit = abs(across) > 1e-6 ? dot(n, a) / across : -1.0;
      if (vFaceCut < 0.5 && hit > 0.0 && hit < dp - ${f(IN_FRONT)} && uPipRect.x < uPipRect.z) {
        vec4 ca = projectionMatrix * viewMatrix * vec4(a + uView, 1.0);
        vec4 cb = projectionMatrix * viewMatrix * vec4(b + uView, 1.0);
        vec4 cc = projectionMatrix * viewMatrix * vec4(c + uView, 1.0);
        if (ca.w > 0.0 && cb.w > 0.0 && cc.w > 0.0) {
          vec2 sa = ca.xy / ca.w, sb = cb.xy / cb.w, sc = cc.xy / cc.w;
          vec4 r = uPipRect;
          bool apart = max(max(sa.x, sb.x), sc.x) < r.x || min(min(sa.x, sb.x), sc.x) > r.z
            || max(max(sa.y, sb.y), sc.y) < r.y || min(min(sa.y, sb.y), sc.y) > r.w
            || fadeApart(sa, sb, sc, r) || fadeApart(sb, sc, sa, r) || fadeApart(sc, sa, sb, r);
          // A sliver beside Pip goes with the faces that cover it: the edge-on side of a cut cone or a
          // trunk's last narrow face, left standing alone, read as stray poles through the gap.
          vec2 tall = vec2(projectionMatrix[1][1] / projectionMatrix[0][0], 1.0);
          vec2 ta = sa * tall, tb = sb * tall, tc = sc * tall;
          float base = max(max(distance(ta, tb), distance(tb, tc)), distance(tc, ta));
          float thin = abs((tb.x - ta.x) * (tc.y - ta.y) - (tb.y - ta.y) * (tc.x - ta.x)) / max(base, 1e-6);
          vec4 near = r + vec4(-1.5, -1.0, 1.5, 1.0) * (r.zwzw - r.xyxy);
          bool beside = thin < ${f(SLIVER)} && !(max(max(sa.x, sb.x), sc.x) < near.x
            || min(min(sa.x, sb.x), sc.x) > near.z || max(max(sa.y, sb.y), sc.y) < near.y || min(min(sa.y, sb.y), sc.y) > near.w);
          if (!apart || beside) vFaceCut = 1.0;
        }
      }
    }
  }
`;
export const FRAG_PROLOGUE = `
flat varying float vFaceCut;
varying vec2 vFadeOrigin;
uniform vec4 uClear[${CLEAR}];
uniform float uOn;
// Ordered 4x4 threshold in internal pixels: same pixel, same value every frame, a regular stipple.
float fadeBayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float fadeBayer(vec2 a) { return fadeBayer2(0.5 * a) * 0.25 + fadeBayer2(a) + 1.0 / 32.0; }
`;
export const FRAG_BODY = `
void main() {
  if (uOn > 0.5) {
    if (vFaceCut > 0.5) discard;
    float k = 0.0;
    for (int i = 0; i < ${CLEAR}; i++) {
      if (uClear[i].z > 0.0 && distance(vFadeOrigin, uClear[i].xy) < ${f(MATCH)}) k = max(k, uClear[i].z);
    }
    if (k > 0.0 && fadeBayer(gl_FragCoord.xy) < k) discard;
  }
`;

/** A glow is judged by its core: about the lamp glass it surrounds, world units. */
const CORE = 0.4;
/**
 * A glow round a light (a sprite) goes with the light: when its core covers Pip on screen in front of
 * the bird, or comes nearer the lens than a face may, exactly when the glass inside it would be cut.
 * The fragment side is FRAG_PROLOGUE/FRAG_BODY, so it also stipples away with an object cleared at the
 * lens. Otherwise a halo hung on, a ball of light floating where its lamp had been.
 */
export const GLOW_PROLOGUE = `
uniform vec3 uView;
uniform vec3 uTarget;
uniform vec4 uPipRect;
uniform float uOn;
flat varying float vFaceCut;
varying vec2 vFadeOrigin;
`;
export const GLOW_BODY = `
  {
    vec3 fadeAt = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vFadeOrigin = fadeAt.xz;
    vFaceCut = 0.0;
    vec3 pip = uTarget + vec3(0.0, ${f(PIP_HEIGHT * 0.5)}, 0.0);
    float dp = distance(uView, pip);
    if (uOn > 0.5 && dp > ${f(EYE)}) {
      float along = dot(fadeAt - uView, (pip - uView) / dp);
      if (distance(fadeAt, uView) < ${f(NEAR + CORE)}) vFaceCut = 1.0;
      else if (along > 0.0 && along < dp - ${f(IN_FRONT)} && uPipRect.x < uPipRect.z) {
        vec4 cc = projectionMatrix * viewMatrix * vec4(fadeAt, 1.0);
        vec2 s = cc.xy / cc.w;
        vec2 core = vec2(projectionMatrix[0][0], projectionMatrix[1][1]) * ${f(CORE)} / cc.w;
        vec4 r = uPipRect;
        if (s.x + core.x > r.x && s.x - core.x < r.z && s.y + core.y > r.y && s.y - core.y < r.w) vFaceCut = 1.0;
      }
    }
  }
  #include <logdepthbuf_vertex>
`;

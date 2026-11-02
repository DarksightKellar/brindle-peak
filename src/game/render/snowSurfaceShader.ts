/**
 * GLSL for the snow and ice surface (snowSurface.ts patches it into the terrain and lake materials).
 *
 * Everything is anchored to world position and sized by the pixel footprint (`snowFw`, the world
 * units one internal pixel covers at that fragment). Each feature comes in several sizes, and each
 * size is drawn only while it spans a set range of pixels, so the snow carries the same amount of
 * detail on screen at Pip's feet and across the valley, and nothing slides when the camera moves.
 *
 * Compared from the same four spots (ART_BIBLE §4): lit wind ripples at every scale read as planks
 * and speed lines; the authored tile repeated at larger scales barely showed; posterised drifts (two
 * or three flat tones with hard pixel-stepped edges, the reference's own way of drawing snow) read
 * as snow at every distance. Shipped: posterised drifts, sparse wind marks, the two broad ripple
 * families as light only, and sun glints.
 */

export const SNOW_PARS = /* glsl */ `
uniform vec3 uSnowSun;    // world direction toward the key light
uniform vec4 uSnowLook;   // marks and ripples, drifts, glints, ice detail (0 = off)
uniform vec2 uSnowWind;   // world xz direction the wind blows along
uniform vec4 uIceDisc;    // lake centre x, z, radius, sheet height
uniform vec3 uIceDeep, uIceMid, uIceHi, uIceFrost;
varying vec3 vSnowWorld;
float snowHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float snowNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(snowHash(i), snowHash(i + vec2(1.0, 0.0)), u.x),
             mix(snowHash(i + vec2(0.0, 1.0)), snowHash(i + 1.0), u.x), u.y);
}
// 0 where a feature of this size would span fewer than lo pixels, 1 from hi pixels up.
float snowVis(float len, float fw, float lo, float hi) { return smoothstep(lo, hi, len / fw); }
// Distance to the nearest cell border (cell units), and a hash shared by the two cells either side,
// so a border is drawn or skipped as one segment. Two-pass exact border distance.
vec2 snowCells(vec2 x) {
  vec2 n = floor(x), f = fract(x), mg = vec2(0.0), mr = vec2(0.0);
  float md = 8.0, id = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j)), r = g + vec2(snowHash(n + g), snowHash(n + g + 17.3)) - f;
    float d = dot(r, r);
    if (d < md) { md = d; mr = r; mg = g; }
  }
  md = 8.0;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    vec2 g = mg + vec2(float(i), float(j)), r = g + vec2(snowHash(n + g), snowHash(n + g + 17.3)) - f;
    if (dot(mr - r, mr - r) > 1e-5) {
      float d = dot(0.5 * (mr + r), normalize(r - mr));
      if (d < md) { md = d; id = snowHash(n * 2.0 + mg + g + 0.5); }
    }
  }
  return vec2(md, id);
}
// A broad wind ripple as a height slope: a long windward rise and a short lee, differenced across
// the pixel footprint (a box filter), in fields, each crest broken into lengths. Light only: it tilts
// the normal, so the low sun draws it and shade leaves it faint.
float snowProfile(float t) { float f = fract(t); return f < 0.8 ? f / 0.8 : (1.0 - f) / 0.2; }
vec2 snowRipple(vec2 p, float len, float fw, float seed) {
  float vis = snowVis(len * 0.2, fw, 1.5, 3.0);
  if (vis <= 0.0) return vec2(0.0);
  vec2 w = uSnowWind, c = vec2(-w.y, w.x), q = p / len;
  float t = dot(q, w) + snowNoise(q * 0.13 + seed) * 1.2 + snowNoise(q * 0.45 + seed * 1.7) * 0.3, e = fw / len;
  float slope = (snowProfile(t + e * 0.5) - snowProfile(t - e * 0.5)) / e;
  float field = smoothstep(0.48, 0.8, snowNoise(p / (len * 7.0) + seed * 3.1));
  float piece = step(0.5, snowNoise(vec2(dot(q, c) * 0.8, floor(t) * 1.7) + seed * 5.3));
  return w * slope * 0.045 * field * piece * vis;
}
// Wind marks: short crisp strokes across the wind, one pixel thick, with a one-pixel lit edge on the
// sun's side, like the tufts drawn on the reference's snow. A cell of size S holds at most one; each
// size draws only while its cells span about 6 to 90 pixels. x = shade, y = lit edge.
vec2 snowMarks(vec2 p, float S, float fw, float seed) {
  float r = S / fw, vis = smoothstep(6.0, 14.0, r) * smoothstep(110.0, 60.0, r);
  if (vis <= 0.0) return vec2(0.0);
  vec2 w = uSnowWind, c = vec2(-w.y, w.x);
  vec2 q = vec2(dot(p, c) / (S * 2.0), dot(p, w) / S), id = floor(q), f = fract(q);
  if (snowHash(id + seed) > 0.34) return vec2(0.0);
  vec2 o = vec2(0.3 + 0.4 * snowHash(id + seed + 1.7), 0.25 + 0.5 * snowHash(id + seed + 3.3));
  float half_ = 0.1 + 0.16 * snowHash(id + seed + 5.1), u = f.x - o.x, along = step(abs(u), half_);
  float dy = (f.y - o.y - u * u * 0.8) * S, side = sign(dot(uSnowSun.xz, w) + 1e-3);
  float shade = along * step(abs(dy), fw * 0.6);
  return vec2(shade, along * step(abs(dy + side * fw), fw * 0.6) * (1.0 - shade)) * vis;
}
`;

export const SNOW_VERTEX = /* glsl */ `
#include <project_vertex>
vSnowWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
`;

/** After <color_fragment>: the albedo (drifts and marks, or the ice), and the ripple slope for later. */
export const SNOW_ALBEDO = /* glsl */ `
#include <color_fragment>
vec2 snowP = vSnowWorld.xz;
float snowFw = max(max(length(dFdx(snowP)), length(dFdy(snowP))), 1e-3);
vec2 snowSlope = vec2(0.0);
#if SNOW_KIND == 0
{
  snowSlope = (snowRipple(snowP, 13.0, snowFw, 19.0) * 0.8 + snowRipple(snowP, 41.0, snowFw, 31.0) * 0.6) * uSnowLook.x;
  // Posterised drifts: three sizes summed about their mean (so a size fading out with range eases
  // the shapes rather than shifting them), then cut into three flat tones with hard edges.
  float r6 = 6.0 / snowFw;
  float n = (snowNoise(snowP / 60.0 + 4.0) - 0.5) * 0.5 * snowVis(60.0, snowFw, 3.0, 8.0)
          + (snowNoise(snowP / 19.0 + 9.0) - 0.5) * 0.35 * snowVis(19.0, snowFw, 3.0, 8.0)
          + (snowNoise(snowP / 6.0 + 2.0) - 0.5) * 0.25 * smoothstep(3.0, 8.0, r6) * smoothstep(400.0, 150.0, r6);
  float m = (step(0.11, n) - step(n, -0.17)) * 0.5 * uSnowLook.y;
  vec2 k = snowMarks(snowP, 1.4, snowFw, 0.0) + snowMarks(snowP, 4.5, snowFw, 11.0)
         + snowMarks(snowP, 14.0, snowFw, 23.0) + snowMarks(snowP, 45.0, snowFw, 37.0);
  m += (min(k.y, 1.0) * 0.12 - min(k.x, 1.0) * 0.26) * uSnowLook.x;
  // A trace of each ripple's lee in the albedo too, so shade keeps a little of it.
  m -= max(0.0, -dot(snowSlope, uSnowWind)) * 0.35;
  // Darker is bluer: a grey darkening on snow reads as soil.
  diffuseColor.rgb *= m < 0.0 ? 1.0 + m * vec3(1.0, 0.86, 0.6) : vec3(1.0 + m);
}
#else
{
  // Inside the lake the sheet and the terrain's ice under it take one smooth tone from world
  // position. The sheet's colour was one value per triangle, and where the terrain poked through
  // it the two alternated: the lake drew as a mosaic of big flat triangles.
  float lakeD = length(snowP - uIceDisc.xy) / max(uIceDisc.z, 1e-3);
  #if SNOW_KIND == 2
  bool onLake = vSnowWorld.y < uIceDisc.w + 0.006;
  #else
  bool onLake = lakeD < 1.02;
  #endif
  if (onLake && uSnowLook.w > 0.0) {
    float grain = snowNoise(snowP / 44.0 + 2.0) * 0.65 + snowNoise(snowP / 17.0 + 8.0) * 0.35;
    vec3 tone = mix(mix(uIceDeep, uIceMid, grain), uIceHi, smoothstep(0.7, 1.0, lakeD) * 0.8);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb / max(vColor.rgb, vec3(1e-3)) * tone, uSnowLook.w);
  }
  vec2 w = uSnowWind, c = vec2(-w.y, w.x);
  // Wind-polished patches (clear, deep, no frost) and frost blown into streaks along the wind, both
  // as flat hard-edged shapes like the drifts.
  float polish = step(0.6, snowNoise(snowP / 27.0 + 11.0) * 0.75 + snowNoise(snowP / 8.0 + 3.0) * 0.25)
               * snowVis(27.0, snowFw, 2.0, 5.0);
  vec2 sq = vec2(dot(snowP, w) / 19.0, dot(snowP, c) / 2.6);
  float streak = snowNoise(sq + 3.0) * 0.7 + snowNoise(sq * 2.3 + 6.0) * 0.3;
  float frost = (step(0.62, streak) * 0.6 + step(0.74, streak) * 0.4) * snowVis(2.6, snowFw, 2.0, 5.0);
  frost = max(frost, step(0.7, snowNoise(snowP / 9.0 + 21.0)) * 0.5) * (1.0 - polish);
  // Cracks: plate borders, straight and one pixel wide at any range, each size dropped where its
  // plates would be only a few pixels across. Big plates crack dark; the fine crazing near Pip is
  // white, the way air-filled fractures show in clear ice.
  vec2 bent = (vec2(snowNoise(snowP / 34.0), snowNoise(snowP / 34.0 + 5.0)) - 0.5) * 0.5;
  vec2 big = snowCells(snowP / 15.0 + bent), small = snowCells(snowP / 4.5 + 7.0);
  float crack = (1.0 - smoothstep(0.45, 1.1, big.x * 15.0 / snowFw)) * step(0.35, big.y) * snowVis(15.0, snowFw, 5.0, 12.0);
  float craze = (1.0 - smoothstep(0.45, 1.0, small.x * 4.5 / snowFw)) * step(0.45, small.y) * snowVis(4.5, snowFw, 6.0, 14.0)
              * step(0.6, snowNoise(snowP / 13.0 + 40.0)) * (1.0 - polish);
  crack *= 1.0 - frost * 0.7;
  vec3 ice = mix(diffuseColor.rgb, uIceDeep * 0.82, polish * 0.65);
  ice = mix(ice, uIceFrost, frost * 0.5);
  ice *= 1.0 - crack * vec3(0.42, 0.32, 0.2);
  ice = mix(ice, uIceFrost, craze * 0.6);
  diffuseColor.rgb = mix(diffuseColor.rgb, ice, uSnowLook.w);
}
#endif
`;

/** After <normal_fragment_maps>: tilt the shading normal by the ripple slope (view space). */
export const SNOW_NORMAL = /* glsl */ `
#include <normal_fragment_maps>
{
  vec3 snowUp = (vec4(normal, 0.0) * viewMatrix).xyz;
  normal = normalize(normal - (viewMatrix * vec4(snowSlope.x, 0.0, snowSlope.y, 0.0)).xyz * smoothstep(0.62, 0.86, snowUp.y));
}
`;

/**
 * Before <opaque_fragment>: sun glints. One candidate point per world cell, each with its own facet;
 * it glints when that facet mirrors the sun into the lens, and only where the sun reaches. A single
 * pixel, and only near, where cells are many pixels apart. It twinkles as the camera moves and holds
 * still when it does not, like real snow.
 */
export const SNOW_SPARKLE = /* glsl */ `
{
  float sunVis = 1.0;
  #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
  sunVis = receiveShadow ? getShadow( directionalShadowMap[ 0 ], directionalLightShadows[ 0 ].shadowMapSize,
    directionalLightShadows[ 0 ].shadowIntensity, directionalLightShadows[ 0 ].shadowBias,
    directionalLightShadows[ 0 ].shadowRadius, vDirectionalShadowCoord[ 0 ] ) : 1.0;
  #endif
  const float CELL = 0.7;
  vec2 cell = floor(snowP / CELL);
  vec2 spot = (cell + vec2(snowHash(cell + 3.1), snowHash(cell + 7.7))) * CELL;
  float here = 1.0 - step(snowFw * 0.62, length(snowP - spot));
  vec3 facet = normalize(vec3(snowHash(cell + 1.3) - 0.5, 1.1, snowHash(cell + 5.9) - 0.5));
  vec3 V = normalize(cameraPosition - vSnowWorld), H = normalize(uSnowSun + V);
  float glint = smoothstep(0.988, 0.996, dot(facet, H)) * step(0.7, snowHash(cell + 9.4));
  float near = smoothstep(CELL * 0.4, CELL * 0.15, snowFw);
  outgoingLight += vec3(0.9, 0.95, 1.0) * here * glint * near * sunVis * uSnowLook.z * max(uSnowSun.y, 0.0) * 2.5;
}
#include <opaque_fragment>
`;

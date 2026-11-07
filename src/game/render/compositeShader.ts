/**
 * The composite shaders.
 *
 * Split out of `pixelPipeline.ts`, which had grown to hold the GLSL, the render-target plumbing and the
 * frame orchestration at once — and then crossed the 260-line rule when a dev seam was added. The
 * shader source is the one part of this file that can be edited without understanding any of the rest.
 */

export const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export const FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tBeauty, tNormal, tDepth;
uniform vec2 uRes, uDepthThreshold;
uniform vec3 uEdge, uFogColor, uFogFarColor, uShadowLinear, uShadowSrgb, uGrade, uSnow;
uniform float uNormalDepthBias, uNear, uFar, uFogDensity, uHueShift;
uniform vec4 uFogShape; // haze cap, fade start, fade end, fade max
uniform vec3 uSatTaper; // luma where the saturation taper starts, where it ends, saturation there
varying vec2 vUv;
// Snap to a low-res texel centre so every fragment of a block reads one texel and the neighbour
// offsets land on real neighbours (the reference assumes a 1:1 grid).
vec2 texelCentre(vec2 uv) { return (floor(uv * uRes) + 0.5) / uRes; }
vec2 at(vec2 uv, float x, float y) { return uv + vec2(x, y) / uRes; }
// three's perspectiveDepthToViewZ, negated: view-space distance in metres.
float distAt(vec2 uv) { return -((uNear * uFar) / ((uFar - uNear) * texture2D(tDepth, uv).r - uFar)); }
vec3 normalAt(vec2 uv) { return texture2D(tNormal, uv).rgb * 2.0 - 1.0; }

// Reference depthEdgeIndicator: sum of "the neighbour is behind me", floored to halves so the edge
// is one low-res pixel wide and never exceeds 0.5. The threshold scales with distance because a
// fixed window fires on any surface at a grazing angle and bands stripes across open snow.
float depthEdgeIndicator(vec2 uv, float dist) {
  float d = clamp(distAt(at(uv, 1.0, 0.0)) - dist, 0.0, uFar) + clamp(distAt(at(uv, -1.0, 0.0)) - dist, 0.0, uFar)
          + clamp(distAt(at(uv, 0.0, 1.0)) - dist, 0.0, uFar) + clamp(distAt(at(uv, 0.0, -1.0)) - dist, 0.0, uFar);
  float reach = 1.0 + dist * 0.12;
  return floor(smoothstep(uDepthThreshold.x * reach, uDepthThreshold.y * reach, d) * 2.0) / 2.0;
}
// Reference neighborNormalEdgeIndicator, verbatim except that .25 / .0025 is rescaled to metres:
// only the shallower pixel detects the edge.
float neighborNormalEdge(vec2 uv, float x, float y, float dist, vec3 normal) {
  float depthDiff = distAt(at(uv, x, y)) - dist;
  vec3 neighbour = normalAt(at(uv, x, y));
  float normalIndicator = clamp(smoothstep(-0.01, 0.01, dot(normal - neighbour, vec3(1.0))), 0.0, 1.0);
  float depthIndicator = clamp(sign(depthDiff * 0.25 + uNormalDepthBias), 0.0, 1.0);
  return (1.0 - dot(normal, neighbour)) * depthIndicator * normalIndicator;
}
float normalEdgeIndicator(vec2 uv, float dist, vec3 n) {
  float i = neighborNormalEdge(uv, 0.0, -1.0, dist, n) + neighborNormalEdge(uv, 0.0, 1.0, dist, n)
          + neighborNormalEdge(uv, -1.0, 0.0, dist, n) + neighborNormalEdge(uv, 1.0, 0.0, dist, n);
  return step(0.1, i);
}
// Linear light is what the target holds; everything measured is sRGB (A1).
vec3 linearToSrgb(vec3 c) {
  vec3 v = max(c, vec3(0.0));
  return mix(v * 12.92, 1.055 * pow(v, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), v));
}
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 rgbToHsl(vec3 c) {
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)), d = mx - mn, l = (mx + mn) * 0.5;
  if (d < 1e-9) return vec3(0.0, 0.0, l);
  float s = l > 0.5 ? d / (2.0 - mx - mn) : d / (mx + mn);
  float h = mx == c.r ? mod((c.g - c.b) / d, 6.0) : (mx == c.g ? (c.b - c.r) / d + 2.0 : (c.r - c.g) / d + 4.0);
  return vec3(mod(h * 60.0 + 360.0, 360.0), s, l);
}
vec3 hslToRgb(vec3 hsl) {
  float h = mod(hsl.x, 360.0) / 60.0;
  float c = (1.0 - abs(2.0 * hsl.z - 1.0)) * hsl.y, x = c * (1.0 - abs(mod(h, 2.0) - 1.0)), m = hsl.z - c * 0.5;
  vec3 rgb = h < 1.0 ? vec3(c, x, 0.0) : h < 2.0 ? vec3(x, c, 0.0) : h < 3.0 ? vec3(0.0, c, x)
           : h < 4.0 ? vec3(0.0, x, c) : h < 5.0 ? vec3(x, 0.0, c) : vec3(c, 0.0, x);
  return clamp(rgb + m, 0.0, 1.0);
}
// Luma-preserving saturation with an in-gamut bisect: identical to core/palette.scaleSaturation.
vec3 satScale(vec3 c, float amount) {
  float y = luma(c), lo = 1.0, hi = amount;
  vec3 full = y + (c - y) * amount;
  if (all(greaterThanEqual(full, vec3(0.0))) && all(lessThanEqual(full, vec3(1.0)))) return full;
  for (int i = 0; i < 20; i++) {
    float mid = 0.5 * (lo + hi);
    vec3 v = y + (c - y) * mid;
    if (all(greaterThanEqual(v, vec3(-1e-6))) && all(lessThanEqual(v, vec3(1.0 + 1e-6)))) lo = mid; else hi = mid;
  }
  return y + (c - y) * lo;
}
vec3 shiftHue(vec3 c, float degrees) {
  vec3 hsl = rgbToHsl(c);
  if (abs(degrees) < 1e-6 || hsl.y < 1e-6) return c;
  return hslToRgb(vec3(hsl.x + degrees, hsl.y, hsl.z));
}
vec3 splitTone(vec3 c, float amount) {
  vec3 hsl = rgbToHsl(c);
  if (amount <= 0.0 || hsl.y < 0.04) return c;
  float warm = (hsl.x >= 10.0 && hsl.x <= 70.0) ? 1.0 - abs(hsl.x - 40.0) / 30.0 : 0.0;
  float cool = (hsl.x >= 180.0 && hsl.x <= 270.0) ? 1.0 - abs(hsl.x - 225.0) / 45.0 : 0.0;
  float push = (warm - cool) * 6.0 * amount;
  return abs(push) < 1e-6 ? c : hslToRgb(vec3(hsl.x + push, hsl.y, hsl.z));
}
// The grade, in sRGB. Lift last, in the A7 form c + floor*lift*(1-c): 0 stays at the floor, 1 at 1.
// The saturation boost tapers off in the highlights (taper 1; the sky passes 0). A flat 2.6x turned
// every sunlit face pastel cyan and every lit tan a burnt orange, so a view with the sun behind the
// camera (all faces lit) washed out while one into the sun stayed rich (critic round 2).
vec3 gradeSrgb(vec3 c, float taper) {
  float amount = mix(uGrade.y, uSatTaper.z, smoothstep(uSatTaper.x, uSatTaper.y, luma(c)) * taper);
  vec3 o = satScale(c, amount);
  o = splitTone(shiftHue(o, uHueShift), uGrade.z);
  o = clamp(o, 0.0, 1.0);
  return clamp(o + uShadowSrgb * clamp(uGrade.x, 0.0, 1.0) * (1.0 - o), 0.0, 1.0);
}
// Snow: falling flakes (weather.ts owns the motion and how much). It used to be a faint drifting veil,
// chosen when single-pixel flakes on still frames measured as dead pixels; in play the veil barely
// showed and the director called it not great. Moving flakes at three depths read as snowfall.
// The hash has no sin, and every lattice wraps on a tile, so nothing loses precision with time.
float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
// Flakes: one per cell of a grid that falls down the screen, each at its own place in its cell and
// swaying a little, size internal pixels square. Three layers at three speeds give depth: far ones
// small, slow and faint, near ones bigger and quicker. Everything wraps on a tile, as the veil does.
float flakeLayer(vec2 texel, vec3 s, float cell, float speed, float size, float density, float seed) {
  float t = s.y / 14.0; // s.y falls 14 texels a second (weather.ts FALL)
  float tile = cell * 64.0;
  vec2 q = vec2(texel.x - mod(s.x * speed / 14.0, tile), texel.y + mod(t * speed, tile));
  vec2 id = mod(floor(q / cell), 64.0);
  float h = hash21(id + seed);
  if (h > density) return 0.0;
  float sway = cell * 0.16;
  vec2 off = vec2(hash21(id + seed + 7.1), hash21(id + seed + 3.7)) * (cell - size - 2.0 * sway) + vec2(sway, 0.0);
  off.x += sin(mod(t * (0.6 + h), 6.2832) + h * 40.0) * sway;
  vec2 local = mod(q, cell) - floor(off);
  return (local.x >= 0.0 && local.x < size && local.y >= 0.0 && local.y < size) ? 1.0 : 0.0;
}
// s.z: how much (0 none, 1 a steady fall, 2 heavy). Heavier is more flakes and brighter ones.
float flakes(vec2 texel, vec3 s) {
  float heavy = clamp(s.z - 1.0, 0.0, 1.0);
  float soft = mix(0.45, 0.6, heavy), bold = mix(0.75, 0.9, heavy);
  float far = flakeLayer(texel, s, 7.0, 16.0, 1.0, 0.22 + 0.25 * heavy, 11.0) * soft * 0.6;
  float mid = flakeLayer(texel, s, 13.0, 28.0, 1.0, 0.3 + 0.3 * heavy, 23.0) * soft;
  float near = flakeLayer(texel, s, 31.0, 52.0, 2.0, 0.28 + 0.3 * heavy, 37.0) * bold;
  return max(max(far, mid), near) * min(s.z, 1.0);
}
// Fog, in two stages (ART_BIBLE §6). Uncapped haze mixed every distant hill and tree line to the one
// fog colour, and the 2.6x grade then turned that colour a vivid flat blue: placeholder spikes on a
// blue mesa. Now a light cold haze in linear light is capped low, so nothing loses its own light and
// shade to it; then, after the grade, a fade toward the sky's own horizon colour makes each layer
// further away paler, so near / middle / far separate and the far hills melt into the sky. The last
// stretch before the far plane fades all the way, so the clip edge never shows.
float hazeAt(float dist) { return min(1.0 - exp(-pow(uFogDensity * dist, 2.0)), uFogShape.x); }
float fadeAt(float dist) {
  return max(smoothstep(uFogShape.y, uFogShape.z, dist) * uFogShape.w, smoothstep(uFar * 0.85, uFar * 0.99, dist));
}

void main() {
  vec2 uv = texelCentre(vUv);
  float dist = distAt(uv), dei = depthEdgeIndicator(uv, dist);
  vec3 col = texture2D(tBeauty, uv).rgb;
  col = mix(col, uShadowLinear, uEdge.x * dei);          // depth edge: toward the floor, never black
  col *= 1.0 + normalEdgeIndicator(uv, dist, normalAt(uv)) * uEdge.y * uEdge.z; // a lit rim, not a toon line
  // A2: fog here and only here. The far plane is the sky gradient, not fog.
  float open = dist >= uFar * 0.999 ? 0.0 : 1.0;
  vec3 lit = gradeSrgb(linearToSrgb(mix(col, uFogColor, hazeAt(dist) * open)), open);
  lit = mix(lit, gradeSrgb(linearToSrgb(uFogFarColor), 0.0), fadeAt(dist) * open);
  if (uSnow.z > 0.0) lit = mix(lit, vec3(0.96, 0.98, 1.0), flakes(floor(vUv * uRes), uSnow));
  gl_FragColor = vec4(lit, 1.0);
}
`;


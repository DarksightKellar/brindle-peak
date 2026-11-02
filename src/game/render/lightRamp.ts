/**
 * The single most recognisable part of the reference look (ART_BIBLE §4): N·L is replaced by
 * three stairs, and each stair is tinted — lit bands toward amber, the shadow band toward
 * blue-violet. Snow then reads as three flat colours instead of a smooth gradient, which is what
 * survives a 384x216 render.
 *
 * Implementation: `RE_Direct_Lambert` is redefined by swapping the `lights_lambert_pars_fragment`
 * chunk. That chunk is the only place three's Lambert model turns `dotNL * lightColor` into
 * irradiance, so the patch stays correct for every light type (directional, point, spot) and for
 * instanced / skinned meshes without touching their shaders.
 */
import * as THREE from 'three';

/** N·L stairs: below / mid / above. Multipliers straight from ART_BIBLE §4. */
const BAND_MULTIPLIERS = [0.6, 0.78, 1.0] as const;
/** Hue rotation per band, degrees: shadow away from warm, both lit bands toward amber. */
const BAND_HUES = [-12, 8, 8] as const;
const BAND_EDGES = [0.32, 0.62] as const;

const TOKEN = '#include <lights_lambert_pars_fragment>';

const BANDED_LAMBERT = /* glsl */ `
varying vec3 vViewPosition;

struct LambertMaterial {
  vec3 diffuseColor;
  float specularStrength;
};

uniform vec3 uBandMul;
uniform vec3 uBandHue;

// Rotate hue about the grey axis. Luminance-preserving and cheap (no HSL round trip):
// for an 8 degree tint the difference from a full HSL rotation is invisible, and this runs
// per light per fragment.
vec3 rampHue(vec3 color, float degrees) {
  const vec3 k = vec3(0.57735027);
  float a = radians(degrees);
  float c = cos(a);
  float s = sin(a);
  return color * c + cross(k, color) * s + k * dot(k, color) * (1.0 - c);
}

void RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {

  float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
  float band = dotNL < ${BAND_EDGES[0].toFixed(2)} ? 0.0 : ( dotNL < ${BAND_EDGES[1].toFixed(2)} ? 1.0 : 2.0 );
  float mul = band < 0.5 ? uBandMul.x : ( band < 1.5 ? uBandMul.y : uBandMul.z );
  float hue = band < 0.5 ? uBandHue.x : ( band < 1.5 ? uBandHue.y : uBandHue.z );

  vec3 irradiance = dotNL * directLight.color * mul;
  vec3 lit = irradiance * BRDF_Lambert( material.diffuseColor );
  reflectedLight.directDiffuse += rampHue( lit, hue );

}

void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {

  reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );

}

#define RE_Direct\t\t\t\tRE_Direct_Lambert
#define RE_IndirectDiffuse\tRE_IndirectDiffuse_Lambert
`;

const PATCHED = 'rampHue';

/**
 * Band the direct light of any three lit material. Idempotent.
 *
 * Throws on a material whose shader has no Lambert lighting chunk instead of silently rendering
 * an unbanded object — a lit prop that quietly skips the ramp is exactly the kind of drift the
 * art gate exists to catch.
 */
export function applyLightRamp(material: THREE.Material): void {
  if (material.userData.lightRamp === true) return;
  material.userData.lightRamp = true;

  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    if (!shader.fragmentShader.includes(TOKEN)) {
      throw new Error(
        'applyLightRamp: material shader has no <lights_lambert_pars_fragment>; only three lit materials (Lambert / Phong / Standard) can be banded',
      );
    }
    shader.uniforms.uBandMul = { value: new THREE.Vector3(...BAND_MULTIPLIERS) };
    shader.uniforms.uBandHue = { value: new THREE.Vector3(...BAND_HUES) };
    shader.fragmentShader = shader.fragmentShader.replace(TOKEN, BANDED_LAMBERT);
    if (!shader.fragmentShader.includes(PATCHED)) {
      throw new Error('applyLightRamp: patch did not apply');
    }
  };

  material.customProgramCacheKey = () => `lightramp:${BAND_EDGES.join('/')}`;
  material.needsUpdate = true;
}

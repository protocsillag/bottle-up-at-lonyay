import * as THREE from 'three';

// Procedural Pest tenement facades in the fragment shader: a tall ground floor with a
// shop row and rusticated plaster, window grids with frames and sills on the upper
// floors, a cornice band, and warm lit windows at night. Walls carry two attributes:
//   aFacade = (u along the wall edge in m, height in m, edge length in m)
//   aStyle  = (building seed 0–1, kind) where kind 0 = plain, 1 = street facade,
//             2 = courtyard facade, 3 = palace (bigger arched windows), −1 = no pattern.

export const facadeUniforms = { uNight: { value: 0 } };

export function facadeMaterial() {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = facadeUniforms.uNight;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec3 aFacade;
attribute vec2 aStyle;
varying vec3 vFacade;
varying vec2 vStyle;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vFacade = aFacade;
vStyle = aStyle;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uNight;
varying vec3 vFacade;
varying vec2 vStyle;
float fhash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float box1(float x, float h) { return step(abs(x), h); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float facadeLit = 0.0;
if (vStyle.y > 0.5) {
  float kind = vStyle.y;
  float seed = vStyle.x;
  float u = vFacade.x, v = vFacade.y, len = vFacade.z;
  float groundH = kind > 1.5 && kind < 2.5 ? 3.6 : 4.4;
  float floorH = kind > 2.5 ? 4.6 : 3.6;
  float sx = (kind > 2.5 ? 4.2 : 2.7) + seed * 0.8;
  float n = floor(len / sx);
  vec3 base = diffuseColor.rgb;
  // Fade the pattern out where a window cell gets smaller than a few pixels (no moire).
  float aa = clamp(1.4 - max(fwidth(u), fwidth(v)) * 2.2, 0.0, 1.0);
  vec3 frame = mix(base, vec3(0.96, 0.94, 0.88), 0.55);
  vec3 glass = vec3(0.16, 0.19, 0.23);
  if (n >= 1.0) {
    float margin = (len - n * sx) * 0.5;
    float lu = u - margin;
    float col = floor(lu / sx);
    float fx = fract(lu / sx) * sx - sx * 0.5;
    bool inCols = lu > 0.0 && lu < n * sx;
    if (v < 0.55) {
      diffuseColor.rgb = base * 0.72; // plinth
    } else if (v < groundH) {
      // Ground floor: rusticated plaster, shop windows on street facades.
      float rust = step(0.92, fract(v / 0.45));
      diffuseColor.rgb = base * (0.93 - rust * 0.12);
      if (inCols && kind > 0.5 && kind < 1.5) {
        float w = sx * 0.36;
        float shop = box1(fx, w) * step(0.6, v) * step(v, groundH - 0.7);
        float shopFrame = box1(fx, w + 0.12) * step(0.48, v) * step(v, groundH - 0.58);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.22, 0.2, 0.18), shopFrame);
        diffuseColor.rgb = mix(diffuseColor.rgb, glass * 1.25, shop);
        facadeLit = shop * step(0.35, fhash(vec3(seed, col, 7.0)));
      }
      // Band between ground and first floor.
      diffuseColor.rgb = mix(diffuseColor.rgb, frame, step(groundH - 0.32, v));
    } else {
      float fv = v - groundH;
      float fl = floor(fv / floorH);
      float fy = fract(fv / floorH) * floorH;
      float top = vFacade.y;
      if (inCols) {
        float ww = kind > 2.5 ? 0.85 : 0.6;
        float wh = kind > 2.5 ? 1.35 : 1.0;
        float cy = 1.85;
        float win = box1(fx, ww) * box1(fy - cy, wh);
        // Arched or pedimented tops on palaces and every other tenement.
        float arch = kind > 2.5 ? step(length(vec2(fx, (fy - cy - wh) * 1.0)), ww) * step(cy + wh, fy) : 0.0;
        float fr = box1(fx, ww + 0.14) * box1(fy - cy, wh + 0.14);
        float sill = box1(fx, ww + 0.25) * box1(fy - (cy - wh - 0.14), 0.07);
        float ped = step(0.5, seed) * box1(fx, ww + 0.3) * box1(fy - (cy + wh + 0.28), 0.1);
        diffuseColor.rgb = mix(diffuseColor.rgb, frame, max(max(fr, sill), ped));
        float g = max(win, arch);
        // A mullion down the middle.
        g *= 1.0 - box1(fx, 0.035) * 0.8;
        diffuseColor.rgb = mix(diffuseColor.rgb, glass + vec3(0.06) * (fy - cy) / wh, g);
        facadeLit = g * step(0.55, fhash(vec3(seed * 13.0, col, fl)));
      }
      // Storey bands.
      diffuseColor.rgb *= 1.0 - 0.08 * box1(fy - 0.05, 0.06);
    }
  }
  diffuseColor.rgb = mix(base * 0.8, diffuseColor.rgb, aa);
  facadeLit *= mix(0.6, 1.0, aa);
  // Weathering toward the bottom.
  diffuseColor.rgb *= 0.9 + 0.1 * smoothstep(0.0, 6.0, vFacade.y);
} else if (vStyle.y > -0.5) {
  diffuseColor.rgb *= 0.97;
}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += vec3(1.0, 0.78, 0.45) * facadeLit * uNight * (0.35 + 0.3 * fhash(floor(vFacade * 0.37) + vStyle.x));`);
  };
  mat.customProgramCacheKey = () => 'facade-v1';
  return mat;
}

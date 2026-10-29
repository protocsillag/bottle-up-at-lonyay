import * as THREE from 'three';
import type { Vec2 } from '../cityData';

// Helpers for hand-built landmarks.

export function colored(g: THREE.BufferGeometry, color: number) {
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/** Principal axis frame of a footprint: centre, unit long axis, half length and half width. */
export function obb(ring: Vec2[]) {
  let cx = 0, cz = 0;
  for (const [x, z] of ring) { cx += x; cz += z; }
  cx /= ring.length; cz /= ring.length;
  let sxx = 0, szz = 0, sxz = 0;
  for (const [x, z] of ring) { sxx += (x - cx) ** 2; szz += (z - cz) ** 2; sxz += (x - cx) * (z - cz); }
  const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz);
  const ux = Math.cos(ang), uz = Math.sin(ang);
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  for (const [x, z] of ring) {
    const u = (x - cx) * ux + (z - cz) * uz, v = -(x - cx) * uz + (z - cz) * ux;
    minU = Math.min(minU, u); maxU = Math.max(maxU, u); minV = Math.min(minV, v); maxV = Math.max(maxV, v);
  }
  const mu = (minU + maxU) / 2, mv = (minV + maxV) / 2;
  return {
    cx: cx + ux * mu - uz * mv, cz: cz + uz * mu + ux * mv,
    ux, uz, hl: (maxU - minU) / 2, hw: (maxV - minV) / 2,
    /** Rotation around y that maps local +x onto the long axis. */
    rotY: -Math.atan2(uz, ux),
  };
}

/** Zsolnay roof tiles: a diamond pattern in glazed orange, green, yellow and brown. */
export function zsolnayTexture(colors = ['#c9622e', '#2f7a4a', '#e0b23a', '#7a3a26']) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = colors[3];
  g.fillRect(0, 0, 128, 128);
  const d = 32;
  for (let y = 0; y < 128 / (d / 2) + 1; y++) {
    for (let x = 0; x < 128 / d + 1; x++) {
      const cx = x * d + (y % 2 ? d / 2 : 0), cy = y * (d / 2);
      g.fillStyle = colors[(x + y * 2) % 3];
      g.beginPath();
      g.moveTo(cx, cy - d / 2 + 2); g.lineTo(cx + d / 2 - 2, cy); g.lineTo(cx, cy + d / 2 - 2); g.lineTo(cx - d / 2 + 2, cy);
      g.closePath();
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A simple sign: text on a coloured board, as a texture. */
export function signTexture(text: string, bg: string, fg: string, w = 512, h = 128, font = 'bold 84px system-ui, sans-serif', stripe?: string) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  if (stripe) { g.fillStyle = stripe; g.fillRect(0, h * 0.78, w, h * 0.22); }
  g.fillStyle = fg;
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, stripe ? h * 0.42 : h / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Pyramid roof (4 sides) of a square tower, origin at the base centre. */
export function pyramid(size: number, height: number) {
  return new THREE.ConeGeometry(size * 0.72, height, 4).rotateY(Math.PI / 4).translate(0, height / 2, 0);
}

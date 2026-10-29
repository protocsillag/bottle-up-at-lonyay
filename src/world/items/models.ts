import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Low-poly models for items and their containers, built in code.
// Geometries are shared; everything that repeats goes through InstancedMesh.

function colored(g: THREE.BufferGeometry, color: number) {
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g.index ? g.toNonIndexed() : g;
}
export function merge(parts: THREE.BufferGeometry[]) {
  const g = mergeGeometries(parts.map((p) => {
    const q = p.index ? p.toNonIndexed() : p;
    q.deleteAttribute('uv');
    return q;
  }));
  g.computeBoundingSphere();
  return g;
}

/** Item lying on its side: plastic bottle, can and glass bottle (about real size, slightly enlarged to read). */
export function itemGeometry(kind: 'pet' | 'can' | 'glass') {
  const s = 2.2; // readability scale
  let parts: THREE.BufferGeometry[];
  if (kind === 'can') {
    parts = [
      colored(new THREE.CylinderGeometry(0.033 * s, 0.033 * s, 0.115 * s, 8), 0xc23b32),
      colored(new THREE.CylinderGeometry(0.03 * s, 0.033 * s, 0.01 * s, 8).translate(0, 0.0625 * s, 0), 0xd0d4d8),
    ];
  } else if (kind === 'pet') {
    parts = [
      colored(new THREE.CylinderGeometry(0.035 * s, 0.035 * s, 0.19 * s, 7), 0x8fd0e8),
      colored(new THREE.CylinderGeometry(0.012 * s, 0.035 * s, 0.05 * s, 7).translate(0, 0.12 * s, 0), 0x8fd0e8),
      colored(new THREE.CylinderGeometry(0.014 * s, 0.014 * s, 0.02 * s, 6).translate(0, 0.155 * s, 0), 0x2f7fd0),
      colored(new THREE.CylinderGeometry(0.0355 * s, 0.0355 * s, 0.06 * s, 7), 0xe9e4d4),
    ];
  } else {
    parts = [
      colored(new THREE.CylinderGeometry(0.033 * s, 0.033 * s, 0.17 * s, 7), 0x3d6b2a),
      colored(new THREE.CylinderGeometry(0.012 * s, 0.033 * s, 0.06 * s, 7).translate(0, 0.115 * s, 0), 0x3d6b2a),
      colored(new THREE.CylinderGeometry(0.0335 * s, 0.0335 * s, 0.05 * s, 7).translate(0, -0.01 * s, 0), 0xe0c060),
    ];
  }
  // Lay it on its side, resting on the ground.
  return merge(parts).rotateZ(Math.PI / 2).translate(0, 0.033 * s, 0);
}

/** Budapest-style public bin: dark green post bin with a lid. Origin on the ground. */
export function binGeometry() {
  return merge([
    colored(new THREE.CylinderGeometry(0.28, 0.24, 0.8, 10).translate(0, 0.5, 0), 0x2f4a3a),
    colored(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 10).translate(0, 0.94, 0), 0x22362a),
    colored(new THREE.BoxGeometry(0.08, 0.12, 0.08).translate(0, 0.04, 0), 0x333333),
    colored(new THREE.CylinderGeometry(0.285, 0.285, 0.06, 10).translate(0, 0.72, 0), 0xc9a227),
  ]);
}

/** Concrete planter with a shrub; hidden spots sit behind these. */
export function planterGeometry() {
  return merge([
    colored(new THREE.BoxGeometry(1.1, 0.55, 0.7).translate(0, 0.275, 0), 0x9c968b),
    colored(new THREE.IcosahedronGeometry(0.5, 0).scale(1, 0.7, 0.7).translate(0, 0.8, 0), 0x55803e),
  ]);
}

/** Party leftovers: two beer crates and a heap of cans. */
export function partyGeometry() {
  const cans: THREE.BufferGeometry[] = [];
  const can = itemGeometry('can');
  for (let i = 0; i < 14; i++) {
    const a = i * 2.4, r = 0.15 + (i % 5) * 0.12;
    cans.push(can.clone().rotateY(a * 1.7).translate(Math.cos(a) * r + 0.5, (i % 3) * 0.04, Math.sin(a) * r));
  }
  const crate = (x: number, y: number, c: number) => colored(new THREE.BoxGeometry(0.4, 0.3, 0.3).translate(x, y + 0.15, 0), c);
  const bottles: THREE.BufferGeometry[] = [];
  const glass = itemGeometry('glass');
  for (let i = 0; i < 6; i++) bottles.push(glass.clone().rotateZ(-Math.PI / 2).translate(-0.6 + (i % 3) * 0.12, 0.42, -0.06 + Math.floor(i / 3) * 0.12));
  return merge([crate(-0.5, 0, 0x2b6e3c), crate(-0.5, 0.3, 0xb8332b), ...cans, ...bottles]);
}

/** Generic blue woven bag with yellow handles, folded on the ground. */
export function bigBagGeometry() {
  return merge([
    colored(new THREE.BoxGeometry(0.7, 0.35, 0.4).translate(0, 0.175, 0), 0x1f4fa8),
    colored(new THREE.TorusGeometry(0.16, 0.025, 4, 10, Math.PI).translate(-0.15, 0.35, 0), 0xf2c418),
    colored(new THREE.TorusGeometry(0.16, 0.025, 4, 10, Math.PI).translate(0.15, 0.35, 0), 0xf2c418),
  ]);
}

/** A soft sparkle sprite texture for glints. */
export function glintTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.2, 'rgba(255,250,200,0.8)');
  grad.addColorStop(1, 'rgba(255,240,160,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(32, 4); g.lineTo(32, 60); g.moveTo(4, 32); g.lineTo(60, 32); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

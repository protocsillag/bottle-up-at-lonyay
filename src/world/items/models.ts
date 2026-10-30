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

/** Side-street bin (reference/bins/mesh-hoop-bin.jpg): a dark green perforated mesh basket
 *  hung in a tall green steel hoop with round foot plates, an ashtray cup on the side and a
 *  mint-green bag folded over the rim and knotted at the front. Origin on the ground. */
export function meshHoopBinGeometry() {
  const green = 0x1f4a32;
  const hoop: THREE.BufferGeometry[] = [];
  for (const x of [-0.27, 0.27]) {
    hoop.push(colored(new THREE.CylinderGeometry(0.025, 0.025, 1.05, 6).translate(x, 0.525, 0), green));
    hoop.push(colored(new THREE.CylinderGeometry(0.08, 0.08, 0.015, 10).translate(x, 0.008, 0), green));
  }
  hoop.push(colored(new THREE.TorusGeometry(0.27, 0.025, 5, 12, Math.PI).translate(0, 1.05, 0), green));
  return merge([
    ...hoop,
    colored(new THREE.CylinderGeometry(0.2, 0.18, 0.55, 12, 1, true).translate(0, 0.55, 0), 0x2a3a30), // mesh basket
    colored(new THREE.CylinderGeometry(0.18, 0.18, 0.02, 12).translate(0, 0.28, 0), 0x2a3a30),
    colored(new THREE.CylinderGeometry(0.215, 0.2, 0.12, 12, 1, true).translate(0, 0.79, 0), 0x3fd3b0), // bag over the rim
    colored(new THREE.BoxGeometry(0.1, 0.12, 0.06).translate(0, 0.7, -0.21), 0x3fd3b0), // the knot
    colored(new THREE.CylinderGeometry(0.06, 0.04, 0.06, 8).translate(-0.27, 0.7, -0.08), 0x1b1b1b), // ashtray cup
  ]);
}

/** Main-street bin (reference/bins/lime-post-bin.jpg): a lime-green plastic bin with a hood
 *  over the opening on a galvanised post, a "throw it in" pictogram and a steel ashtray box. */
export function limePostBinGeometry() {
  return merge([
    colored(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 8).translate(0, 0.55, 0.2), 0xa8adb0),
    colored(new THREE.BoxGeometry(0.42, 0.6, 0.34).translate(0, 0.72, 0), 0x8ccf2e),
    colored(new THREE.CylinderGeometry(0.21, 0.21, 0.42, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).scale(1, 0.55, 0.9).translate(0, 1.02, 0), 0x8ccf2e),
    colored(new THREE.BoxGeometry(0.3, 0.1, 0.02).translate(0, 1.0, -0.175), 0x1b2a10), // opening under the hood
    colored(new THREE.BoxGeometry(0.16, 0.2, 0.01).translate(0.05, 0.75, -0.175), 0x1b1b1b), // pictogram
    colored(new THREE.BoxGeometry(0.12, 0.1, 0.06).translate(0.05, 0.58, -0.2), 0xb8bcc0), // ashtray box
  ]);
}

/** A 240 l two-wheeled wheelie bin (reference/bins/wheelie-bins-out-and-skip.jpg). */
export function wheelieGeometry(body: number, lid: number) {
  return merge([
    colored(new THREE.BoxGeometry(0.58, 0.95, 0.72).translate(0, 0.55, 0), body),
    colored(new THREE.BoxGeometry(0.62, 0.06, 0.78).translate(0, 1.05, -0.02), lid),
    colored(new THREE.BoxGeometry(0.5, 0.05, 0.06).translate(0, 1.0, 0.39), lid), // handle
    colored(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 10).rotateZ(Math.PI / 2).translate(-0.27, 0.1, 0.3), 0x1b1b1b),
    colored(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 10).rotateZ(Math.PI / 2).translate(0.27, 0.1, 0.3), 0x1b1b1b),
  ]);
}

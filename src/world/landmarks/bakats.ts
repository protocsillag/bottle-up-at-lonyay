import * as THREE from 'three';
import type { CityData, Vec2 } from '../cityData';
import type { Placement } from '../placement';
import { pointInPolygon } from '../collision';
import { colored, obb } from './common';
import { merge } from '../items/models';

// Bakáts tér from Alex's photo and the architect's rendering (reference/bakats-ter/): the
// Ferencváros parish church in orange-red brick with grey stone, a tall slim dark spire
// over a belfry with clocks and pinnacled gables, a smaller side spire with a gold cross,
// an iron railing and hedge; the square with a round central plaza ringed by benches,
// curving pale paths, young trees, beds of ornamental grasses, Ráday-style lamps and a
// flock of pigeons that scatter when you run through.

type Box = { x: number; z: number; w: number; d: number; rot: number };
const CHURCH = 'Assisi Szent Ferenc-templom';

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = false) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

export function bakatsChurchId(city: CityData) { return city.buildings.find((b) => b.name === CHURCH)?.id ?? null; }

export interface Bakats {
  group: THREE.Group;
  colliders: Box[];
  /** Bench seats (for street people and evening groups). */
  benches: Vec2[];
  /** Ráday-style lamp posts around the paths. */
  lamps: { x: number; z: number; angle: number }[];
  update(dt: number, px: number, pz: number, speed: number): void;
}

export function buildBakats(city: CityData, place: Placement): Bakats {
  const group = new THREE.Group();
  group.name = 'bakáts tér';
  const colliders: Box[] = [];
  const benches: Vec2[] = [];
  const lamps: Bakats['lamps'] = [];
  const parts: THREE.BufferGeometry[] = [];
  const vertex = new THREE.MeshLambertMaterial({ vertexColors: true });
  const BRICK = 0xb4532e, STONE = 0xbab6ac, DARK = 0x3a3d42;
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, c: number, m: THREE.Matrix4) => {
    const g = colored(new THREE.BoxGeometry(w, h, d).translate(x, y, z), c); g.applyMatrix4(m); parts.push(g);
  };
  const geo = (g: THREE.BufferGeometry, c: number, m: THREE.Matrix4) => { colored(g, c); g.applyMatrix4(m); parts.push(g); };

  const church = city.buildings.find((b) => b.name === CHURCH);
  const sq = city.landmarks.bakatsTer;
  if (church && sq) {
    const o = obb(church.outer);
    const s = (sq[0] - o.cx) * o.ux + (sq[1] - o.cz) * o.uz > 0 ? 1 : -1;
    // Tower frame: local +z out toward the square, along the church's long axis.
    const tx = o.cx + o.ux * (o.hl - 3.5) * s, tz = o.cz + o.uz * (o.hl - 3.5) * s;
    const rot = Math.atan2(o.ux * s, o.uz * s);
    const m = new THREE.Matrix4().makeRotationY(rot).setPosition(tx, 0, tz);
    const W = 7.4, H = 38;
    box(W, H, W, 0, H / 2, 0, BRICK, m);
    // Grey stone bands and corner quoins.
    for (const y of [6, 14, 22, 27.5, H - 0.4]) box(W + 0.3, 0.6, W + 0.3, 0, y, 0, STONE, m);
    for (const [cx, cz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(0.7, H, 0.7, (cx * W) / 2, H / 2, (cz * W) / 2, STONE, m);
    // Portal at the foot: steps, deep round arch, a statue in a niche above.
    box(5.2, 0.5, 1.6, 0, 0.25, W / 2 + 0.8, STONE, m);
    box(4.6, 0.25, 1.0, 0, 0.62, W / 2 + 0.5, STONE, m);
    geo(new THREE.TorusGeometry(1.5, 0.35, 6, 14, Math.PI).translate(0, 3.6, W / 2 + 0.15), STONE, m);
    box(0.7, 3.6, 0.7, -1.5, 1.8, W / 2 + 0.15, STONE, m);
    box(0.7, 3.6, 0.7, 1.5, 1.8, W / 2 + 0.15, STONE, m);
    box(2.3, 3.4, 0.1, 0, 1.75, W / 2 + 0.02, 0x2a1a12, m);
    geo(new THREE.CircleGeometry(1.15, 12, 0, Math.PI).translate(0, 3.45, W / 2 + 0.02), 0x2a1a12, m);
    box(1.2, 2.2, 0.3, 0, 7.6, W / 2 + 0.05, STONE, m);
    geo(new THREE.CylinderGeometry(0.22, 0.3, 1.5, 8).translate(0, 7.5, W / 2 + 0.3), 0xd8d4c8, m);
    geo(new THREE.SphereGeometry(0.18, 8, 6).translate(0, 8.45, W / 2 + 0.3), 0xd8d4c8, m);
    // Tall arched window and the stone arcade frieze.
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      const fm = m.clone().multiply(new THREE.Matrix4().makeRotationY(a));
      box(1.4, 5.0, 0.1, 0, 17.5, W / 2 + 0.02, 0x1e2630, fm);
      geo(new THREE.CircleGeometry(0.7, 10, 0, Math.PI).translate(0, 20.0, W / 2 + 0.02), 0x1e2630, fm);
      for (let k = -3; k <= 3; k++) geo(new THREE.TorusGeometry(0.42, 0.08, 4, 8, Math.PI).translate(k * 0.95, 24.0, W / 2 + 0.1), STONE, fm);
      // Belfry: tall narrow louvred openings, a clock face above.
      for (const x of [-1.3, 1.3]) {
        box(0.8, 5.0, 0.1, x, 31, W / 2 + 0.02, 0x1a1612, fm);
        for (let y = 29; y < 33.4; y += 0.5) box(0.8, 0.06, 0.12, x, y, W / 2 + 0.06, 0x5a4a3a, fm);
      }
      // Triangular gable with pinnacles at the base of the spire.
      const gable = new THREE.Shape([new THREE.Vector2(-W / 2, 0), new THREE.Vector2(W / 2, 0), new THREE.Vector2(0, 3.2)]);
      geo(new THREE.ExtrudeGeometry(gable, { depth: 0.4, bevelEnabled: false }).translate(0, H, W / 2 - 0.4), BRICK, fm);
    }
    for (const [cx, cz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      box(0.5, 2.6, 0.5, (cx * W) / 2, H + 1.3, (cz * W) / 2, STONE, m);
      geo(new THREE.ConeGeometry(0.35, 1.6, 4).translate((cx * W) / 2, H + 3.4, (cz * W) / 2), DARK, m);
    }
    // Tall, slim dark grey spire with a gold cross.
    geo(new THREE.ConeGeometry(3.0, 26, 8).translate(0, H + 13, 0), DARK, m);
    box(0.2, 2.4, 0.2, 0, H + 27, 0, 0xd8b84a, m);
    box(1.2, 0.2, 0.2, 0, H + 27.5, 0, 0xd8b84a, m);
    // Clock faces on all four sides.
    const clockTex = canvasTex(128, 128, (g) => {
      g.fillStyle = '#f2efe6'; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#1d1d1d'; g.lineWidth = 6; g.stroke();
      g.fillStyle = '#1d1d1d'; for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.fillRect(64 + Math.cos(a) * 52 - 3, 64 + Math.sin(a) * 52 - 3, 6, 6); }
      g.lineWidth = 6; g.beginPath(); g.moveTo(64, 64); g.lineTo(40, 30); g.moveTo(64, 64); g.lineTo(64, 18); g.stroke();
    });
    const clockMat = new THREE.MeshLambertMaterial({ map: clockTex, transparent: true });
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      const face = new THREE.Mesh(new THREE.CircleGeometry(1.3, 20), clockMat);
      const p = new THREE.Vector3(Math.sin(a) * (W / 2 + 0.05), 35.4, Math.cos(a) * (W / 2 + 0.05)).applyMatrix4(m);
      face.position.copy(p);
      face.rotation.y = rot + a;
      group.add(face);
    }
    // The smaller side tower and spire, beside the nave.
    const side = m.clone().multiply(new THREE.Matrix4().makeTranslation(W / 2 + 2.6, 0, -5));
    box(3.6, 22, 3.6, 0, 11, 0, BRICK, side);
    box(3.9, 0.5, 3.9, 0, 22, 0, STONE, side);
    geo(new THREE.ConeGeometry(1.8, 10, 8).translate(0, 27, 0), DARK, side);
    box(0.14, 1.6, 0.14, 0, 32.6, 0, 0xe8c040, side);
    box(0.8, 0.14, 0.14, 0, 32.9, 0, 0xe8c040, side);
    colliders.push(boxFrom(side, 3.6, 3.6, rot));
    colliders.push(boxFrom(m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, W / 2 + 0.8)), 5.2, 1.6, rot));
    // Iron railing and a low hedge around the church, 1.6 m out, open at the portal.
    const ring = church.outer;
    const rails: THREE.Matrix4[] = [];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], c = ring[(i + 1) % ring.length];
      const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (len < 1.5) continue;
      let nx = (c[1] - a[1]) / len, nz = -(c[0] - a[0]) / len;
      if (pointInPolygon((a[0] + c[0]) / 2 + nx * 0.3, (a[1] + c[1]) / 2 + nz * 0.3, ring)) { nx = -nx; nz = -nz; }
      for (let t = 0.5; t < len; t += 0.18) {
        const x = a[0] + ((c[0] - a[0]) * t) / len + nx * 1.6, z = a[1] + ((c[1] - a[1]) * t) / len + nz * 1.6;
        if (Math.hypot(x - (tx + o.ux * s * 4.5), z - (tz + o.uz * s * 4.5)) < 3.5) continue;
        if (!place.free(x, z, 0.1)) continue;
        rails.push(new THREE.Matrix4().makeTranslation(x, 0, z));
      }
      const mx = (a[0] + c[0]) / 2 + nx * 1.0, mz = (a[1] + c[1]) / 2 + nz * 1.0;
      if (place.free(mx, mz, 0.2)) parts.push(colored(new THREE.BoxGeometry(0.6, 0.6, len).rotateY(Math.atan2(c[0] - a[0], c[1] - a[1])).translate(mx, 0.3, mz), 0x3a6a34));
    }
    const railMesh = new THREE.InstancedMesh(colored(new THREE.BoxGeometry(0.03, 1.3, 0.03).translate(0, 0.65, 0), 0x1d1d1d), vertex, rails.length);
    rails.forEach((r, i) => railMesh.setMatrixAt(i, r));
    group.add(railMesh);
  }

  // ---- The square.
  const park = city.areas.find((a) => a.kind === 'park' && sq && pointInPolygon(sq[0], sq[1], a.outer))
    ?? city.areas.filter((a) => a.kind === 'park' && sq).sort((p, q) => dist(p.outer, sq!) - dist(q.outer, sq!))[0];
  const pigeons: { x: number; z: number; y: number; vx: number; vz: number; vy: number; home: Vec2; t: number; phase: number }[] = [];
  let pigeonMesh: THREE.InstancedMesh | null = null;
  if (park) {
    const ring = park.outer;
    let cx = 0, cz = 0;
    for (const [x, z] of ring) { cx += x; cz += z; }
    cx /= ring.length; cz /= ring.length;
    // Round central plaza with a radial paving pattern, ringed by benches facing inward.
    const R = 7.5;
    const pave = canvasTex(512, 512, (g) => {
      g.fillStyle = '#9a968c'; g.fillRect(0, 0, 512, 512);
      for (let r = 20; r < 256; r += 22) for (let a = 0; a < Math.PI * 2; a += 0.12 + 6 / r) {
        const v = 180 + ((r + Math.floor(a * 10)) % 5) * 8;
        g.strokeStyle = `rgb(${v},${v - 4},${v - 12})`; g.lineWidth = 16;
        g.beginPath(); g.arc(256, 256, r, a, a + 0.1 + 4 / r); g.stroke();
      }
      g.fillStyle = '#d8d0c0'; g.beginPath(); g.arc(256, 256, 18, 0, Math.PI * 2); g.fill();
    });
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(R, 40).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: pave, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -16 }));
    plaza.position.set(cx, 0.045, cz);
    plaza.receiveShadow = true;
    group.add(plaza);
    // Pale curving paths from the plaza out to the corners of the square.
    const pathMat = new THREE.MeshLambertMaterial({ color: 0xd8d2c4, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -12 });
    for (const [x, z] of ring) {
      const len = Math.hypot(x - cx, z - cz);
      const ux = (x - cx) / len, uz = (z - cz) / len;
      const pts: THREE.Vector3[] = [];
      for (let t = 0; t <= 1.001; t += 0.1) {
        const bend = Math.sin(t * Math.PI) * 6;
        pts.push(new THREE.Vector3(cx + ux * len * t - uz * bend, 0.04, cz + uz * len * t + ux * bend));
      }
      const pos: number[] = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
        const nx = -dz / l * 1.6, nz = dx / l * 1.6;
        pos.push(a.x - nx, 0.04, a.z - nz, b.x - nx, 0.04, b.z - nz, b.x + nx, 0.04, b.z + nz, a.x - nx, 0.04, a.z - nz, b.x + nx, 0.04, b.z + nz, a.x + nx, 0.04, a.z + nz);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, pathMat);
      mesh.material.side = THREE.DoubleSide;
      mesh.receiveShadow = true;
      group.add(mesh);
      // A lamp halfway along each path, and a bench pair.
      const mid = pts[5];
      lamps.push({ x: mid.x - uz * 2.2, z: mid.z + ux * 2.2, angle: Math.atan2(uz, -ux) });
      for (const k of [3, 7]) {
        const p = pts[k];
        const bx = p.x + uz * 2.3, bz = p.z - ux * 2.3;
        if (!place.free(bx, bz, 0.4)) continue;
        addBench(bx, bz, Math.atan2(-uz, ux));
      }
    }
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.3;
      addBench(cx + Math.cos(a) * (R + 1.0), cz + Math.sin(a) * (R + 1.0), Math.atan2(-Math.cos(a), -Math.sin(a)));
    }
    // Young trees and beds of tall ornamental grasses on the lawns.
    let k = 0;
    for (let x = cx - 60; x < cx + 60; x += 9) for (let z = cz - 60; z < cz + 60; z += 9) {
      k++;
      const jx = x + Math.sin(k * 3.7) * 2.5, jz = z + Math.cos(k * 5.1) * 2.5;
      if (!pointInPolygon(jx, jz, ring) || Math.hypot(jx - cx, jz - cz) < R + 4 || !place.free(jx, jz, 1)) continue;
      if (k % 3 === 0) {
        for (let i = 0; i < 5; i++) parts.push(colored(new THREE.ConeGeometry(0.35, 1.3, 5).translate(jx + Math.cos(i * 1.3) * 0.7, 0.65, jz + Math.sin(i * 1.3) * 0.7), i % 2 ? 0xc8b878 : 0xa8a060));
      } else if (k % 3 === 1) {
        parts.push(colored(new THREE.CylinderGeometry(0.06, 0.08, 2.6, 6).translate(jx, 1.3, jz), 0x7a6a52));
        parts.push(colored(new THREE.IcosahedronGeometry(1.0, 0).translate(jx, 3.1, jz), 0x6a9a44));
        colliders.push({ x: jx, z: jz, w: 0.3, d: 0.3, rot: 0 });
      }
    }
    // Pigeons on the plaza.
    for (let i = 0; i < 18; i++) {
      const a = i * 2.4, r = 1.5 + (i % 5) * 1.1;
      const home: Vec2 = [cx + Math.cos(a) * r, cz + Math.sin(a) * r];
      pigeons.push({ x: home[0], z: home[1], y: 0, vx: 0, vz: 0, vy: 0, home, t: 0, phase: i });
    }
    const bird = merge([
      colored(new THREE.SphereGeometry(0.11, 6, 4).scale(1, 0.8, 1.5), 0x7a7e86),
      colored(new THREE.SphereGeometry(0.065, 6, 4).translate(0, 0.08, 0.14), 0x5a6a72),
      colored(new THREE.BoxGeometry(0.03, 0.03, 0.05).translate(0, 0.07, 0.21), 0xd88a3a),
      colored(new THREE.BoxGeometry(0.14, 0.02, 0.1).translate(0, 0.02, -0.18), 0x5a5e66),
    ]);
    pigeonMesh = new THREE.InstancedMesh(bird, vertex, pigeons.length);
    pigeonMesh.frustumCulled = false;
    group.add(pigeonMesh);
  }

  function addBench(x: number, z: number, rot: number) {
    const m = new THREE.Matrix4().makeRotationY(rot).setPosition(x, 0, z);
    box(1.8, 0.06, 0.45, 0, 0.45, 0, 0xa8784a, m);
    box(1.8, 0.4, 0.05, 0, 0.72, -0.22, 0xa8784a, m);
    for (const s of [-0.75, 0.75]) box(0.06, 0.45, 0.45, s, 0.22, 0, 0x2b2e30, m);
    benches.push([x, z]);
    colliders.push({ x, z, w: 1.8, d: 0.5, rot });
  }

  if (parts.length) {
    const mesh = new THREE.Mesh(merge(parts), vertex);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }

  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), at = new THREE.Vector3();
  let clock = 0;
  return {
    group, colliders, benches, lamps,
    update(dt: number, px: number, pz: number, speed: number) {
      if (!pigeonMesh) return;
      clock += dt;
      const near = pigeons.length && Math.hypot(px - pigeons[0].home[0], pz - pigeons[0].home[1]) < 60;
      if (!near) return;
      pigeons.forEach((p, i) => {
        const d = Math.hypot(p.x - px, p.z - pz);
        if (p.t <= 0 && d < (speed > 3 ? 5 : 1.6)) {
          // Scatter: up and away from the player.
          const ax = (p.x - px) / (d || 1), az = (p.z - pz) / (d || 1);
          p.vx = ax * 6 + Math.sin(i) * 2; p.vz = az * 6 + Math.cos(i) * 2; p.vy = 4;
          p.t = 14 + (i % 5) * 2;
        }
        if (p.t > 0) {
          p.t -= dt;
          if (p.t > 10) { p.x += p.vx * dt; p.z += p.vz * dt; p.y = Math.min(12, p.y + p.vy * dt); }
          else if (p.t > 0) {
            // Glide back home and land.
            p.x += (p.home[0] - p.x) * Math.min(1, dt * 0.6);
            p.z += (p.home[1] - p.z) * Math.min(1, dt * 0.6);
            p.y = Math.max(0, p.y - dt * 1.5);
          } else { p.y = 0; }
        }
        const peck = p.y === 0 ? Math.max(0, Math.sin(clock * 3 + p.phase * 1.7)) * 0.25 : 0;
        const yaw = p.t > 0 ? Math.atan2(p.vx, p.vz) : p.phase + Math.sin(clock * 0.3 + p.phase) * 1.5;
        q.setFromEuler(new THREE.Euler(peck, yaw, 0, 'YXZ'));
        at.set(p.x, 0.1 + p.y, p.z);
        pigeonMesh!.setMatrixAt(i, mtx.compose(at, q, one));
      });
      pigeonMesh.instanceMatrix.needsUpdate = true;
    },
  };
}

function dist(ring: Vec2[], p: Vec2) { return Math.min(...ring.map(([x, z]) => Math.hypot(x - p[0], z - p[1]))); }

function boxFrom(m: THREE.Matrix4, w: number, d: number, rot: number): Box {
  const p = new THREE.Vector3().setFromMatrixPosition(m);
  return { x: p.x, z: p.z, w, d, rot };
}

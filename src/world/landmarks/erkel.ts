import * as THREE from 'three';
import type { Building, CityData, Vec2 } from '../cityData';
import type { Placement } from '../placement';
import { pointInPolygon } from '../collision';
import { colored, obb, signTexture } from './common';
import { merge } from '../items/models';
import { streetFacades, type Facade } from './lonyay';
import { firewallTexture } from './raday';

// Erkel utca and Török Pál utca from Alex's photos (reference/erkel-torok-pal-utca/):
// yellow shared-lane bike symbols with double chevrons, ball-top bollards along the
// kerbs, the long grey neo-Renaissance palace, the old single-storey graffiti house with
// its little checked-tablecloth terrace, and an ochre block with an octagonal sign.

const STREETS = ['Erkel utca', 'Török Pál utca'];
type Box = { x: number; z: number; w: number; d: number; rot: number };

function hash(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
const area = (ring: Vec2[]) => Math.abs(ring.reduce((a, p, i) => { const q = ring[(i + 1) % ring.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;

export interface ErkelPrep { palace: Facade | null; house: Facade | null; ochre: Facade | null; }

/** Picks the buildings before the city is built: the palace (grey-beige, palace facade),
 *  the old low house (dropped to one storey and hand-built) and the ochre block. */
export function prepareErkel(city: CityData, colors: Map<string, number>, taken: Set<Building>): ErkelPrep {
  const fronts = STREETS.flatMap((s) => streetFacades(city, s, 12)).filter((f) => !taken.has(f.b));
  const palace = fronts.filter((f) => f.b.h >= 14).sort((p, q) => q.len - p.len)[0] ?? null;
  const shopAt = (b: Building) => city.shops.some((s) => pointInPolygon(s.p[0], s.p[1], b.outer));
  const count = new Map<Building, number>();
  for (const f of fronts) count.set(f.b, (count.get(f.b) ?? 0) + 1);
  const house = fronts
    .filter((f) => f.b !== palace?.b && f.len > 9 && f.len < 22 && count.get(f.b) === 1 && !f.b.holes?.length && area(f.b.outer) < 420 && !shopAt(f.b))
    .sort((p, q) => area(p.b.outer) - area(q.b.outer))[0] ?? null;
  if (palace) colors.set(palace.b.id, 0xb9b3a6);
  if (house) house.b.h = 4.4; // no gate, no courtyard: a single storey
  // The ochre block: across the street from the house.
  let ochre: Facade | null = null;
  if (house) {
    const hx = (house.a[0] + house.c[0]) / 2, hz = (house.a[1] + house.c[1]) / 2;
    ochre = fronts.filter((f) => f.b !== house.b && f.b !== palace?.b && f.nx * house.nx + f.nz * house.nz < -0.7)
      .sort((p, q) => Math.hypot((p.a[0] + p.c[0]) / 2 - hx, (p.a[1] + p.c[1]) / 2 - hz) - Math.hypot((q.a[0] + q.c[0]) / 2 - hx, (q.a[1] + q.c[1]) / 2 - hz))[0] ?? null;
    if (ochre) colors.set(ochre.b.id, 0xd2a24c);
  }
  return { palace, house, ochre };
}

function tex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Peeling yellow plaster covered in colourful graffiti pieces up to the eaves. */
const houseWallTexture = () => tex(512, 128, (g) => {
  g.fillStyle = '#d8b860'; g.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 26; i++) { g.fillStyle = 'rgba(150,120,90,0.55)'; g.fillRect((i * 97) % 512, (i * 53) % 110, 14 + (i % 5) * 9, 6 + (i % 4) * 5); }
  const pieces = [['BUMM', '#2a9ad8', '#f2e23a'], ['ŰR', '#e8462a', '#1d1d1d'], ['KÖD', '#8a3ad8', '#f4f4f4'], ['ZIZI', '#2ab86a', '#1d1d1d']];
  pieces.forEach(([w, fill, line], i) => {
    g.save(); g.translate(64 + i * 128, 70); g.rotate((i % 2 ? 1 : -1) * 0.08);
    g.font = '900 54px "Arial Black", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round'; g.lineWidth = 12; g.strokeStyle = line; g.strokeText(w, 0, 0);
    g.fillStyle = fill; g.fillText(w, 0, 0);
    g.restore();
  });
});

export interface Erkel { group: THREE.Group; colliders: Box[]; skip: Set<string>; }

export function buildErkel(city: CityData, place: Placement, prep: ErkelPrep): Erkel {
  const group = new THREE.Group();
  group.name = 'erkel & török pál';
  const colliders: Box[] = [];
  const vertex = new THREE.MeshLambertMaterial({ vertexColors: true });
  const roads = city.roads.filter((r) => r.kind === 'road' && r.name && STREETS.includes(r.name));

  // ---- Shared-lane markings: a yellow bike with double chevrons, each direction.
  const bikeTex = tex(128, 384, (g) => {
    g.strokeStyle = '#e0b81e'; g.fillStyle = '#e0b81e'; g.lineWidth = 8;
    for (const [x, y] of [[64, 80], [64, 200]]) { g.beginPath(); g.arc(x, y, 32, 0, Math.PI * 2); g.stroke(); }
    g.beginPath(); g.moveTo(64, 80); g.lineTo(64, 200); g.moveTo(64, 140); g.lineTo(30, 120); g.moveTo(64, 80); g.lineTo(40, 70); g.stroke();
    for (const y of [270, 320]) { g.beginPath(); g.moveTo(14, y + 34); g.lineTo(64, y); g.lineTo(114, y + 34); g.lineTo(114, y + 50); g.lineTo(64, y + 16); g.lineTo(14, y + 50); g.closePath(); g.fill(); }
  });
  bikeTex.colorSpace = THREE.NoColorSpace;
  const marks: THREE.Matrix4[] = [];
  const balls: THREE.Matrix4[] = [];
  for (const r of roads) {
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 12) continue;
      const ux = (bx - ax) / len, uz = (bz - az) / len;
      for (let t = 10; t < len - 8; t += 40) for (const dir of [1, -1]) {
        // Right-hand lane, chevrons pointing the way of travel.
        const off = 1.6 * dir;
        const x = ax + ux * (t + (dir < 0 ? 6 : 0)) - uz * off, z = az + uz * (t + (dir < 0 ? 6 : 0)) + ux * off;
        marks.push(new THREE.Matrix4().makeRotationY(Math.atan2(-ux * dir, -uz * dir)).setPosition(x, 0.064, z));
      }
      // Black ball-top bollards along both kerbs, in short rows.
      for (let t = 4; t < len - 4; t += 2.2) {
        if (Math.floor(t / 11) % 2) continue;
        for (const s of [-1, 1]) {
          const x = ax + ux * t - uz * (r.w / 2 + 0.35) * s, z = az + uz * t + ux * (r.w / 2 + 0.35) * s;
          if (!place.free(x, z, 0.4)) continue;
          balls.push(new THREE.Matrix4().makeTranslation(x, 0, z));
          colliders.push({ x, z, w: 0.2, d: 0.2, rot: 0 });
        }
      }
    }
  }
  const markMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.9, 2.7).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ map: bikeTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -24 }), marks.length);
  marks.forEach((m, i) => markMesh.setMatrixAt(i, m));
  group.add(markMesh);
  const ballGeo = merge([
    colored(new THREE.CylinderGeometry(0.07, 0.08, 0.75, 8).translate(0, 0.375, 0), 0x1b1b1b),
    colored(new THREE.SphereGeometry(0.11, 10, 6).translate(0, 0.82, 0), 0x1b1b1b),
  ]);
  const ballMesh = new THREE.InstancedMesh(ballGeo, vertex, balls.length);
  balls.forEach((m, i) => ballMesh.setMatrixAt(i, m));
  ballMesh.castShadow = true;
  group.add(ballMesh);

  const skip = new Set<string>();
  const parts: THREE.BufferGeometry[] = [];
  // ---- The palace: a granite plinth, heavy arches over the ground-floor windows, a
  // dark red service door and a deep dentil cornice.
  if (prep.palace) {
    const f = prep.palace;
    const m = facadeFrame(f);
    put(parts, new THREE.BoxGeometry(f.len, 0.7, 0.12).translate(0, 0.35, 0.06), 0x6a6862, m);
    for (let t = -f.len / 2 + 2.5; t < f.len / 2 - 2; t += 4.2) {
      put(parts, new THREE.TorusGeometry(1.0, 0.22, 4, 10, Math.PI).translate(t, 3.0, 0.1), 0xa29c8e, m);
      put(parts, new THREE.BoxGeometry(0.5, 0.6, 0.3).translate(t, 4.05, 0.12), 0xa29c8e, m);
    }
    put(parts, new THREE.BoxGeometry(1.4, 2.4, 0.06).translate(-f.len / 2 + 4.6, 1.2, 0.04), 0x6a1e1e, m);
    for (let t = -f.len / 2; t < f.len / 2; t += 0.5) put(parts, new THREE.BoxGeometry(0.22, 0.25, 0.35).translate(t, f.b.h - 1.0, 0.2), 0xa8a294, m);
    put(parts, new THREE.BoxGeometry(f.len, 0.3, 0.6).translate(0, f.b.h - 0.75, 0.3), 0xb0aa9c, m);
  }

  // ---- The old low house: hand-built over its footprint.
  if (prep.house) {
    const f = prep.house;
    const b = f.b;
    skip.add(b.id);
    const wallTex = houseWallTexture();
    wallTex.wrapS = THREE.RepeatWrapping;
    const H = 3.6;
    const ring = b.outer;
    const pos: number[] = [], uv: number[] = [];
    let u = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], c = ring[(i + 1) % ring.length];
      const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      const u1 = u + len / 12;
      pos.push(a[0], 0, a[1], c[0], 0, c[1], c[0], H, c[1], a[0], 0, a[1], c[0], H, c[1], a[0], H, a[1]);
      // Seen from outside, u must grow to the right or the pieces read mirrored.
      let nx = (c[1] - a[1]) / len, nz = -(c[0] - a[0]) / len;
      if (pointInPolygon((a[0] + c[0]) / 2 + nx * 0.3, (a[1] + c[1]) / 2 + nz * 0.3, ring)) { nx = -nx; nz = -nz; }
      const [ua, uc] = (c[0] - a[0]) * nz - (c[1] - a[1]) * nx > 0 ? [u, u1] : [u1, u];
      uv.push(ua, 0, uc, 0, uc, 1, ua, 0, uc, 1, ua, 1);
      u = u1;
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    wg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    wg.computeVertexNormals();
    const walls = new THREE.Mesh(wg, new THREE.MeshLambertMaterial({ map: wallTex, side: THREE.DoubleSide }));
    walls.castShadow = walls.receiveShadow = true;
    group.add(walls);
    // Steep brown tiled hip roof over the footprint's box, with a brick chimney.
    const o = obb(ring);
    const roofGeo = new THREE.ConeGeometry(1, 1, 4, 1).rotateY(Math.PI / 4);
    roofGeo.scale(o.hl * Math.SQRT2 + 0.4, 3.2, o.hw * Math.SQRT2 + 0.4);
    roofGeo.rotateY(-Math.atan2(o.uz, o.ux));
    roofGeo.translate(o.cx, H + 1.6, o.cz);
    parts.push(colored(roofGeo, 0x7a4a2e));
    parts.push(colored(new THREE.BoxGeometry(0.5, 1.6, 0.5).translate(o.cx + o.ux * o.hl * 0.4, H + 2.2, o.cz + o.uz * o.hl * 0.4), 0x8a4a34));
    // Small windows and two arched doors on the street front.
    const m = facadeFrame(f);
    for (const t of [-0.32, 0.32]) {
      put(parts, new THREE.BoxGeometry(0.9, 1.1, 0.05).translate(t * f.len, 2.0, 0.03), 0x2a3038, m);
      put(parts, new THREE.BoxGeometry(1.1, 0.12, 0.12).translate(t * f.len, 1.4, 0.06), 0xe8dcc0, m);
    }
    for (const t of [-0.08, 0.12]) {
      put(parts, new THREE.BoxGeometry(1.0, 2.0, 0.05).translate(t * f.len, 1.0, 0.03), 0x5a3a24, m);
      put(parts, new THREE.CircleGeometry(0.5, 10, 0, Math.PI).translate(t * f.len, 2.0, 0.035), 0x5a3a24, m);
      // Wall lantern beside each door.
      put(parts, new THREE.BoxGeometry(0.16, 0.26, 0.16).translate(t * f.len + 0.75, 2.3, 0.12), 0x1d1d1d, m);
    }
    // Firewalls of the taller neighbours rising behind it.
    const fw = firewallTexture();
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], c = ring[(i + 1) % ring.length];
      const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (len < 2) continue;
      const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
      let nx = (c[1] - a[1]) / len, nz = -(c[0] - a[0]) / len;
      if (pointInPolygon(mx + nx * 0.3, mz + nz * 0.3, ring)) { nx = -nx; nz = -nz; } // outward
      const nb = place.buildings.near(mx, mz).find((q) => q !== b && pointInPolygon(mx + nx * 0.5, mz + nz * 0.5, q.outer));
      if (!nb || nb.h <= H + 1) continue;
      const t2 = fw.clone(); t2.needsUpdate = true; t2.wrapS = t2.wrapT = THREE.RepeatWrapping; t2.repeat.set(len / 6, (nb.h - H) / 6);
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(len, nb.h - H), new THREE.MeshLambertMaterial({ map: t2 }));
      wall.position.set(mx - nx * 0.05, H + (nb.h - H) / 2, mz - nz * 0.05);
      wall.rotation.y = Math.atan2(-nx, -nz);
      group.add(wall);
    }
    // The terrace: green grass mat, tables with red-and-white checked cloths, black
    // bistro chairs, a closed parasol.
    const check = tex(64, 64, (g) => { for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { g.fillStyle = (i + j) % 2 ? '#f4f4f0' : '#c8202c'; g.fillRect(i * 8, j * 8, 8, 8); } });
    const cloth = new THREE.MeshLambertMaterial({ map: check });
    const depth = 2.2;
    put(parts, new THREE.BoxGeometry(f.len * 0.7, 0.03, depth).translate(0, 0.075, depth / 2 + 0.3), 0x4f9a3a, m);
    for (const t of [-0.22, 0.22]) {
      const tm = m.clone().multiply(new THREE.Matrix4().makeTranslation(t * f.len, 0, 1.4));
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.04, 0.8).translate(0, 0.76, 0), cloth);
      top.applyMatrix4(tm);
      group.add(top);
      put(parts, new THREE.BoxGeometry(0.82, 0.18, 0.82).translate(0, 0.66, 0), 0xe8e4dc, tm);
      put(parts, new THREE.CylinderGeometry(0.03, 0.03, 0.7, 6).translate(0, 0.35, 0), 0x1d1d1d, tm);
      for (const s of [-1, 1]) {
        put(parts, new THREE.BoxGeometry(0.4, 0.04, 0.4).translate(s * 0.62, 0.45, 0), 0x1d1d1d, tm);
        put(parts, new THREE.BoxGeometry(0.04, 0.42, 0.4).translate(s * 0.82, 0.66, 0), 0x1d1d1d, tm);
        for (const lz of [-0.17, 0.17]) put(parts, new THREE.CylinderGeometry(0.015, 0.015, 0.45, 4).translate(s * 0.62, 0.22, lz), 0x1d1d1d, tm);
      }
      const p = new THREE.Vector3().setFromMatrixPosition(tm);
      colliders.push({ x: p.x, z: p.z, w: 1.6, d: 0.8, rot: Math.atan2(f.nx, f.nz) });
    }
    const pm = m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, 1.4));
    put(parts, new THREE.CylinderGeometry(0.03, 0.03, 2.6, 6).translate(0, 1.3, 0), 0x6a5a48, pm);
    put(parts, new THREE.ConeGeometry(0.16, 1.4, 8).rotateX(Math.PI).translate(0, 2.0, 0), 0xe8e0cc, pm);
  }

  // ---- The ochre block: arched ground floor and an octagonal restaurant sign.
  if (prep.ochre) {
    const f = prep.ochre;
    const m = facadeFrame(f);
    for (let t = -f.len / 2 + 2; t < f.len / 2 - 1.5; t += 3.6) put(parts, new THREE.TorusGeometry(1.1, 0.16, 4, 10, Math.PI).translate(t, 2.6, 0.08), 0xc0903e, m);
    const signTex = tex(256, 256, (g) => {
      g.fillStyle = '#1f3a2c'; g.beginPath();
      for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + (i * Math.PI) / 4; g.lineTo(128 + Math.cos(a) * 124, 128 + Math.sin(a) * 124); }
      g.closePath(); g.fill();
      g.strokeStyle = '#e8c86a'; g.lineWidth = 8; g.stroke();
      g.fillStyle = '#e8c86a'; g.textAlign = 'center'; g.font = 'bold 40px Georgia, serif';
      g.fillText('PÖRKÖLT', 128, 118); g.font = '30px Georgia, serif'; g.fillText('bisztró', 128, 162);
    });
    const sign = new THREE.Mesh(new THREE.CircleGeometry(0.6, 8), new THREE.MeshLambertMaterial({ map: signTex, transparent: true, side: THREE.DoubleSide }));
    const holder = new THREE.Group();
    holder.add(sign);
    sign.position.set(0, 3.6, 0.85);
    sign.rotation.set(0, Math.PI / 2, Math.PI / 8);
    put(parts, new THREE.BoxGeometry(0.05, 0.05, 1.0).translate(0, 4.25, 0.5), 0x1d1d1d, m);
    holder.applyMatrix4(m);
    group.add(holder);
  }

  // ---- A blue-grey shopfront for rent ("KIADÓ") on the palace's street.
  {
    const f = STREETS.flatMap((s) => streetFacades(city, s, 12))
      .filter((q) => q.b !== prep.palace?.b && q.b !== prep.house?.b && q.b !== prep.ochre?.b && q.len > 8)
      .sort((p, q) => hash(p.b.id) - hash(q.b.id))[0];
    if (f) {
      const m = facadeFrame(f);
      put(parts, new THREE.BoxGeometry(4.2, 3.2, 0.08).translate(0, 1.6, 0.04), 0x6a7a88, m);
      for (const t of [-1.1, 1.1]) put(parts, new THREE.BoxGeometry(1.6, 2.2, 0.06).translate(t, 1.5, 0.09), 0x3a2a1e, m);
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshLambertMaterial({ map: signTexture('KIADÓ', '#f2c418', '#c8202c', 512, 128, 'bold 90px system-ui, sans-serif') }));
      banner.position.set(0, 2.9, 0.14);
      const bh = new THREE.Group(); bh.add(banner); bh.applyMatrix4(m);
      group.add(bh);
    }
  }

  if (parts.length) {
    const mesh = new THREE.Mesh(merge(parts), vertex);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  return { group, colliders, skip };
}

/** Local frame on a facade: origin at its midpoint, +x along it, +z out to the street. */
function facadeFrame(f: Facade) {
  return new THREE.Matrix4().makeRotationY(Math.atan2(f.nx, f.nz)).setPosition((f.a[0] + f.c[0]) / 2, 0, (f.a[1] + f.c[1]) / 2);
}

function put(parts: THREE.BufferGeometry[], g: THREE.BufferGeometry, c: number, m: THREE.Matrix4) {
  colored(g, c);
  g.applyMatrix4(m);
  parts.push(g);
}

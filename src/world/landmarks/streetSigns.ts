import * as THREE from 'three';
import type { CityData, Vec2 } from '../cityData';
import { pointInPolygon } from '../collision';

// Official street-name plates from reference/matyas-utca/: white enamel with black serif
// text, "IX. ker. Ferencváros / Mátyás utca / 12 → 22", on the corner buildings of every
// junction, one per street. House-number ranges are invented (no OSM data for them).

/** Draws one plate into a 512 × 200 cell of the atlas at (ox, oy). */
function drawPlate(g: CanvasRenderingContext2D, ox: number, oy: number, name: string, range: string) {
  g.save();
  g.translate(ox, oy);
  g.fillStyle = '#f4f3ee'; g.fillRect(0, 0, 512, 200);
  g.strokeStyle = '#1b1b1b'; g.lineWidth = 8; g.strokeRect(10, 10, 492, 180);
  g.lineWidth = 2; g.strokeRect(20, 20, 472, 160);
  g.fillStyle = '#1b1b1b'; g.textAlign = 'center';
  g.font = '24px Georgia, "Times New Roman", serif';
  g.fillText('IX. ker. Ferencváros', 256, 52);
  let size = 58;
  g.font = `bold ${size}px Georgia, "Times New Roman", serif`;
  while (g.measureText(name).width > 450 && size > 30) g.font = `bold ${--size}px Georgia, "Times New Roman", serif`;
  g.fillText(name, 256, 118);
  g.font = '28px Georgia, "Times New Roman", serif';
  g.fillText(range, 256, 166);
  g.restore();
}

function hash(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }

export function buildStreetSigns(city: CityData) {
  const group = new THREE.Group();
  group.name = 'street signs';
  // Junctions: nodes shared by two or more differently named roads.
  const at = new Map<string, Set<string>>();
  for (const r of city.roads) {
    if (!r.name || r.bridge) continue;
    for (const p of r.pts) {
      const k = `${p[0]},${p[1]}`;
      (at.get(k) ?? at.set(k, new Set()).get(k)!).add(r.name);
    }
  }
  const streetDir = (name: string, p: Vec2): Vec2 | null => {
    for (const r of city.roads) {
      if (r.name !== name) continue;
      const i = r.pts.findIndex((q) => q[0] === p[0] && q[1] === p[1]);
      if (i < 0) continue;
      const q = r.pts[i === 0 ? 1 : i - 1];
      const d = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
      return [(q[0] - p[0]) / d, (q[1] - p[1]) / d];
    }
    return null;
  };
  const plates = new Map<string, THREE.Matrix4[]>();
  for (const [k, names] of at) {
    if (names.size < 2) continue;
    const [jx, jz] = k.split(',').map(Number);
    if (!pointInPolygon(jx, jz, city.boundary)) continue;
    for (const name of names) {
      const dir = streetDir(name, [jx, jz]);
      if (!dir) continue;
      // The nearest building corner within 22 m, on the edge running along this street.
      let best: { d: number; x: number; z: number; nx: number; nz: number } | null = null;
      for (const b of city.buildings) {
        if (b.scenery) continue;
        const ring = b.outer;
        const [fx, fz] = ring[0];
        if (Math.abs(fx - jx) > 90 || Math.abs(fz - jz) > 90) continue;
        for (let i = 0; i < ring.length; i++) {
          const v = ring[i];
          const d = Math.hypot(v[0] - jx, v[1] - jz);
          if (d > 22 || (best && d >= best.d)) continue;
          for (const w of [ring[(i + 1) % ring.length], ring[(i + ring.length - 1) % ring.length]]) {
            const len = Math.hypot(w[0] - v[0], w[1] - v[1]);
            if (len < 3) continue;
            const ux = (w[0] - v[0]) / len, uz = (w[1] - v[1]) / len;
            if (Math.abs(ux * dir[0] + uz * dir[1]) < 0.85) continue;
            let nx = uz, nz = -ux;
            const px = v[0] + ux * 1.3, pz = v[1] + uz * 1.3;
            if (pointInPolygon(px + nx * 0.2, pz + nz * 0.2, ring)) { nx = -nx; nz = -nz; }
            best = { d, x: px + nx * 0.04, z: pz + nz * 0.04, nx, nz };
          }
        }
      }
      if (!best) continue;
      const m = new THREE.Matrix4().makeRotationY(Math.atan2(best.nx, best.nz)).setPosition(best.x, 3.1, best.z);
      (plates.get(name) ?? plates.set(name, []).get(name)!).push(m);
    }
  }
  // One atlas texture and one merged mesh for every plate in the game.
  const names = [...plates.keys()];
  const cols = 4, rows = Math.ceil(names.length / cols);
  const c = document.createElement('canvas');
  c.width = 512 * cols; c.height = 200 * rows;
  const g = c.getContext('2d')!;
  names.forEach((name, i) => {
    const h = hash(name);
    const a = 1 + (h % 20) * 2, b = a + 6 + (h % 7) * 2;
    drawPlate(g, (i % cols) * 512, Math.floor(i / cols) * 200, name, `${a} → ${b}`);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const pos: number[] = [], uv: number[] = [], nrm: number[] = [];
  const v = new THREE.Vector3(), n = new THREE.Vector3();
  names.forEach((name, i) => {
    const u0 = (i % cols) / cols, u1 = u0 + 1 / cols;
    const v1 = 1 - Math.floor(i / cols) / rows, v0 = v1 - 1 / rows;
    for (const m of plates.get(name)!) {
      const corners = [[-0.31, -0.12, u0, v0], [0.31, -0.12, u1, v0], [0.31, 0.12, u1, v1], [-0.31, 0.12, u0, v1]];
      n.set(0, 0, 1).transformDirection(m);
      for (const idx of [0, 1, 2, 0, 2, 3]) {
        const [x, y, uu, vv] = corners[idx];
        v.set(x, y, 0).applyMatrix4(m);
        pos.push(v.x, v.y, v.z);
        nrm.push(n.x, n.y, n.z);
        uv.push(uu, vv);
      }
    }
  });
  const geo2 = new THREE.BufferGeometry();
  geo2.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo2.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo2.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo2.computeBoundingSphere();
  group.add(new THREE.Mesh(geo2, new THREE.MeshLambertMaterial({ map: tex })));
  return group;
}

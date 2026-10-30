import * as THREE from 'three';
import type { CityData, Vec2 } from '../cityData';
import type { Placement } from '../placement';
import { pointInPolygon } from '../collision';
import { colored, obb } from './common';
import { merge } from '../items/models';

// Kálvin tér from Alex's photos (reference/kalvin-ter/): zigzag slab paving, dozens of
// white terrazzo stone balls, raised granite planting beds and round tree tubs, bike
// racks with a locked blue bike, a green market barrow, the ribbed glass metro dome with
// green glass ventilation towers, and a rooftop billboard for the game itself.

type Box = { x: number; z: number; w: number; d: number; rot: number };

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Grey slabs in interlocking arrow shapes, laid in a zigzag; one repeat = 2 m. */
const zigzagTexture = () => canvasTex(256, 256, (g) => {
  g.fillStyle = '#6a6a66'; g.fillRect(0, 0, 256, 256);
  for (let row = -1; row < 9; row++) for (let col = -1; col < 5; col++) {
    const x = col * 64, y = row * 32;
    const v = 150 + ((row * 5 + col * 3) & 7) * 6;
    g.fillStyle = `rgb(${v},${v},${v - 6})`;
    g.beginPath();
    g.moveTo(x + 2, y + 2); g.lineTo(x + 32, y + 18); g.lineTo(x + 62, y + 2);
    g.lineTo(x + 62, y + 30); g.lineTo(x + 32, y + 46); g.lineTo(x + 2, y + 30);
    g.closePath(); g.fill();
  }
  // A tactile guide strip across it.
  g.fillStyle = '#d8d4c8'; g.fillRect(112, 0, 32, 256);
  g.fillStyle = '#b8b4a8'; for (let y = 0; y < 256; y += 8) g.fillRect(112, y, 32, 3);
});

export interface Kalvin { group: THREE.Group; colliders: Box[]; }

export function buildKalvin(city: CityData, place: Placement): Kalvin {
  const group = new THREE.Group();
  group.name = 'kálvin tér';
  const colliders: Box[] = [];
  const kt = city.landmarks.kalvinTer;
  if (!kt) return { group, colliders };
  const vertex = new THREE.MeshLambertMaterial({ vertexColors: true });
  const parts: THREE.BufferGeometry[] = [];
  const roadSegs = city.roads.filter((r) => r.kind === 'road').flatMap((r) => r.pts.slice(1).map((p, i) => [r.pts[i], p, r.w] as [Vec2, Vec2, number]));
  const offRoad = (x: number, z: number, pad: number) => roadSegs.every(([p, q, w]) => {
    const dx = q[0] - p[0], dz = q[1] - p[1], l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - p[0]) * dx + (z - p[1]) * dz) / l2));
    return Math.hypot(x - p[0] - t * dx, z - p[1] - t * dz) > w / 2 + pad;
  });

  // ---- Paving over the square's plaza areas.
  const plazas = city.areas.filter((a) => a.kind === 'plaza' && a.outer.some(([x, z]) => Math.hypot(x - kt[0], z - kt[1]) < 70));
  const pave = zigzagTexture();
  for (const a of plazas) {
    const shape = new THREE.Shape(a.outer.map(([x, z]) => new THREE.Vector2(x, -z)));
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) { uv[i * 2] = pos.getX(i) / 2; uv[i * 2 + 1] = pos.getZ(i) / 2; }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.translate(0, 0.03, 0);
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: pave, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 }));
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  const inPlaza = (x: number, z: number) => plazas.some((a) => pointInPolygon(x, z, a.outer));

  const balls: THREE.Matrix4[] = [];
  /** Props placed so far (x, z, radius), kept apart. */
  const taken: [number, number, number][] = [];
  // Free spots on the square for the bigger props.
  const free = (p: Vec2, r: number, plaza = true) => (!plaza || inPlaza(p[0], p[1])) && place.free(p[0], p[1], r) && offRoad(p[0], p[1], r) && !taken.some(([x, z, tr]) => Math.hypot(x - p[0], z - p[1]) < r + tr + 0.3);
  const find = (from: Vec2, r: number, plaza = true): Vec2 | null => {
    for (let ring = 0; ring < 40; ring += 2) for (let a = 0; a < 12; a++) {
      const p: Vec2 = [from[0] + Math.cos(a * 0.52) * ring, from[1] + Math.sin(a * 0.52) * ring];
      if (free(p, r, plaza)) return p;
    }
    return null;
  };

  // ---- Metro dome: ribbed glass shell over the stairs, two green glass vent towers.
  {
    const p = find([kt[0] + 18, kt[1] + 2], 3.2, false);
    if (p) {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(4, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 0.7),
        new THREE.MeshLambertMaterial({ color: 0x9ab8c4, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
      dome.position.set(p[0], 0, p[1]);
      group.add(dome);
      for (let i = 0; i < 7; i++) {
        const rib = new THREE.TorusGeometry(4, 0.07, 4, 20, Math.PI).scale(1, 0.55, 1).rotateY((i / 7) * Math.PI);
        rib.scale(1, 1, 0.7);
        rib.translate(p[0], 0, p[1]);
        parts.push(colored(rib, 0x3a3e42));
      }
      parts.push(colored(new THREE.BoxGeometry(3, 0.05, 2).translate(p[0], 0.03, p[1]), 0x1a1a1a)); // the stairwell, dark
      colliders.push({ x: p[0], z: p[1], w: 7.6, d: 5.4, rot: 0 });
      taken.push([p[0], p[1], 4.2]);
      const glass = new THREE.MeshLambertMaterial({ color: 0x3a8a5a, emissive: 0x0a2a14 });
      for (const [dx, dz] of [[6.5, -3], [7.5, 1.2]]) {
        const v = [p[0] + dx, p[1] + dz] as Vec2;
        if (!place.free(v[0], v[1], 1.2) || !offRoad(v[0], v[1], 0.8)) continue;
        const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 5.2, 14), glass);
        tower.position.set(v[0], 2.6, v[1]);
        tower.castShadow = true;
        group.add(tower);
        for (let y = 0.2; y <= 5.2; y += 1.0) parts.push(colored(new THREE.CylinderGeometry(0.84, 0.84, 0.08, 14, 1, true).translate(v[0], y, v[1]), 0x55595c));
        parts.push(colored(new THREE.CylinderGeometry(0.95, 0.95, 0.15, 14).translate(v[0], 5.25, v[1]), 0x55595c));
        colliders.push({ x: v[0], z: v[1], w: 1.6, d: 1.6, rot: 0 });
        taken.push([v[0], v[1], 1]);
      }
    }
  }

  // ---- Raised planting beds with curved white granite walls.
  for (const off of [[10, -18], [-6, 4]] as Vec2[]) {
    const p = find([kt[0] + off[0], kt[1] + off[1]], 3.4);
    if (!p) continue;
    parts.push(colored(new THREE.CylinderGeometry(3, 3, 0.5, 20, 1, true, 0, Math.PI * 1.4).translate(p[0], 0.25, p[1]), 0xe8e4dc));
    parts.push(colored(new THREE.CylinderGeometry(3.05, 3.05, 0.06, 20, 1, false, 0, Math.PI * 1.4).translate(p[0], 0.5, p[1]), 0xd8d4cc));
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 1.3 + 0.1, r = 1.6 + (i % 2) * 0.6;
      parts.push(colored(new THREE.IcosahedronGeometry(0.55, 0).scale(1, 0.6, 1).translate(p[0] + Math.sin(a) * r, 0.7, p[1] + Math.cos(a) * r), i % 3 ? 0x3a6a34 : 0x6a1e24));
    }
    colliders.push({ x: p[0], z: p[1], w: 5.2, d: 5.2, rot: 0 });
    taken.push([p[0], p[1], 3.2]);
  }
  // ---- Round concrete tubs with young trees.
  for (const off of [[-14, -8], [16, 2], [4, -30]] as Vec2[]) {
    const p = find([kt[0] + off[0], kt[1] + off[1]], 1.2);
    if (!p) continue;
    parts.push(colored(new THREE.CylinderGeometry(0.9, 0.8, 0.7, 14).translate(p[0], 0.35, p[1]), 0xa8a49a));
    parts.push(colored(new THREE.CylinderGeometry(0.06, 0.08, 2.4, 6).translate(p[0], 1.6, p[1]), 0x6a5a48));
    parts.push(colored(new THREE.IcosahedronGeometry(0.9, 0).translate(p[0], 3.0, p[1]), 0x5a8a3a));
    colliders.push({ x: p[0], z: p[1], w: 1.6, d: 1.6, rot: 0 });
    taken.push([p[0], p[1], 1]);
  }
  // ---- Galvanised hoop bike racks with a blue road bike locked to one.
  {
    const p = find([kt[0] + 6, kt[1] - 6], 2.2);
    if (p) {
      for (let i = 0; i < 4; i++) {
        const hoop = new THREE.TorusGeometry(0.4, 0.03, 5, 12, Math.PI).translate(0, 0.4, 0);
        hoop.applyMatrix4(new THREE.Matrix4().makeTranslation(p[0] - 1.5 + i, 0, p[1]));
        parts.push(colored(hoop, 0xb8bcc0));
        for (const s of [-0.4, 0.4]) parts.push(colored(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 5).translate(p[0] - 1.5 + i + s, 0.2, p[1]), 0xb8bcc0));
      }
      const bx = p[0] - 0.5;
      for (const s of [-0.55, 0.55]) parts.push(colored(new THREE.TorusGeometry(0.34, 0.03, 4, 14).rotateY(Math.PI / 2).translate(bx + 0.05, 0.36, p[1] + s), 0x1d1d1d));
      parts.push(colored(new THREE.BoxGeometry(0.05, 0.05, 1.0).translate(bx + 0.05, 0.6, p[1]), 0x2457c5));
      parts.push(colored(new THREE.BoxGeometry(0.05, 0.5, 0.05).rotateX(0.3).translate(bx + 0.05, 0.5, p[1] - 0.2), 0x2457c5));
      colliders.push({ x: p[0], z: p[1], w: 4, d: 0.6, rot: 0 });
      taken.push([p[0], p[1], 2.1]);
    }
  }
  // ---- An old green market barrow on spoked wheels, used as a sign stand.
  {
    const p = find([kt[0] - 12, kt[1] + 10], 1.4);
    if (p) {
      parts.push(colored(new THREE.BoxGeometry(1.8, 0.5, 1.0).translate(p[0], 0.95, p[1]), 0x2f5a3a));
      parts.push(colored(new THREE.BoxGeometry(1.2, 0.8, 0.05).translate(p[0], 1.6, p[1]), 0x1d1d1d));
      for (const s of [-0.55, 0.55]) {
        parts.push(colored(new THREE.TorusGeometry(0.5, 0.04, 4, 16).translate(p[0], 0.5, p[1] + s), 0x5a3a24));
        for (let i = 0; i < 6; i++) parts.push(colored(new THREE.BoxGeometry(0.03, 0.96, 0.03).rotateZ((i * Math.PI) / 6).translate(p[0], 0.5, p[1] + s), 0x5a3a24));
      }
      colliders.push({ x: p[0], z: p[1], w: 1.9, d: 1.2, rot: 0 });
      taken.push([p[0], p[1], 1.2]);
    }
  }

  // ---- Stone balls in loose rows across the square.
  let k = 0;
  for (let x = kt[0] - 70; x < kt[0] + 70; x += 3.6) {
    for (let z = kt[1] - 70; z < kt[1] + 70; z += 3.6) {
      k++;
      if (k % 3 === 0) continue; // loose, not a grid
      const jx = x + Math.sin(k * 12.9) * 0.8, jz = z + Math.cos(k * 7.3) * 0.8;
      if (!inPlaza(jx, jz) || !place.free(jx, jz, 0.8) || !offRoad(jx, jz, 0.8) || taken.some(([x2, z2, r2]) => Math.hypot(x2 - jx, z2 - jz) < r2 + 0.9)) continue;
      const s = 0.62 + (Math.abs(Math.sin(k)) * 0.18);
      balls.push(new THREE.Matrix4().makeScale(s, s, s).setPosition(jx, (s / 2) * 0.95, jz));
      colliders.push({ x: jx, z: jz, w: s * 0.85, d: s * 0.85, rot: 0 });
    }
  }
  const ballMesh = new THREE.InstancedMesh(colored(new THREE.SphereGeometry(0.5, 10, 7), 0xe8e6de), vertex, balls.length);
  balls.forEach((m, i) => ballMesh.setMatrixAt(i, m));
  ballMesh.castShadow = ballMesh.receiveShadow = true;
  group.add(ballMesh);

  // ---- Rooftop billboard for the game: "Mohu: minden üveg számít".
  {
    const b = city.buildings.filter((q) => !q.scenery && q.h > 14 && !/templom/.test(q.name ?? ''))
      .map((q) => ({ q, o: obb(q.outer) }))
      .filter(({ o }) => Math.hypot(o.cx - kt[0], o.cz - kt[1]) < 70)
      .sort((p, q) => q.o.hl - p.o.hl)[0];
    if (b) {
      const t = canvasTex(1024, 384, (g) => {
        g.fillStyle = '#f2c418'; g.fillRect(0, 0, 1024, 384);
        g.fillStyle = '#1d1d1d'; g.font = 'bold 150px system-ui, sans-serif'; g.textAlign = 'center';
        g.fillText('Mohu', 512, 170);
        g.font = 'bold 72px system-ui, sans-serif'; g.fillText('minden üveg számít', 512, 290);
        g.fillStyle = '#2f8a4a'; g.fillRect(0, 350, 1024, 34);
      });
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      const board = new THREE.Mesh(new THREE.PlaneGeometry(11, 4.1), new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide, emissive: 0x332a00 }));
      const { o, q } = b;
      // Face the square.
      const toSq = Math.atan2(kt[0] - o.cx, kt[1] - o.cz);
      board.position.set(o.cx, q.h + 3.2, o.cz);
      board.rotation.y = toSq;
      group.add(board);
      for (const s of [-4, 4]) {
        const leg = colored(new THREE.BoxGeometry(0.2, 3.2, 0.2).translate(s, q.h + 1.6, -0.3).rotateY(toSq).translate(o.cx, 0, o.cz), 0x3a3a3a);
        parts.push(leg);
      }
    }
  }

  const mesh = new THREE.Mesh(merge(parts), vertex);
  mesh.castShadow = mesh.receiveShadow = true;
  group.add(mesh);
  return { group, colliders };
}

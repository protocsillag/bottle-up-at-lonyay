import * as THREE from 'three';
import type { CityData } from './cityData';
import type { Placement } from './placement';
import { merge } from './items/models';
import { pointInPolygon } from './collision';

// Street lamps along every road (every ~30 m, alternating sides) and lit shop windows
// from the OSM shop list. Both switch on at dusk. Light pools on the ground are cheap
// additive decals; a handful of real point lights follow the lamps nearest the player.

const SPACING = 30;
const POOL_LIGHTS = 5;

function colored(g: THREE.BufferGeometry, color: number) {
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/** Budapest-style curly street lamp: dark green post, scroll arm, lantern head. Head is a separate mesh. */
function postGeometry() {
  return merge([
    colored(new THREE.CylinderGeometry(0.16, 0.22, 0.6, 8).translate(0, 0.3, 0), 0x24352c),
    colored(new THREE.CylinderGeometry(0.07, 0.1, 4.4, 8).translate(0, 2.6, 0), 0x24352c),
    colored(new THREE.TorusGeometry(0.35, 0.035, 5, 12, Math.PI * 1.5).rotateY(Math.PI / 2).translate(0, 4.6, 0.35), 0x24352c),
    colored(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6).rotateX(Math.PI / 2).translate(0, 4.95, 0.45), 0x24352c),
  ]);
}
function headGeometry() {
  return new THREE.CylinderGeometry(0.22, 0.12, 0.42, 6).translate(0, 4.62, 0.9);
}

export class Lamps {
  readonly group = new THREE.Group();
  readonly positions: THREE.Vector3[] = [];
  /** Post positions, for collision. */
  readonly posts: [number, number][] = [];
  private headMat = new THREE.MeshLambertMaterial({ color: 0x3a3a32, emissive: 0xffd9a0, emissiveIntensity: 0 });
  private poolMat: THREE.MeshBasicMaterial;
  private windowMat = new THREE.MeshLambertMaterial({ color: 0x2d3640, emissive: 0xffd28a, emissiveIntensity: 0 });
  private lights: THREE.PointLight[] = [];
  private refresh = 0;

  constructor(city: CityData, place: Placement) {
    this.group.name = 'lamps';
    let side = 1;
    for (const r of city.roads) {
      if (r.kind !== 'road' || r.bridge) continue;
      // Walk the polyline and drop a lamp every SPACING metres, alternating sides.
      let next = SPACING / 2, walked = 0;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 0.01) continue;
        const ux = (bx - ax) / len, uz = (bz - az) / len;
        while (next <= walked + len) {
          const t = next - walked;
          next += SPACING;
          side = -side;
          const off = r.w / 2 + 0.7;
          const x = ax + ux * t - uz * off * side, z = az + uz * t + ux * off * side;
          if (!place.free(x, z, 0.6) || this.positions.some((p) => Math.abs(p.x - x) < 9 && Math.abs(p.z - z) < 9)) continue;
          // y temporarily holds the angle the arm points (out over the road).
          this.positions.push(new THREE.Vector3(x, Math.atan2(uz * side, -ux * side), z));
        }
        walked += len;
      }
    }
    const n = this.positions.length;
    const posts = new THREE.InstancedMesh(postGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }), n);
    const heads = new THREE.InstancedMesh(headGeometry(), this.headMat, n);
    const poolTex = poolTexture();
    this.poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -16 });
    const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2), this.poolMat, n);
    const m = new THREE.Matrix4();
    this.positions.forEach((p, i) => {
      this.posts.push([p.x, p.z]);
      m.makeRotationY(p.y).setPosition(p.x, 0, p.z);
      posts.setMatrixAt(i, m);
      heads.setMatrixAt(i, m);
      // Pool under the lantern head (0.9 m out along the arm).
      const hx = p.x + Math.sin(p.y) * 0.9, hz = p.z + Math.cos(p.y) * 0.9;
      pools.setMatrixAt(i, new THREE.Matrix4().makeTranslation(hx, 0.06, hz));
      p.set(hx, p.y, hz); // keep head position (y holds the angle until here)
      p.y = 4.5;
    });
    posts.castShadow = true;
    this.group.add(posts, heads, pools);
    for (let i = 0; i < POOL_LIGHTS; i++) {
      // Always visible: toggling lights changes the light count and recompiles every shader.
      const l = new THREE.PointLight(0xffd29a, 0, 22, 1.6);
      this.lights.push(l);
      this.group.add(l);
    }
    this.buildShopWindows(city);
    this.buildBenches(city, place);
  }

  /** OSM benches: wooden slats on two iron legs. */
  private buildBenches(city: CityData, place: Placement) {
    const pts = city.benches.filter(([x, z]) => pointInPolygon(x, z, city.boundary) && place.free(x, z, 0.3));
    const geo = merge([
      colored(new THREE.BoxGeometry(1.6, 0.06, 0.42).translate(0, 0.45, 0), 0x8a5a32),
      colored(new THREE.BoxGeometry(1.6, 0.36, 0.05).translate(0, 0.72, 0.22).rotateX(-0.12), 0x8a5a32),
      colored(new THREE.BoxGeometry(0.06, 0.45, 0.4).translate(-0.7, 0.22, 0), 0x2b2b2b),
      colored(new THREE.BoxGeometry(0.06, 0.45, 0.4).translate(0.7, 0.22, 0), 0x2b2b2b),
    ]);
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }), pts.length);
    const m = new THREE.Matrix4();
    pts.forEach(([x, z], i) => mesh.setMatrixAt(i, m.makeRotationY(((x * 7 + z * 13) % 4) * (Math.PI / 2)).setPosition(x, 0, z)));
    mesh.castShadow = true;
    this.group.add(mesh);
  }

  /** A warm lit window on the facade nearest each OSM shop. */
  private buildShopWindows(city: CityData) {
    const quads: THREE.Matrix4[] = [];
    for (const s of city.shops) {
      if (!pointInPolygon(s.p[0], s.p[1], city.boundary)) continue;
      let best: { d: number; x: number; z: number; ang: number } | null = null;
      for (const b of city.buildings) {
        const [cx, cz] = b.outer[0];
        if (Math.abs(cx - s.p[0]) > 120 || Math.abs(cz - s.p[1]) > 120) continue;
        const ring = b.outer;
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i], c = ring[(i + 1) % ring.length];
          const dx = c[0] - a[0], dz = c[1] - a[1], len = Math.hypot(dx, dz);
          if (len < 4) continue;
          const t = THREE.MathUtils.clamp(((s.p[0] - a[0]) * dx + (s.p[1] - a[1]) * dz) / (len * len), 1.6 / len, 1 - 1.6 / len);
          const x = a[0] + dx * t, z = a[1] + dz * t;
          const d = Math.hypot(x - s.p[0], z - s.p[1]);
          if (!best || d < best.d) {
            let nx = dz / len, nz = -dx / len;
            if (pointInPolygon(x + nx * 0.3, z + nz * 0.3, ring)) { nx = -nx; nz = -nz; }
            best = { d, x: x + nx * 0.04, z: z + nz * 0.04, ang: Math.atan2(nx, nz) };
          }
        }
      }
      if (!best || best.d > 12) continue;
      quads.push(new THREE.Matrix4().makeRotationY(best.ang).setPosition(best.x, 1.6, best.z));
    }
    const win = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.6, 2.2), this.windowMat, quads.length);
    quads.forEach((m, i) => win.setMatrixAt(i, m));
    this.group.add(win);
  }

  update(dt: number, lamps: number, px: number, pz: number) {
    this.headMat.emissiveIntensity = lamps * 1.6;
    this.poolMat.opacity = lamps * 0.55;
    this.windowMat.emissiveIntensity = lamps * 0.9;
    this.refresh -= dt;
    if (this.refresh > 0) return;
    this.refresh = 0.4;
    const on = lamps > 0.3;
    if (!on) { for (const l of this.lights) l.intensity = 0; return; }
    // Move the few real lights to the nearest lamps.
    const near = this.positions
      .map((p) => [p, (p.x - px) ** 2 + (p.z - pz) ** 2] as const)
      .sort((a, b) => a[1] - b[1])
      .slice(0, POOL_LIGHTS);
    near.forEach(([p], i) => {
      const l = this.lights[i];
      l.position.set(p.x, 4.2, p.z);
      l.intensity = 18 * lamps;
    });
  }
}

function poolTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,214,150,0.9)');
  grad.addColorStop(0.5, 'rgba(255,200,130,0.35)');
  grad.addColorStop(1, 'rgba(255,190,120,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

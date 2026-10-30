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

/** Ráday utca lamp (reference/raday-utca/lamp-flower-basket-bollards.jpg): fluted green
 *  post, a scroll arm, a copper bell shade over a glass globe and a hanging flower basket. */
function radayPostGeometry() {
  const green = 0x1f3a2c;
  const parts = [
    colored(new THREE.CylinderGeometry(0.2, 0.26, 0.8, 12).translate(0, 0.4, 0), green),
    colored(new THREE.CylinderGeometry(0.15, 0.2, 0.12, 12).translate(0, 0.86, 0), green),
    colored(new THREE.CylinderGeometry(0.075, 0.1, 4.0, 10).translate(0, 2.9, 0), green),
    colored(new THREE.TorusGeometry(0.3, 0.035, 5, 12, Math.PI * 1.5).rotateY(Math.PI / 2).translate(0, 4.65, 0.3), green),
    colored(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6).rotateX(Math.PI / 2).translate(0, 4.95, 0.45), green),
    // Copper bell shade over the globe.
    colored(new THREE.CylinderGeometry(0.06, 0.34, 0.3, 12, 1, true).translate(0, 4.88, 0.9), 0xb0683a),
    colored(new THREE.SphereGeometry(0.06, 6, 4).translate(0, 5.06, 0.9), 0xb0683a),
    // Flower basket on a bracket at 3.5 m, on the far side of the post.
    colored(new THREE.BoxGeometry(0.04, 0.04, 0.5).translate(0, 3.9, -0.25), green),
    colored(new THREE.CylinderGeometry(0.42, 0.28, 0.32, 10).translate(0, 3.45, -0.55), 0x3b2a1a),
    colored(new THREE.IcosahedronGeometry(0.5, 0).scale(1, 0.75, 1).translate(0, 3.55, -0.55), 0x4a2a52),
    colored(new THREE.IcosahedronGeometry(0.4, 0).scale(1, 1.2, 1).translate(0.15, 3.2, -0.45), 0x8ab83a),
    colored(new THREE.IcosahedronGeometry(0.33, 0).scale(1, 1.3, 1).translate(-0.2, 3.15, -0.68), 0x5a2a62),
  ];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    parts.push(colored(new THREE.IcosahedronGeometry(0.07, 0).translate(Math.cos(a) * 0.45, 3.5 + (i % 2) * 0.15, -0.55 + Math.sin(a) * 0.45), 0xc8202c));
  }
  return merge(parts);
}
function globeGeometry() {
  return new THREE.SphereGeometry(0.2, 10, 8).translate(0, 4.58, 0.9);
}

/** Hung lamp (reference/erkel-torok-pal-utca/): a round dish on a wire strung across a
 *  narrow street at about 7.5 m. The wire is scaled per instance along local x. */
function dishGeometry() {
  return merge([
    colored(new THREE.CylinderGeometry(0.42, 0.12, 0.2, 14, 1, true).translate(0, 7.25, 0), 0x2b2f30),
    colored(new THREE.CylinderGeometry(0.1, 0.1, 0.18, 8).translate(0, 7.42, 0), 0x2b2f30),
  ]);
}
function wireGeometry() {
  return colored(new THREE.BoxGeometry(1, 0.02, 0.02).translate(0, 7.5, 0), 0x1a1a1a);
}
function hungHeadGeometry() {
  return new THREE.CylinderGeometry(0.36, 0.36, 0.03, 14).translate(0, 7.15, 0);
}

/** Main-street candelabra (reference/kalvin-ter/): tall dark grey cast iron with a fluted
 *  base, scroll ironwork and two bell lanterns hanging from curly arms. */
function candelabraGeometry() {
  const grey = 0x34383a;
  const parts = [
    colored(new THREE.CylinderGeometry(0.26, 0.34, 1.2, 12).translate(0, 0.6, 0), grey),
    colored(new THREE.CylinderGeometry(0.2, 0.26, 0.2, 12).translate(0, 1.3, 0), grey),
    colored(new THREE.CylinderGeometry(0.09, 0.13, 5.6, 10).translate(0, 4.2, 0), grey),
    colored(new THREE.SphereGeometry(0.14, 8, 6).translate(0, 7.1, 0), grey),
  ];
  for (const s of [-1, 1]) {
    parts.push(colored(new THREE.TorusGeometry(0.42, 0.035, 5, 12, Math.PI).rotateY(s > 0 ? 0 : Math.PI).translate(s * 0.42, 6.6, 0), grey));
    parts.push(colored(new THREE.TorusGeometry(0.16, 0.025, 4, 10).translate(s * 0.35, 6.25, 0), grey));
    parts.push(colored(new THREE.CylinderGeometry(0.05, 0.24, 0.26, 8).translate(s * 0.84, 6.38, 0), grey));
  }
  return merge(parts);
}
function candelabraHeadGeometry() {
  return merge([-1, 1].map((s) => new THREE.CylinderGeometry(0.17, 0.12, 0.34, 8).translate(s * 0.84, 6.1, 0).toNonIndexed()));
}

const RADAY = 'Ráday utca';
const RADAY_SPACING = 20;

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

  /** extraRaday: additional Ráday-style lamps (Bakáts tér paths): position and arm angle. */
  constructor(city: CityData, place: Placement, extraRaday: { x: number; z: number; angle: number }[] = []) {
    this.group.name = 'lamps';
    let side = 1;
    const kinds: (0 | 1 | 2 | 3)[] = [];
    const spans: [number, number][] = [];
    for (const r of city.roads) {
      if (r.kind !== 'road' || r.bridge) continue;
      const isRaday = r.name === RADAY;
      const spacing = isRaday ? RADAY_SPACING : SPACING;
      // Walk the polyline and drop a lamp every `spacing` metres, alternating sides.
      let next = spacing / 2, walked = 0;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 0.01) continue;
        const ux = (bx - ax) / len, uz = (bz - az) / len;
        while (next <= walked + len) {
          const t = next - walked;
          next += spacing;
          side = -side;
          // Ráday lamps stand at the edge of the drive strip, everywhere else by the kerb.
          // Narrow side streets (facades on both sides within 6.5 m): a lamp on a wire.
          const cx = ax + ux * t, cz = az + uz * t;
          const wall = (s2: number) => { for (let d = 2; d <= 6.5; d += 0.5) if (place.buildings.at(cx - uz * d * s2, cz + ux * d * s2)) return d; return 0; };
          const wl = isRaday || r.w >= 12 ? 0 : wall(-1), wr = wl ? wall(1) : 0;
          if (wl && wr) {
            if (this.positions.some((p) => Math.abs(p.x - cx) < 9 && Math.abs(p.z - cz) < 9)) continue;
            this.positions.push(new THREE.Vector3(cx, Math.atan2(-ux, -uz), cz)); // local +x points across the street
            kinds.push(2);
            spans.push([wl, wr]);
            continue;
          }
          const off = isRaday ? 3.3 : r.w / 2 + 0.7;
          const x = ax + ux * t - uz * off * side, z = az + uz * t + ux * off * side;
          const gap = isRaday ? 6 : 9;
          if (!place.free(x, z, 0.6) || this.positions.some((p) => Math.abs(p.x - x) < gap && Math.abs(p.z - z) < gap)) continue;
          // y temporarily holds the angle the arm points (out over the road).
          this.positions.push(new THREE.Vector3(x, Math.atan2(uz * side, -ux * side), z));
          kinds.push(isRaday ? 1 : r.w >= 14 ? 3 : 0);
          spans.push([0, 0]);
        }
        walked += len;
      }
    }
    for (const e of extraRaday) {
      this.positions.push(new THREE.Vector3(e.x, e.angle, e.z));
      kinds.push(1);
      spans.push([0, 0]);
    }
    const n = this.positions.length;
    const count = (k: number) => kinds.filter((v) => v === k).length;
    const postMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const posts = new THREE.InstancedMesh(postGeometry(), postMat, count(0));
    const heads = new THREE.InstancedMesh(headGeometry(), this.headMat, count(0));
    const rPosts = new THREE.InstancedMesh(radayPostGeometry(), postMat, count(1));
    const rHeads = new THREE.InstancedMesh(globeGeometry(), this.headMat, count(1));
    const cPosts = new THREE.InstancedMesh(candelabraGeometry(), postMat, count(3));
    const cHeads = new THREE.InstancedMesh(candelabraHeadGeometry(), this.headMat, count(3));
    const dishes = new THREE.InstancedMesh(dishGeometry(), postMat, count(2));
    const wires = new THREE.InstancedMesh(wireGeometry(), postMat, count(2));
    const hHeads = new THREE.InstancedMesh(hungHeadGeometry(), this.headMat, count(2));
    const poolTex = poolTexture();
    this.poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -16 });
    const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2), this.poolMat, n);
    const m = new THREE.Matrix4();
    const at = [0, 0, 0, 0];
    this.positions.forEach((p, i) => {
      const k = kinds[i];
      m.makeRotationY(p.y).setPosition(p.x, 0, p.z);
      if (k === 0) { posts.setMatrixAt(at[0], m); heads.setMatrixAt(at[0]++, m); }
      else if (k === 1) { rPosts.setMatrixAt(at[1], m); rHeads.setMatrixAt(at[1]++, m); }
      else if (k === 3) {
        cPosts.setMatrixAt(at[3], m); cHeads.setMatrixAt(at[3]++, m);
        this.posts.push([p.x, p.z]);
        pools.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, 0.06, p.z));
        p.y = 5.5;
        return;
      }
      else {
        // p.y is the angle of the across-street axis; the wire spans wall to wall.
        const [wl, wr] = spans[i];
        dishes.setMatrixAt(at[2], m); hHeads.setMatrixAt(at[2], m);
        const c = Math.cos(p.y), s2 = -Math.sin(p.y);
        const mid = (wr - wl) / 2;
        wires.setMatrixAt(at[2]++, new THREE.Matrix4().makeRotationY(p.y).scale(new THREE.Vector3(wl + wr, 1, 1)).setPosition(p.x + c * mid, 0, p.z + s2 * mid));
        pools.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, 0.06, p.z));
        p.y = 4.5;
        return;
      }
      this.posts.push([p.x, p.z]);
      // Pool under the lantern head (0.9 m out along the arm).
      const hx = p.x + Math.sin(p.y) * 0.9, hz = p.z + Math.cos(p.y) * 0.9;
      pools.setMatrixAt(i, new THREE.Matrix4().makeTranslation(hx, 0.06, hz));
      p.set(hx, p.y, hz); // keep head position (y holds the angle until here)
      p.y = 4.5;
    });
    cPosts.castShadow = true;
    this.group.add(dishes, wires, hHeads, cPosts, cHeads);
    rPosts.castShadow = true;
    this.group.add(rPosts, rHeads);
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

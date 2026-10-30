import * as THREE from 'three';
import type { Building, CityData, Vec2 } from '../cityData';
import type { Placement, Spot } from '../placement';
import { pointInPolygon } from '../collision';
import { merge } from '../items/models';
import { colored, obb, signTexture, zsolnayTexture } from './common';
import { buildTrees } from '../buildCity';

// Street dressing and the smaller landmarks: Ráday utca's café terraces, Lónyay utca's
// kerb trees, Nehru part, the Bakáts tér church tower, the museum's Zsolnay roof,
// Kálvin tér, and the scenery across the river (Gellért Hill, Szabadság híd).

export interface Collider { x: number; z: number; w: number; d: number; rot: number; }
export interface Dressing {
  group: THREE.Group;
  colliders: Collider[];
  /** Extra hidden-stash spots (behind the Ráday book kiosk). */
  hiddenSpots: Spot[];
  /** Where the big bag may hide on the Nehru part (behind the kiosks). */
  kioskSpots: Vec2[];
  /** Renovation skips in front of scaffolded buildings (one-off jackpots). */
  skips: { x: number; z: number; dir: number }[];
}

type Part = THREE.BufferGeometry;
function bx(parts: Part[], w: number, h: number, d: number, x: number, y: number, z: number, color: number, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d).rotateY(ry).translate(x, y, z);
  parts.push(colored(g, color));
}
function instanced(geo: THREE.BufferGeometry, mats: THREE.Matrix4[], shadow = true) {
  const m = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }), mats.length);
  mats.forEach((x, i) => m.setMatrixAt(i, x));
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}
const at = (x: number, z: number, ry = 0) => new THREE.Matrix4().makeRotationY(ry).setPosition(x, 0, z);

/** Edges of buildings that face a named street (within `reach` of its centreline). */
function facadesAlong(city: CityData, name: string, reach: number) {
  const segs = city.roads.filter((r) => r.name === name).flatMap((r) => r.pts.slice(1).map((p, i) => [r.pts[i], p] as [Vec2, Vec2]));
  const out: { a: Vec2; b: Vec2; nx: number; nz: number; b0: Building }[] = [];
  for (const b of city.buildings) {
    if (b.scenery) continue;
    const ring = b.outer;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], c = ring[(i + 1) % ring.length];
      const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (len < 5) continue;
      const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
      let near = false;
      for (const [p, q] of segs) {
        const dx = q[0] - p[0], dz = q[1] - p[1], l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((mx - p[0]) * dx + (mz - p[1]) * dz) / l2));
        if (Math.hypot(mx - p[0] - t * dx, mz - p[1] - t * dz) < reach) { near = true; break; }
      }
      if (!near) continue;
      let nx = (c[1] - a[1]) / len, nz = -(c[0] - a[0]) / len;
      if (pointInPolygon(mx + nx * 0.3, mz + nz * 0.3, ring)) { nx = -nx; nz = -nz; }
      out.push({ a, b: c, nx, nz, b0: b });
    }
  }
  return out;
}

export function buildDressing(city: CityData, place: Placement): Dressing {
  const group = new THREE.Group();
  group.name = 'dressing';
  const colliders: Collider[] = [];
  const hiddenSpots: Spot[] = [];
  const kioskSpots: Vec2[] = [];

  // ---------------------------------------------------------------- Ráday utca
  {
    // Terraces, bollards and lamps for Ráday utca live in raday.ts (M11).
    // The little green book kiosk near the Kálvin tér end, with a stash behind it.
    const ends = city.roads.filter((r) => r.name === 'Ráday utca').flatMap((r) => r.pts);
    const kalvin = city.landmarks.kalvinTer;
    if (ends.length && kalvin) {
      const north = ends.reduce((p, q) => (Math.hypot(q[0] - kalvin[0], q[1] - kalvin[1]) < Math.hypot(p[0] - kalvin[0], p[1] - kalvin[1]) ? q : p));
      const spot = place.spotsIn('raday').sort((s1, s2) => Math.hypot(s1.x - north[0], s1.z - north[1]) - Math.hypot(s2.x - north[0], s2.z - north[1]))[2];
      if (spot) {
        const kiosk: Part[] = [];
        bx(kiosk, 2.2, 2.4, 1.5, 0, 1.2, 0, 0x2f6a45);
        bx(kiosk, 2.5, 0.2, 1.8, 0, 2.5, 0, 0x24503a);
        bx(kiosk, 1.8, 1.0, 0.05, 0, 1.4, -0.77, 0xe8dcc0);
        for (let i = 0; i < 6; i++) bx(kiosk, 0.22, 0.3, 0.06, -0.6 + i * 0.24, 1.4, -0.82, [0xc8262c, 0x274060, 0xe0b23a, 0x2b6e3c][i % 4]);
        const km = new THREE.Mesh(merge(kiosk), new THREE.MeshLambertMaterial({ vertexColors: true }));
        km.position.set(spot.x, 0, spot.z);
        km.rotation.y = spot.dir;
        km.castShadow = true;
        group.add(km);
        const label = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.3), new THREE.MeshLambertMaterial({ map: signTexture('KÖNYV', '#2f6a45', '#f2e8c8', 256, 44, 'bold 34px Georgia, serif') }));
        label.position.set(0, 2.15, -0.78);
        label.rotation.y = Math.PI;
        km.add(label);
        colliders.push({ x: spot.x, z: spot.z, w: 2.2, d: 1.5, rot: spot.dir });
        const bxp = spot.x + Math.sin(spot.dir) * 1.3, bzp = spot.z + Math.cos(spot.dir) * 1.3;
        hiddenSpots.push({ x: bxp, z: bzp, zone: 'raday', green: false, dir: spot.dir });
      }
    }
  }

  // ---------------------------------------------------------------- Lónyay utca: kerb trees, crate planters, markings
  {
    // reference/lonyay-utca: wooden crate planters with shrubs or young trees along the
    // kerb every 15–20 m, young street trees in some stretches, double yellow kerb lines
    // and a painted bike symbol in the lane.
    const trees: Vec2[] = [], crates: THREE.Matrix4[] = [], bikes: THREE.Matrix4[] = [];
    const lines: Part[] = [];
    let k = 0;
    for (const r of city.roads.filter((r) => r.name === 'Lónyay utca' && r.kind === 'road')) {
      for (let i = 0; i < r.pts.length - 1; i++) {
        const [ax, az] = r.pts[i], [bx2, bz] = r.pts[i + 1];
        const len = Math.hypot(bx2 - ax, bz - az);
        if (len < 1) continue;
        const ux = (bx2 - ax) / len, uz = (bz - az) / len;
        const ry = Math.atan2(ux, uz);
        for (let t = 6; t < len - 4; t += 17) for (const sd of [-1, 1]) {
          const x = ax + ux * t - uz * (r.w / 2 + 0.9) * sd, z = az + uz * t + ux * (r.w / 2 + 0.9) * sd;
          if (!place.free(x, z, 0.8)) continue;
          if (k++ % 3 === 0) trees.push([x, z]);
          else crates.push(at(x, z, ry));
          colliders.push({ x, z, w: 1.0, d: 1.0, rot: ry });
        }
        // Double yellow lines along both kerbs (in the road, just off the kerb).
        for (const sd of [-1, 1]) for (const o of [0.25, 0.4]) {
          const cx = (ax + bx2) / 2 - uz * (r.w / 2 - o) * sd, cz = (az + bz) / 2 + ux * (r.w / 2 - o) * sd;
          lines.push(colored(new THREE.BoxGeometry(0.08, 0.01, len).rotateY(ry).translate(cx, 0.062, cz), 0xd8b020));
        }
        for (let t = 20; t < len - 10; t += 45) bikes.push(new THREE.Matrix4().makeRotationY(ry).setPosition(ax + ux * t, 0.063, az + uz * t));
      }
    }
    const tg = buildTrees(trees);
    // Kerb trees are young: shrink each instance.
    for (const im of tg.children as THREE.InstancedMesh[]) {
      const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
      for (let i = 0; i < im.count; i++) { im.getMatrixAt(i, m); m.decompose(p, q, sc); sc.multiplyScalar(0.6); im.setMatrixAt(i, m.compose(p, q, sc)); }
    }
    group.add(tg);
    const crate: Part[] = [];
    for (let i = 0; i < 4; i++) bx(crate, 1.0, 0.16, 0.6, 0, 0.1 + i * 0.18, 0, i % 2 ? 0x7a6a56 : 0x8a7860);
    bx(crate, 0.9, 0.05, 0.5, 0, 0.72, 0, 0x3a2f22);
    crate.push(colored(new THREE.IcosahedronGeometry(0.42, 0).scale(1.1, 0.8, 0.7).translate(0, 0.98, 0), 0x4f7a39));
    crate.push(colored(new THREE.CylinderGeometry(0.03, 0.04, 1.2, 5).translate(0.25, 1.2, 0), 0x5a4636));
    crate.push(colored(new THREE.IcosahedronGeometry(0.35, 0).translate(0.25, 1.9, 0), 0x3f6f34));
    group.add(instanced(merge(crate), crates));
    if (lines.length) { const lm = new THREE.Mesh(merge(lines), new THREE.MeshLambertMaterial({ vertexColors: true })); lm.receiveShadow = true; group.add(lm); }
    // Bike symbol: a yellow painted pictogram on the asphalt.
    const c = document.createElement('canvas');
    c.width = 128; c.height = 256;
    const gx = c.getContext('2d')!;
    gx.strokeStyle = '#d8b020'; gx.lineWidth = 7;
    for (const [x, y] of [[64, 70], [64, 190]]) { gx.beginPath(); gx.arc(x, y, 32, 0, Math.PI * 2); gx.stroke(); }
    gx.beginPath(); gx.moveTo(64, 70); gx.lineTo(64, 130); gx.lineTo(64, 190); gx.moveTo(64, 130); gx.lineTo(30, 110); gx.moveTo(64, 70); gx.lineTo(40, 60); gx.stroke();
    gx.beginPath(); gx.moveTo(36, 240); gx.lineTo(64, 225); gx.lineTo(92, 240); gx.stroke();
    const tex = new THREE.CanvasTexture(c);
    const bm = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.0, 2.0).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -24 }), bikes.length);
    bikes.forEach((m, i) => bm.setMatrixAt(i, m));
    group.add(bm);
  }

  // ---------------------------------------------------------------- Nehru part
  const nehru = city.areas.find((a) => a.name === 'Nehru part');
  if (nehru) {
    // Railing and a promenade line along the river edge of the playable area.
    const river: [Vec2, Vec2] = [city.boundary[4], city.boundary[0]];
    const [p0, p1] = river;
    const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const ux = (p1[0] - p0[0]) / len, uz = (p1[1] - p0[1]) / len;
    // Inward normal (toward the city).
    let nx = -uz, nz = ux;
    const cx = (p0[0] + p1[0]) / 2, cz = (p0[1] + p1[1]) / 2;
    if (!pointInPolygon(cx + nx * 5, cz + nz * 5, city.boundary)) { nx = -nx; nz = -nz; }
    const posts: THREE.Matrix4[] = [];
    for (let t = 0; t < len; t += 2.5) posts.push(at(p0[0] + ux * t + nx * 0.6, p0[1] + uz * t + nz * 0.6));
    group.add(instanced(colored(new THREE.BoxGeometry(0.08, 1.05, 0.08).translate(0, 0.52, 0), 0x2f3a3a).toNonIndexed(), posts));
    const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.07, 0.07), new THREE.MeshLambertMaterial({ color: 0x2f3a3a }));
    rail.position.set(cx + nx * 0.6, 1.02, cz + nz * 0.6);
    rail.rotation.y = -Math.atan2(uz, ux);
    group.add(rail);
    // Rows of plane trees along the promenade, inside the park.
    const rows: Vec2[] = [];
    for (let t = 5; t < len; t += 11) for (const off of [7, 16]) {
      const x = p0[0] + ux * t + nx * off, z = p0[1] + uz * t + nz * off;
      if (pointInPolygon(x, z, nehru.outer) && place.free(x, z, 1)) rows.push([x, z]);
    }
    group.add(buildTrees(rows));
    for (const [x, z] of rows) colliders.push({ x, z, w: 0.6, d: 0.6, rot: 0 });
    // Turquoise and orange concrete loungers on the lawn.
    const greens = place.spots.filter((s) => s.zone === 'nehru' && s.green);
    const lounger: Part[] = [];
    lounger.push(colored(new THREE.BoxGeometry(0.8, 0.35, 2.0).translate(0, 0.175, 0), 0xffffff));
    lounger.push(colored(new THREE.BoxGeometry(0.8, 0.5, 0.5).rotateX(-0.6).translate(0, 0.45, -0.85), 0xffffff));
    const lg = merge(lounger);
    const loungerMats: THREE.Matrix4[] = [];
    const loungerCols: number[] = [];
    greens.forEach((s, i) => {
      if (i % 5 !== 1) return;
      loungerMats.push(at(s.x + 1.5, s.z, s.dir + (i % 3)));
      loungerCols.push(i % 2 ? 0x2fb8b0 : 0xe8742a);
      colliders.push({ x: s.x + 1.5, z: s.z, w: 0.8, d: 2.0, rot: s.dir + (i % 3) });
    });
    const lm = new THREE.InstancedMesh(lg, new THREE.MeshLambertMaterial({ vertexColors: true }), loungerMats.length);
    loungerMats.forEach((m, i) => { lm.setMatrixAt(i, m); lm.setColorAt(i, new THREE.Color(loungerCols[i])); });
    lm.castShadow = true;
    group.add(lm);
    // Kiosks (bars) on the promenade; the big blue bag may hide behind them.
    for (const t of [0.35, 0.55, 0.75]) {
      const x = p0[0] + ux * len * t + nx * 24, z = p0[1] + uz * len * t + nz * 24;
      if (!pointInPolygon(x, z, nehru.outer)) continue;
      const kiosk: Part[] = [];
      bx(kiosk, 4, 2.6, 2.6, 0, 1.3, 0, 0xd8d0c0);
      bx(kiosk, 4.6, 0.25, 3.4, 0, 2.75, -0.3, 0x2fb8b0);
      bx(kiosk, 3, 0.9, 0.06, 0, 1.6, -1.32, 0x2a3440);
      const km = new THREE.Mesh(merge(kiosk), new THREE.MeshLambertMaterial({ vertexColors: true }));
      const ry = -Math.atan2(uz, ux);
      km.position.set(x, 0, z);
      km.rotation.y = ry;
      km.castShadow = true;
      group.add(km);
      colliders.push({ x, z, w: 4, d: 2.6, rot: ry });
      kioskSpots.push([x + nx * 2.4, z + nz * 2.4]);
    }
    // Basketball hoops by the playground.
    const play = city.areas.find((a) => a.name === 'Nehru játszótér');
    if (play) {
      const o = obb(play.outer);
      const hoop: Part[] = [];
      bx(hoop, 0.15, 3.2, 0.15, 0, 1.6, 0, 0x3a3a3a);
      bx(hoop, 1.8, 1.05, 0.06, 0, 3.4, 0.6, 0xf2f2f2);
      hoop.push(colored(new THREE.TorusGeometry(0.23, 0.02, 4, 12).rotateX(Math.PI / 2).translate(0, 3.05, 0.9), 0xe8742a));
      const hm: THREE.Matrix4[] = [];
      for (const s of [-1, 1]) hm.push(at(o.cx + o.ux * (o.hl + 10) * s, o.cz + o.uz * (o.hl + 10) * s, Math.atan2(o.ux * -s, o.uz * -s)));
      group.add(instanced(merge(hoop), hm));
      // Slide and swings in the playground.
      const pl: Part[] = [];
      bx(pl, 0.1, 2.4, 0.1, -1, 1.2, -1, 0xe0b23a); bx(pl, 0.1, 2.4, 0.1, 1, 1.2, -1, 0xe0b23a); bx(pl, 2.1, 0.1, 0.1, 0, 2.4, -1, 0xe0b23a);
      bx(pl, 0.5, 0.05, 0.3, -0.5, 0.5, -1, 0x2f63b8); bx(pl, 0.5, 0.05, 0.3, 0.5, 0.5, -1, 0x2f63b8);
      bx(pl, 0.8, 0.1, 3.0, 2.5, 1.0, 1, 0xc8262c, 0);
      const pm = new THREE.Mesh(merge(pl), new THREE.MeshLambertMaterial({ vertexColors: true }));
      pm.position.set(o.cx, 0, o.cz);
      group.add(pm);
    }
  }

  // ---------------------------------------------------------------- Bakáts tér church tower
  const church = city.buildings.find((b) => b.name === 'Assisi Szent Ferenc-templom');
  if (church) {
    // The tower stands at the square-facing end; Bakáts tér is to the north-west.
    const o = obb(church.outer);
    const sq = city.landmarks.bakatsTer ?? [o.cx, o.cz - 50];
    const s = (sq[0] - o.cx) * o.ux + (sq[1] - o.cz) * o.uz > 0 ? 1 : -1;
    const tx = o.cx + o.ux * (o.hl - 3) * s, tz = o.cz + o.uz * (o.hl - 3) * s;
    const t = new THREE.Group();
    const stone = new THREE.MeshLambertMaterial({ color: 0xe2d8c2 });
    t.add(new THREE.Mesh(new THREE.BoxGeometry(7, 40, 7).translate(0, 20, 0), stone));
    t.add(new THREE.Mesh(new THREE.BoxGeometry(7.6, 1, 7.6).translate(0, 26, 0), new THREE.MeshLambertMaterial({ color: 0xc8bea8 })));
    const tiles = zsolnayTexture(['#2f7a4a', '#e0b23a', '#7a3a26', '#3a2a20']);
    tiles.repeat.set(3, 6);
    t.add(new THREE.Mesh(new THREE.ConeGeometry(5, 22, 8).translate(0, 51, 0), new THREE.MeshLambertMaterial({ map: tiles })));
    t.add(new THREE.Mesh(new THREE.BoxGeometry(0.25, 3, 0.25).translate(0, 63, 0), new THREE.MeshLambertMaterial({ color: 0xd8b84a })));
    t.add(new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.25, 0.25).translate(0, 63.5, 0), new THREE.MeshLambertMaterial({ color: 0xd8b84a })));
    // Clock faces and belfry openings.
    for (let i = 0; i < 4; i++) {
      const clock = new THREE.Mesh(new THREE.CircleGeometry(1.4, 20), new THREE.MeshLambertMaterial({ color: 0xf2efe6 }));
      clock.position.set(Math.sin((i * Math.PI) / 2) * 3.52, 31, Math.cos((i * Math.PI) / 2) * 3.52);
      clock.rotation.y = (i * Math.PI) / 2;
      t.add(clock);
      const bel = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 4.5), new THREE.MeshLambertMaterial({ color: 0x1a1612 }));
      bel.position.set(Math.sin((i * Math.PI) / 2) * 3.52, 36.5, Math.cos((i * Math.PI) / 2) * 3.52);
      bel.rotation.y = (i * Math.PI) / 2;
      t.add(bel);
    }
    // Steep roof over the nave.
    const roofTiles = zsolnayTexture(['#7a3a26', '#2f7a4a', '#c9622e', '#3a2a20']);
    roofTiles.repeat.set(6, 3);
    const nave = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 4, 1).rotateY(Math.PI / 4), new THREE.MeshLambertMaterial({ map: roofTiles }));
    nave.scale.set(o.hl * 1.35, 12, o.hw * 1.35);
    nave.position.set(o.cx, church.h + 6, o.cz);
    nave.rotation.y = o.rotY;
    group.add(nave);
    t.position.set(tx, 0, tz);
    t.traverse((m) => { if (m instanceof THREE.Mesh) m.castShadow = true; });
    group.add(t);
  }

  // ---------------------------------------------------------------- Iparművészeti Múzeum: Zsolnay roof and dome
  const museum = city.buildings.find((b) => b.name === 'Iparművészeti Múzeum');
  if (museum) {
    const o = obb(museum.outer);
    const tiles = zsolnayTexture(['#2f8a4a', '#e8c23a', '#1f5a3a', '#3a2a20']);
    tiles.repeat.set(4, 3);
    const mat = new THREE.MeshLambertMaterial({ map: tiles });
    // Green and yellow tiled roof along the Üllői út wing, plus the central dome and lantern.
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 4, 1).rotateY(Math.PI / 4), mat);
    roof.scale.set(o.hl * 1.3, 8, Math.min(o.hw, 12) * 1.3);
    roof.position.set(o.cx, museum.h + 4, o.cz);
    roof.rotation.y = o.rotY;
    group.add(roof);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(8, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    dome.position.set(o.cx, museum.h + 7, o.cz);
    dome.scale.y = 1.4;
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 7, 16), new THREE.MeshLambertMaterial({ color: 0xe8dcc0 }));
    drum.position.set(o.cx, museum.h + 3.5, o.cz);
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 5, 8), new THREE.MeshLambertMaterial({ color: 0xe8c23a }));
    lantern.position.set(o.cx, museum.h + 20, o.cz);
    for (const m of [dome, drum, lantern]) { m.castShadow = true; group.add(m); }
  }

  // ---------------------------------------------------------------- Kálvin tér: church portico and the metro entrance
  const kc = city.buildings.find((b) => b.name === 'Kálvin téri református templom');
  if (kc) {
    const o = obb(kc.outer);
    const t = new THREE.Group();
    const stone = new THREE.MeshLambertMaterial({ color: 0xe8e0cc });
    t.add(new THREE.Mesh(new THREE.BoxGeometry(6, 34, 6).translate(0, 17, 0), stone));
    // Green copper onion spire (reference/kalvin-ter/reformed-church.jpg) on a balustrade.
    const copper = new THREE.MeshLambertMaterial({ color: 0x5f9a82 });
    const onion = [[0, 0], [3.0, 0], [3.0, 0.6], [2.2, 1.0], [3.1, 2.6], [3.2, 4.0], [2.4, 5.6], [1.0, 6.6], [0.5, 7.6], [0.9, 8.4], [0.4, 9.4], [0.15, 11.5], [0, 12]].map(([r, y]) => new THREE.Vector2(r, y));
    const spire = new THREE.Mesh(new THREE.LatheGeometry(onion, 12), copper);
    spire.position.y = 34.6;
    t.add(spire);
    t.add(new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.6, 6.6).translate(0, 34.3, 0), stone));
    t.add(new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6).translate(0, 46.8, 0), new THREE.MeshLambertMaterial({ color: 0xd8b040 })));
    // Clock faces on all four sides.
    const clockTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d')!;
      g.fillStyle = '#f2efe6'; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#1d1d1d'; g.lineWidth = 6; g.stroke();
      g.lineWidth = 4; for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.beginPath(); g.moveTo(64 + Math.cos(a) * 50, 64 + Math.sin(a) * 50); g.lineTo(64 + Math.cos(a) * 58, 64 + Math.sin(a) * 58); g.stroke(); }
      g.lineWidth = 6; g.beginPath(); g.moveTo(64, 64); g.lineTo(64, 24); g.moveTo(64, 64); g.lineTo(92, 72); g.stroke();
      const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx;
    })();
    const clockMat = new THREE.MeshLambertMaterial({ map: clockTex, transparent: true });
    for (let i = 0; i < 4; i++) {
      const face = new THREE.Mesh(new THREE.CircleGeometry(1.6, 20), clockMat);
      const a = (i * Math.PI) / 2;
      face.position.set(Math.sin(a) * 3.02, 29, Math.cos(a) * 3.02);
      face.rotation.y = a;
      t.add(face);
    }
    const end = o.cz + o.uz * o.hl < o.cz - o.uz * o.hl ? 1 : -1; // tower at the north end
    t.position.set(o.cx + o.ux * (o.hl - 3) * end, 0, o.cz + o.uz * (o.hl - 3) * end);
    group.add(t);
    // Portico: four columns and a pediment on the square side.
    const pz = o.cz + o.uz * (o.hl + 3) * end, px = o.cx + o.ux * (o.hl + 3) * end;
    const port = new THREE.Group();
    for (let i = 0; i < 4; i++) port.add(new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 9, 10).translate(-4.5 + i * 3, 4.5, 0), stone));
    const ped = new THREE.Shape([new THREE.Vector2(-6.5, 0), new THREE.Vector2(6.5, 0), new THREE.Vector2(0, 3)]);
    const pm = new THREE.Mesh(new THREE.ExtrudeGeometry(ped, { depth: 2, bevelEnabled: false }), stone);
    pm.position.set(0, 9.5, -1);
    port.add(pm, new THREE.Mesh(new THREE.BoxGeometry(13.4, 0.8, 2.4).translate(0, 9.3, 0), stone));
    port.position.set(px, 0, pz);
    port.rotation.y = -Math.atan2(o.uz, o.ux) + Math.PI / 2 + (end < 0 ? Math.PI : 0); // local +z out to the square
    group.add(port);
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Vector3(-4.5 + i * 3, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), port.rotation.y);
      colliders.push({ x: px + c.x, z: pz + c.z, w: 1, d: 1, rot: 0 });
    }
    // A half-moon window over the portico, an iron fence across it and a bronze statue
    // of a standing man in a long coat in front.
    const lunette = new THREE.Mesh(new THREE.CircleGeometry(2.4, 16, 0, Math.PI), new THREE.MeshLambertMaterial({ color: 0x2a3440 }));
    lunette.position.set(0, 13.4, -2.95);
    port.add(lunette);
    const iron = new THREE.MeshLambertMaterial({ color: 0x1d1d1d });
    port.add(new THREE.Mesh(new THREE.BoxGeometry(12, 0.06, 0.06).translate(0, 1.6, 1.4), iron));
    for (let x = -6; x <= 6; x += 0.25) port.add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.7, 0.03).translate(x, 0.85, 1.4), iron));
    const bronze = new THREE.MeshLambertMaterial({ color: 0x4a3a28 });
    const statue = new THREE.Group();
    statue.add(new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.6, 1.4).translate(0, 0.8, 0), stone));
    statue.add(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.45, 1.5, 10).translate(0, 2.35, 0), bronze));
    statue.add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.26, 0.7, 10).translate(0, 3.4, 0), bronze));
    statue.add(new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8).translate(0, 3.95, 0), bronze));
    statue.position.set(0, 0, 5.5);
    port.add(statue);
    const sp = new THREE.Vector3(0, 0, 5.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), port.rotation.y);
    colliders.push({ x: px + sp.x, z: pz + sp.z, w: 1.5, d: 1.5, rot: 0 });
  }
  const kt = city.landmarks.kalvinTer;
  if (kt) {
    // A blue "M" metro sign by the station entrance.
    const s = place.nearestFree([kt[0] + 22, kt[1] + 8], 1.2);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.4).translate(0, 1.7, 0), new THREE.MeshLambertMaterial({ color: 0x3a3a3a }));
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.2), [0, 0, 0, 0, 1, 1].map(() => new THREE.MeshLambertMaterial({ map: signTexture('M', '#1f5fa8', '#ffffff', 128, 128, 'bold 100px system-ui, sans-serif'), emissive: 0xffffff, emissiveIntensity: 0.1 })));
    m.position.y = 3.6;
    pole.add(m);
    pole.position.set(s[0], 0, s[1]);
    group.add(pole);
    colliders.push({ x: s[0], z: s[1], w: 0.3, d: 0.3, rot: 0 });
  }

  // ---------------------------------------------------------------- renovation sites
  const skips: Dressing['skips'] = [];
  for (const street of ['Ráday utca', 'Erkel utca', 'Lónyay utca', 'Mátyás utca']) {
    const f = facadesAlong(city, street, 14).filter((e) => e.b0.h > 12).sort((p, q) => Math.hypot(q.b[0] - q.a[0], q.b[1] - q.a[1]) - Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]))[street === 'Ráday utca' ? 2 : 0];
    if (!f) continue;
    const site = scaffoldSite(f.a, f.b, f.nx, f.nz, f.b0.h, place);
    if (!site) continue;
    group.add(site.group);
    colliders.push(...site.colliders);
    skips.push(site.skip);
  }

  group.add(farBank(city));
  return { group, colliders, hiddenSpots, kioskSpots, skips };
}

/** A building under renovation (reference/bins/wheelie-bins-out-and-skip.jpg): scaffolding
 *  wrapped in green netting over the facade, and on the street a red skip, a yellow and
 *  white site office, a blue portable toilet and a run of steel crowd barriers. */
function scaffoldSite(a: Vec2, b: Vec2, nx: number, nz: number, h: number, place: Placement) {
  const len = Math.min(24, Math.hypot(b[0] - a[0], b[1] - a[1]) - 2);
  if (len < 8) return null;
  const ux = (b[0] - a[0]) / Math.hypot(b[0] - a[0], b[1] - a[1]), uz = (b[1] - a[1]) / Math.hypot(b[0] - a[0], b[1] - a[1]);
  const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
  const g = new THREE.Group();
  g.position.set(mx, 0, mz);
  // Local frame: +x along the facade, −z out to the street.
  g.rotation.y = Math.atan2(-nx, -nz);
  const parts: Part[] = [];
  const H = Math.min(h, 22);
  for (let x = -len / 2; x <= len / 2 + 0.01; x += 2.5) for (const z of [-0.3, -1.4]) bx(parts, 0.06, H, 0.06, x, H / 2, z, 0x9aa0a6);
  for (let y = 2; y < H; y += 2) for (const z of [-0.3, -1.4]) bx(parts, len, 0.05, 0.05, 0, y, z, 0x9aa0a6);
  for (let y = 2; y < H; y += 2) bx(parts, len, 0.04, 1.2, 0, y - 0.05, -0.85, 0xb8a27a); // boards
  g.add(new THREE.Mesh(merge(parts), new THREE.MeshLambertMaterial({ vertexColors: true })));
  const net = new THREE.Mesh(new THREE.PlaneGeometry(len, H), new THREE.MeshLambertMaterial({ color: 0x2f6a45, transparent: true, opacity: 0.72, side: THREE.DoubleSide }));
  net.position.set(0, H / 2, -1.5);
  g.add(net);
  // Street furniture in front of it: skip, site office, toilet, barriers.
  const st: Part[] = [];
  const out = -4.6;
  bx(st, 3.6, 1.2, 1.8, -len / 4, 0.7, out, 0xb8262c); // skip
  bx(st, 3.2, 0.08, 1.5, -len / 4, 1.32, out, 0x5a4a3a); // rubble top
  for (let i = 0; i < 12; i++) bx(st, 0.12, 0.22, 0.12, -len / 4 - 1.3 + (i % 6) * 0.5, 1.45, out - 0.4 + Math.floor(i / 6) * 0.7, i % 3 ? 0xc23b32 : 0x8fd0e8);
  bx(st, 2.4, 2.5, 2.4, len / 4, 1.25, out + 0.6, 0xe8e2d6); // site office
  bx(st, 2.42, 0.3, 2.42, len / 4, 2.5, out + 0.6, 0xf2c418);
  bx(st, 2.42, 0.3, 2.42, len / 4, 0.15, out + 0.6, 0xf2c418);
  bx(st, 1.1, 2.3, 1.1, len / 4 + 2.0, 1.15, out + 0.6, 0x1f5fa8); // portable toilet
  for (let x = -len / 2; x < len / 2; x += 2.2) {
    bx(st, 2.0, 0.05, 0.05, x + 1.1, 1.05, -2.4, 0xb8bcc0);
    bx(st, 2.0, 0.05, 0.05, x + 1.1, 0.25, -2.4, 0xb8bcc0);
    bx(st, 0.05, 1.1, 0.05, x + 0.1, 0.55, -2.4, 0xb8bcc0);
  }
  const sm = new THREE.Mesh(merge(st), new THREE.MeshLambertMaterial({ vertexColors: true }));
  sm.castShadow = true;
  g.add(sm);
  const ry = g.rotation.y;
  const toW = (lx: number, lz: number): Vec2 => [mx + lx * Math.cos(ry) + lz * Math.sin(ry), mz - lx * Math.sin(ry) + lz * Math.cos(ry)];
  const [kx, kz] = toW(-len / 4, out);
  if (!place.free(kx, kz, 0.2)) return null;
  const [ox2, oz2] = toW(len / 4, out + 0.6);
  const [tx, tz] = toW(len / 4 + 2.0, out + 0.6);
  const [bx2, bz2] = toW(0, -2.4);
  void ux; void uz;
  const colliders: Collider[] = [
    { x: kx, z: kz, w: 3.6, d: 1.8, rot: ry }, { x: ox2, z: oz2, w: 2.4, d: 2.4, rot: ry }, { x: tx, z: tz, w: 1.1, d: 1.1, rot: ry },
    { x: bx2, z: bz2, w: len, d: 0.1, rot: ry },
  ];
  // The skip is searched from its street side.
  const [sx2, sz2] = toW(-len / 4, out - 1.4);
  return { group: g, colliders, skip: { x: sx2, z: sz2, dir: ry } };
}

/** Across the river: Gellért Hill with the Liberty Statue and the citadel walls, the
 *  Buda bank, and the green steel of Szabadság híd. Scenery only. */
function farBank(city: CityData) {
  const g = new THREE.Group();
  // Gellért Hill (Citadella ~1.15 km west of the origin, ~130 m above the river).
  const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x5a7a45, flatShading: true }));
  hill.scale.set(430, 135, 360);
  hill.position.set(-1260, 0, -150);
  g.add(hill);
  const citadel = new THREE.Mesh(new THREE.BoxGeometry(180, 14, 60), new THREE.MeshLambertMaterial({ color: 0xb8ae98 }));
  citadel.position.set(-1230, 128, -170);
  g.add(citadel);
  // Liberty Statue: pedestal and a figure raising a palm leaf.
  const statue = new THREE.Group();
  const stone = new THREE.MeshLambertMaterial({ color: 0xd8d0bc });
  const bronze = new THREE.MeshLambertMaterial({ color: 0x4a5a4a });
  statue.add(new THREE.Mesh(new THREE.BoxGeometry(8, 26, 8).translate(0, 13, 0), stone));
  statue.add(new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.4, 12, 8).translate(0, 32, 0), bronze));
  const arms = new THREE.Mesh(new THREE.BoxGeometry(14, 1.2, 1.2).translate(0, 41, 0), bronze);
  statue.add(arms, new THREE.Mesh(new THREE.SphereGeometry(1.4, 8, 6).translate(0, 40, 0), bronze));
  statue.position.set(-1150, 130, -140);
  g.add(statue);
  // A row of Buda bank buildings at the hill's foot, and the Gellért baths' bulk.
  const bank: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 14; i++) {
    const x = -760 - (i % 3) * 18, z = -60 + i * 38;
    bank.push(colored(new THREE.BoxGeometry(16, 18 + (i % 4) * 4, 30).translate(x, 10, z), [0xd8c8a8, 0xb9b4aa, 0xe3c58d, 0xaab8c0][i % 4]));
  }
  bank.push(colored(new THREE.BoxGeometry(60, 30, 80).translate(-770, 15, 140), 0xe2d8c2));
  const bm = new THREE.Mesh(merge(bank), new THREE.MeshLambertMaterial({ vertexColors: true }));
  g.add(bm);
  // Szabadság híd: green steel portals with gold turul birds over the piers and the
  // curving chords of the cantilever trusses either side of the deck.
  const deck = city.roads.find((r) => r.bridge && r.name === 'Szabadság híd');
  if (deck) {
    const a = deck.pts[0], b = deck.pts[deck.pts.length - 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len;
    const green = new THREE.MeshLambertMaterial({ color: 0x3f7a4f });
    const gold = new THREE.MeshLambertMaterial({ color: 0xd8b84a });
    const bridge = new THREE.Group();
    const H = 7; // deck height
    const towerH = 20;
    const piers = [0.28, 0.72];
    for (const f of piers) {
      for (const s of [-1, 1]) {
        bridge.add(new THREE.Mesh(new THREE.BoxGeometry(0.8, towerH, 0.8).translate(len * f - len / 2, H + towerH / 2, s * 6), green));
        const turul = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6).translate(len * f - len / 2, H + towerH + 1.2, s * 6), gold);
        bridge.add(turul);
      }
      bridge.add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 12.6).translate(len * f - len / 2, H + towerH - 2, 0), green));
    }
    // Chords: sampled curve from the ends up to the pier tops and down to mid-span.
    const chord = (x: number) => {
      const t = x / len;
      const p1 = piers[0], p2 = piers[1];
      if (t < p1) return H + 2 + (towerH - 3) * Math.pow(t / p1, 1.6);
      if (t > p2) return H + 2 + (towerH - 3) * Math.pow((1 - t) / (1 - p2), 1.6);
      const m = (t - p1) / (p2 - p1);
      return H + 2 + (towerH - 3) * (1 - Math.sin(m * Math.PI) * 0.82);
    };
    const N = 48;
    for (const s of [-1, 1]) {
      for (let i = 0; i < N; i++) {
        const x0 = (i / N) * len, x1 = ((i + 1) / N) * len;
        const y0 = chord(x0), y1 = chord(x1);
        const seg = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(x1 - x0, y1 - y0), 0.5, 0.5), green);
        seg.position.set((x0 + x1) / 2 - len / 2, (y0 + y1) / 2, s * 6);
        seg.rotation.z = Math.atan2(y1 - y0, x1 - x0);
        bridge.add(seg);
        if (i % 2 === 0) bridge.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, y0 - H, 0.2).translate(x0 - len / 2, H + (y0 - H) / 2, s * 6), green));
      }
      bridge.add(new THREE.Mesh(new THREE.BoxGeometry(len, 1.0, 0.4).translate(0, H + 0.6, s * 6), green));
    }
    bridge.position.set((a[0] + b[0]) / 2, 0, (a[1] + b[1]) / 2);
    bridge.rotation.y = -Math.atan2(uz, ux);
    g.add(bridge);
  }
  return g;
}

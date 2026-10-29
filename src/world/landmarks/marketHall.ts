import * as THREE from 'three';
import type { Building, Vec2 } from '../cityData';
import { TriBuffer, walls } from '../buildCity';
import { facadeMaterial } from '../facade';
import { obb, pyramid, zsolnayTexture, signTexture } from './common';

// Központi Vásárcsarnok: red-brown brick with stone trim, a tall gabled roof of glazed
// Zsolnay tiles in a diamond pattern, and the Fővám tér gable with its arched portal
// and two corner towers. Simplified, but recognisable from across the square.

const BRICK = 0x9a4a33;
const STONE = 0xd8cdb4;
const WALL_H = 16;
const RIDGE_H = 31;

export interface Collider { x: number; z: number; w: number; d: number; rot: number; }
export interface HallInfo { group: THREE.Group; door: { x: number; z: number; facing: number }; colliders: Collider[]; }

export function buildMarketHall(b: Building, mainEdge: [Vec2, Vec2]): HallInfo {
  const group = new THREE.Group();
  group.name = 'Központi Vásárcsarnok';
  // Brick walls with arched windows from the facade shader.
  const buf = new TriBuffer();
  buf.style = [0.3, 3];
  walls(buf, b.outer, false, WALL_H, new THREE.Color(BRICK), true);
  const wallMesh = new THREE.Mesh(buf.geometry(true), facadeMaterial());
  wallMesh.castShadow = wallMesh.receiveShadow = true;
  group.add(wallMesh);

  // Roof over the oriented box of the footprint: a long gable along the long axis.
  const o = obb(b.outer);
  const L = o.hl * 2, W = o.hw * 2;
  const tiles = zsolnayTexture();
  tiles.repeat.set(L / 6, (W / 2) / 3);
  const roofMat = new THREE.MeshLambertMaterial({ map: tiles, side: THREE.DoubleSide });
  const rise = RIDGE_H - WALL_H;
  const slope = Math.hypot(W / 2, rise);
  const roof = new THREE.Group();
  for (const side of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(L + 1, slope + 0.6), roofMat);
    // Tilt the plane's +y from the eave up to the ridge.
    p.rotation.x = -side * Math.atan2(W / 2, rise);
    p.position.set(0, WALL_H + rise / 2, (side * W) / 4);
    p.castShadow = true;
    roof.add(p);
  }
  // Gable walls at both ends (brick triangles) with a stone rim.
  const gable = new THREE.Shape([new THREE.Vector2(-W / 2, 0), new THREE.Vector2(W / 2, 0), new THREE.Vector2(0, rise)]);
  const gableGeo = new THREE.ExtrudeGeometry(gable, { depth: 0.6, bevelEnabled: false });
  const brickMat = new THREE.MeshLambertMaterial({ color: BRICK });
  const stoneMat = new THREE.MeshLambertMaterial({ color: STONE });
  for (const end of [-1, 1]) {
    const gm = new THREE.Mesh(gableGeo, brickMat);
    gm.rotation.y = Math.PI / 2;
    gm.position.set(end * (L / 2) - 0.3, WALL_H, 0);
    roof.add(gm);
    // A big rose/arched window in the gable.
    const win = new THREE.Mesh(new THREE.CircleGeometry(3.2, 20), new THREE.MeshLambertMaterial({ color: 0x24303a }));
    win.rotation.y = end * Math.PI / 2;
    win.position.set(end * (L / 2 + 0.35), WALL_H + rise * 0.38, 0);
    roof.add(win);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(3.3, 0.35, 6, 24), stoneMat);
    rim.rotation.y = Math.PI / 2;
    rim.position.copy(win.position);
    roof.add(rim);
  }
  // Ridge cresting and a row of small dormers.
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(L, 0.5, 0.5), new THREE.MeshLambertMaterial({ color: 0x3a4a3a }));
  ridge.position.y = RIDGE_H;
  roof.add(ridge);
  roof.position.set(o.cx, 0, o.cz);
  roof.rotation.y = o.rotY;
  group.add(roof);

  // The main facade on Fővám tér: two corner towers, a stone portal with three arches,
  // a stone gable trim and a lookalike name band.
  // The facade is the end of the oriented box nearest the main edge (Fővám tér).
  void mainEdge;
  const endSign = (o.cx + o.ux * o.hl) + (o.cz + o.uz * o.hl) < (o.cx - o.ux * o.hl) + (o.cz - o.uz * o.hl) ? 1 : -1;
  const nx = o.ux * endSign, nz = o.uz * endSign;
  const mx = o.cx + nx * o.hl, mz = o.cz + nz * o.hl;
  const len = W;
  const facing = Math.atan2(-nx, -nz); // heading that looks out of the hall
  const front = new THREE.Group();
  front.position.set(mx, 0, mz);
  front.rotation.y = facing; // local −z points out to the square
  const towerTiles = zsolnayTexture(['#2f7a4a', '#e0b23a', '#c9622e', '#3a2a20']);
  towerTiles.repeat.set(2, 2);
  for (const side of [-1, 1]) {
    const tower = new THREE.Group();
    tower.add(new THREE.Mesh(new THREE.BoxGeometry(5, WALL_H + 9, 5).translate(0, (WALL_H + 9) / 2, 0), brickMat));
    for (const y of [WALL_H * 0.35, WALL_H * 0.7, WALL_H + 6]) tower.add(new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.6, 5.4).translate(0, y, 0), stoneMat));
    const cap = new THREE.Mesh(pyramid(5.6, 9), new THREE.MeshLambertMaterial({ map: towerTiles }));
    cap.position.y = WALL_H + 9;
    tower.add(cap);
    const spike = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3), new THREE.MeshLambertMaterial({ color: 0x2b2b2b }));
    spike.position.y = WALL_H + 19.5;
    tower.add(spike);
    tower.position.set(side * (len / 2 - 2.5), 0, -0.5);
    tower.traverse((m) => { if (m instanceof THREE.Mesh) m.castShadow = true; });
    front.add(tower);
  }
  // Portal: a stone block with three dark arches.
  const portal = new THREE.Group();
  portal.add(new THREE.Mesh(new THREE.BoxGeometry(16, 11, 1.2).translate(0, 5.5, -0.6), stoneMat));
  const arch = new THREE.Shape();
  arch.moveTo(-1.7, 0); arch.lineTo(-1.7, 4.4); arch.absarc(0, 4.4, 1.7, Math.PI, 0, true); arch.lineTo(1.7, 0); arch.lineTo(-1.7, 0);
  const archGeo = new THREE.ShapeGeometry(arch);
  for (const x of [-4.6, 0, 4.6]) {
    const m = new THREE.Mesh(archGeo, new THREE.MeshLambertMaterial({ color: 0x1a1612 }));
    m.position.set(x, 0, -1.22);
    m.rotation.y = Math.PI;
    portal.add(m);
  }
  const band = new THREE.Mesh(new THREE.PlaneGeometry(13, 1.4), new THREE.MeshLambertMaterial({ map: signTexture('VÁSÁRCSARNOK', '#d8cdb4', '#5a2a1c', 1024, 110, 'bold 80px Georgia, serif') }));
  band.position.set(0, 9.2, -1.23);
  band.rotation.y = Math.PI;
  portal.add(band);
  front.add(portal);
  // Stone trim up the main gable.
  const trim = new THREE.Mesh(new THREE.BoxGeometry(len - 4, 0.7, 1).translate(0, WALL_H, -0.4), stoneMat);
  front.add(trim);
  group.add(front);

  // Towers and portal stand proud of the wall: make them solid.
  const toWorld = (lx: number, lz: number) => {
    const c = Math.cos(facing), s = Math.sin(facing);
    return [mx + lx * c + lz * s, mz - lx * s + lz * c] as const;
  };
  const colliders: Collider[] = [];
  for (const side of [-1, 1]) { const [x, z] = toWorld(side * (len / 2 - 2.5), -0.5); colliders.push({ x, z, w: 5, d: 5, rot: facing }); }
  const [px, pz] = toWorld(0, -0.6);
  colliders.push({ x: px, z: pz, w: 16, d: 1.2, rot: facing });
  return { group, door: { x: mx + nx * 2.0, z: mz + nz * 2.0, facing }, colliders };
}

/** The hall's main (Fővám tér) facade: the long-enough edge furthest toward −x −z. */
export function mostNorthWestEdge(ring: Vec2[]): [Vec2, Vec2] {
  let best: [Vec2, Vec2] = [ring[0], ring[1]], bestV = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 15) continue;
    const v = (a[0] + b[0]) / 2 + (a[1] + b[1]) / 2;
    if (v < bestV) { bestV = v; best = [a, b]; }
  }
  return best;
}

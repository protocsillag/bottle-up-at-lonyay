import * as THREE from 'three';

// The SPAR shopfront style from reference/lonyay-utca/spar-corner.jpg: an ochre rusticated
// ground floor with tall round-arched shop windows, black fascia boards with the name in
// white, black lattice security grilles (pulled down 00:00–06:00), a red neon script
// "Élelmiszer" along the facade, a round green-and-red sign on a bracket, a red fire
// hydrant and short green bollards. Plain wordmark in the game font, no logo files.
// Local frame: origin 1 m in front of the wall, wall plane at z = +1, street toward −z.

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, transparent = false) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  if (!transparent) { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); }
  draw(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

let tex: { fascia: THREE.Texture; neon: THREE.Texture; grille: THREE.Texture; round: THREE.Texture } | null = null;
function textures() {
  tex ??= {
    fascia: canvasTex(256, 64, (g) => {
      g.fillStyle = '#111'; g.fillRect(0, 0, 256, 64);
      g.fillStyle = '#fff'; g.font = 'bold 40px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('SPAR', 112, 34);
      g.strokeStyle = '#fff'; g.lineWidth = 4; g.beginPath(); g.arc(196, 32, 16, 0, Math.PI * 2); g.stroke();
    }),
    neon: canvasTex(1024, 128, (g) => {
      g.font = 'italic bold 92px "Brush Script MT", "Segoe Script", cursive';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = '#ff3a2a'; g.shadowBlur = 18;
      g.fillStyle = '#e83a30'; g.fillText('Élelmiszer', 512, 66);
    }, true),
    grille: canvasTex(128, 128, (g) => {
      g.strokeStyle = '#141414'; g.lineWidth = 5;
      for (let i = -128; i < 256; i += 26) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 128, 128); g.stroke(); g.beginPath(); g.moveTo(i + 128, 0); g.lineTo(i, 128); g.stroke(); }
    }, true),
    round: canvasTex(128, 128, (g) => {
      g.clearRect(0, 0, 128, 128);
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#2b8a3e'; g.lineWidth = 12; g.beginPath(); g.arc(64, 64, 54, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#2b8a3e'; g.beginPath(); g.moveTo(64, 26); g.lineTo(96, 92); g.lineTo(32, 92); g.closePath(); g.fill();
      g.fillStyle = '#c8262c'; g.fillRect(56, 80, 16, 22);
    }, true),
  };
  tex.grille.wrapS = tex.grille.wrapT = THREE.RepeatWrapping;
  return tex;
}

export interface SparFront { group: THREE.Group; setClosed(closed: boolean): void; setNight(n: number): void; colliders: { x: number; z: number; w: number; d: number; rot: number }[]; }

export function buildSparFront(d: { x: number; z: number; facing: number }, arches = 3): SparFront {
  const t = textures();
  const g = new THREE.Group();
  g.position.set(d.x, 0, d.z);
  g.rotation.y = d.facing;
  const W = 3.0; // arch spacing
  const total = arches * W;
  const ochre = new THREE.MeshLambertMaterial({ color: 0xc9a96a });
  const stone = new THREE.MeshLambertMaterial({ color: 0xc8b8a8 });
  // Rusticated ochre surround and a pinkish stone plinth.
  const front = new THREE.Mesh(new THREE.BoxGeometry(total + 0.6, 4.6, 0.25).translate(0, 2.3, 0.86), ochre);
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(total + 0.7, 0.7, 0.32).translate(0, 0.35, 0.82), stone);
  g.add(front, plinth);
  const glass = new THREE.MeshLambertMaterial({ color: 0x2a3540, emissive: 0xfff2d8, emissiveIntensity: 0.12 });
  const black = new THREE.MeshLambertMaterial({ color: 0x151515 });
  const grilleMat = new THREE.MeshLambertMaterial({ map: t.grille, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
  const grilles: THREE.Mesh[] = [];
  for (let i = 0; i < arches; i++) {
    const x = -total / 2 + W / 2 + i * W;
    // Tall round-arched shop window.
    const s = new THREE.Shape();
    s.moveTo(-1.05, 0.7); s.lineTo(-1.05, 3.1); s.absarc(0, 3.1, 1.05, Math.PI, 0, true); s.lineTo(1.05, 0.7); s.lineTo(-1.05, 0.7);
    const win = new THREE.Mesh(new THREE.ShapeGeometry(s), glass);
    win.position.set(x, 0, 0.72);
    win.rotation.y = Math.PI;
    g.add(win);
    // Black fascia board across the arch with the name.
    const fascia = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 0.5), new THREE.MeshLambertMaterial({ map: t.fascia, emissive: 0xffffff, emissiveMap: t.fascia, emissiveIntensity: 0.2 }));
    fascia.position.set(x, 3.0, 0.7);
    fascia.rotation.y = Math.PI;
    g.add(fascia);
    // Lattice grille over the lower window, down when the shop is shut.
    const gr = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 2.3), grilleMat.clone());
    (gr.material as THREE.MeshLambertMaterial).map = t.grille.clone();
    (gr.material as THREE.MeshLambertMaterial).map!.repeat.set(2.1 / 0.6, 2.3 / 0.6);
    (gr.material as THREE.MeshLambertMaterial).map!.needsUpdate = true;
    gr.position.set(x, 1.85, 0.68);
    gr.rotation.y = Math.PI;
    gr.visible = false;
    grilles.push(gr);
    g.add(gr);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.12, 0.3).translate(x, 0.66, 0.6), black);
    g.add(sill);
  }
  // Red neon script above the arches.
  const neonMat = new THREE.MeshBasicMaterial({ map: t.neon, transparent: true, depthWrite: false, color: 0xb03028 });
  const neon = new THREE.Mesh(new THREE.PlaneGeometry(total * 0.9, (total * 0.9) / 8), neonMat);
  neon.position.set(0, 4.25, 0.5);
  neon.rotation.y = Math.PI;
  g.add(neon);
  // Round sign on a bracket at the end.
  const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.9).translate(total / 2 + 0.2, 3.6, 0.4), black);
  const round = new THREE.Mesh(new THREE.CircleGeometry(0.42, 24), new THREE.MeshLambertMaterial({ map: t.round, transparent: true, side: THREE.DoubleSide }));
  round.position.set(total / 2 + 0.2, 3.2, 0.0);
  round.rotation.y = Math.PI / 2;
  g.add(bracket, round);
  // Hydrant and short green bollards at the kerb.
  const red = new THREE.MeshLambertMaterial({ color: 0xb8262c });
  const hyd = new THREE.Group();
  hyd.add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.8, 10).translate(0, 0.4, 0), red));
  hyd.add(new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 6).translate(0, 0.82, 0), red));
  hyd.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.36, 6).rotateZ(Math.PI / 2).translate(0, 0.6, 0), red));
  hyd.position.set(total / 2 + 0.6, 0, -2.6);
  g.add(hyd);
  const green = new THREE.MeshLambertMaterial({ color: 0x1f4a32 });
  const colliders: SparFront['colliders'] = [];
  const toW = (lx: number, lz: number) => ({ x: d.x + lx * Math.cos(d.facing) + lz * Math.sin(d.facing), z: d.z - lx * Math.sin(d.facing) + lz * Math.cos(d.facing) });
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.75, 8).translate(0, 0.375, 0), green);
    const lx = -total / 2 + i * 1.6;
    b.position.set(lx, 0, -2.7);
    g.add(b);
    const w = toW(lx, -2.7);
    colliders.push({ x: w.x, z: w.z, w: 0.2, d: 0.2, rot: 0 });
  }
  const hw = toW(total / 2 + 0.6, -2.6);
  colliders.push({ x: hw.x, z: hw.z, w: 0.35, d: 0.35, rot: 0 });
  g.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = o.material !== neonMat; });
  return {
    group: g,
    colliders,
    setClosed(closed) { for (const gr of grilles) gr.visible = closed; glass.emissiveIntensity = closed ? 0.02 : 0.12; },
    setNight(n) { neonMat.color.setRGB(0.69 + 0.31 * n, 0.19 + 0.2 * n, 0.16 + 0.15 * n); },
  };
}

import * as THREE from 'three';

// A REpont-style bottle machine in flat shapes, after reference/mohu-repont-machines.png:
// dark frame, yellow header with a lookalike wordmark, black glass band with the round
// opening and a small screen, a yellow strip with the printer slot, and a big yellow
// front panel with ALU / ÜVEG / PET icons and the two rule panels. No logo files.
// Local frame: the machine faces −z (like the characters), origin on the floor centre.

export const MACHINE_W = 0.78;
export const MACHINE_H = 2.05;
export const MACHINE_D = 0.55;
export const OPENING_Y = 1.42;
export const OPENING_X = -0.12;
export const OPENING_R = 0.13;

const YELLOW = '#ffd21f';
const INK = '#1d1d1b';
const BLUE = '#3d9bd8';

export type ScreenMode =
  | { kind: 'idle' }
  | { kind: 'closed' }
  | { kind: 'megtelt' }
  | { kind: 'busy' }
  | { kind: 'feeding'; count: number; ft: number }
  | { kind: 'reject'; message: string; count: number; ft: number }
  | { kind: 'done'; count: number; ft: number };

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!] as const;
}

/** Bottle / can pictogram, drawn upright with its base at (x, y). */
function pictogram(g: CanvasRenderingContext2D, kind: 'alu' | 'glass' | 'pet', x: number, y: number, s: number) {
  g.fillStyle = BLUE;
  if (kind === 'alu') { g.fillRect(x - 9 * s, y - 34 * s, 18 * s, 34 * s); return; }
  const h = kind === 'glass' ? 80 : 104, w = kind === 'glass' ? 22 : 30;
  g.beginPath();
  g.moveTo(x - w / 2 * s, y);
  g.lineTo(x - w / 2 * s, y - h * 0.6 * s);
  g.quadraticCurveTo(x - w / 2 * s, y - h * 0.75 * s, x - 5 * s, y - h * 0.85 * s);
  g.lineTo(x - 5 * s, y - h * s);
  g.lineTo(x + 5 * s, y - h * s);
  g.lineTo(x + 5 * s, y - h * 0.85 * s);
  g.quadraticCurveTo(x + w / 2 * s, y - h * 0.75 * s, x + w / 2 * s, y - h * 0.6 * s);
  g.lineTo(x + w / 2 * s, y);
  g.closePath();
  g.fill();
}

function recycleIcon(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  g.strokeStyle = color;
  g.lineWidth = r * 0.28;
  for (const a0 of [0.2, Math.PI + 0.2]) {
    g.beginPath();
    g.arc(x, y, r, a0, a0 + 2.4);
    g.stroke();
    const a1 = a0 + 2.4;
    const tx = x + Math.cos(a1) * r, ty = y + Math.sin(a1) * r;
    g.beginPath();
    g.moveTo(tx + Math.cos(a1 + 0.9) * r * 0.45, ty + Math.sin(a1 + 0.9) * r * 0.45);
    g.lineTo(tx, ty);
    g.lineTo(tx + Math.cos(a1 - 0.6) * r * 0.45, ty + Math.sin(a1 - 0.6) * r * 0.45);
    g.stroke();
  }
}

/** Header sign: lookalike wordmark. */
function headerTexture() {
  const [c, g] = canvas(512, 160);
  g.fillStyle = YELLOW; g.fillRect(0, 0, 512, 160);
  recycleIcon(g, 92, 80, 30, '#2a8fd0');
  g.fillStyle = INK;
  g.font = 'bold 84px system-ui, sans-serif';
  g.textBaseline = 'middle';
  g.fillText('REpont', 150, 84);
  return tex(c);
}

/** Lower front panel with the instructions and pictograms. */
function panelTexture() {
  const [c, g] = canvas(512, 900);
  g.fillStyle = YELLOW; g.fillRect(0, 0, 512, 900);
  g.fillStyle = INK;
  g.font = '600 36px system-ui, sans-serif';
  const lines = ['Itt váltsd vissza', 'a műanyag,', 'az üveg és a fém', 'italcsomagolásokat!'];
  lines.forEach((l, i) => g.fillText(l, 40, 70 + i * 44));
  recycleIcon(g, 440, 80, 26, '#2a8fd0');
  // Pictogram box.
  g.strokeStyle = INK; g.lineWidth = 3;
  g.beginPath(); g.roundRect(60, 280, 392, 220, 18); g.stroke();
  pictogram(g, 'alu', 150, 450, 1.2);
  pictogram(g, 'glass', 256, 450, 1.2);
  pictogram(g, 'pet', 365, 450, 1.2);
  g.fillStyle = BLUE; g.font = 'bold 22px system-ui, sans-serif'; g.textAlign = 'center';
  g.fillText('ALU', 150, 482); g.fillText('ÜVEG', 256, 482); g.fillText('PET', 365, 482);
  g.textAlign = 'left';
  // Rule panels.
  const rule = (y: number, title: string, body: string, crossed: boolean) => {
    g.strokeStyle = INK; g.lineWidth = 3;
    g.beginPath(); g.arc(90, y + 20, 30, 0, Math.PI * 2); g.stroke();
    g.fillStyle = INK; g.fillRect(84, y, 12, 40);
    if (crossed) { g.strokeStyle = '#c0392b'; g.lineWidth = 5; g.beginPath(); g.moveTo(68, y - 2); g.lineTo(112, y + 42); g.stroke(); }
    g.fillStyle = INK;
    g.font = 'bold 30px system-ui, sans-serif';
    g.fillText(title, 140, y + 14);
    g.font = '18px system-ui, sans-serif';
    g.fillText(body, 140, y + 44);
  };
  rule(560, '1 dl és 3 l között', 'Csak ekkora palackot fogad az automata.', false);
  rule(660, 'Ne nyomd össze!', 'Az összenyomott csomagolást nem fogadja.', true);
  g.font = '16px system-ui, sans-serif';
  g.fillText('Köszönjük, hogy visszaváltasz!', 40, 790);
  // Footer: generic lookalike, not the real logo.
  g.font = 'bold 34px system-ui, sans-serif';
  g.fillText('∞ visszaváltás', 40, 860);
  g.font = '18px system-ui, sans-serif';
  g.fillText('Újrahasznosítjuk.', 330, 850);
  g.fillText('Közösen.', 330, 872);
  return tex(c);
}

/** Small strip under the glass band: QR-ish block, arrow, printer slot. */
function stripTexture() {
  const [c, g] = canvas(512, 64);
  g.fillStyle = YELLOW; g.fillRect(0, 0, 512, 64);
  g.fillStyle = INK;
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) if ((i * 7 + j * 3) % 5 < 3) g.fillRect(20 + i * 7, 11 + j * 7, 6, 6);
  g.font = '14px system-ui, sans-serif';
  g.fillText('Váltsd be a', 80, 28);
  g.fillText('kuponodat!', 80, 46);
  g.beginPath(); g.moveTo(190, 20); g.lineTo(215, 32); g.lineTo(190, 44); g.fill();
  g.fillRect(300, 14, 70, 36);
  g.fillStyle = '#555'; g.fillRect(310, 22, 50, 6);
  g.fillStyle = INK; g.fillRect(410, 24, 70, 16);
  return tex(c);
}

function tex(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Shared static textures and materials.
let shared: { header: THREE.Texture; panel: THREE.Texture; strip: THREE.Texture } | null = null;

export class MachineModel {
  readonly root = new THREE.Group();
  private screenCanvas: HTMLCanvasElement;
  private screenTex: THREE.CanvasTexture;
  readonly ring: THREE.Mesh;
  private ringMat: THREE.MeshBasicMaterial;
  private lastKey = '';
  /** Paper strip that grows out of the printer slot. */
  readonly receipt: THREE.Mesh;

  constructor() {
    shared ??= { header: headerTexture(), panel: panelTexture(), strip: stripTexture() };
    const frame = new THREE.MeshLambertMaterial({ color: 0x2b2d30 });
    const W = MACHINE_W, H = MACHINE_H, D = MACHINE_D;
    const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D).translate(0, H / 2, 0), frame);
    body.castShadow = true;
    this.root.add(body);
    const face = (w: number, h: number, y: number, map: THREE.Texture | null, color = 0xffffff, x = 0) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), map ? new THREE.MeshLambertMaterial({ map }) : new THREE.MeshLambertMaterial({ color }));
      m.position.set(x, y, -D / 2 - 0.003);
      m.rotation.y = Math.PI;
      this.root.add(m);
      return m;
    };
    const iw = W - 0.1;
    face(iw, iw * (160 / 512), 1.86, shared.header);
    // Black glass band.
    face(iw, 0.34, OPENING_Y, null, 0x0d0f12);
    face(iw, iw / 8, 1.2, shared.strip);
    face(iw, 1.06, 0.6, shared.panel);
    // The round opening: a dark tube with a rim and the alignment ring.
    const rim = new THREE.Mesh(new THREE.TorusGeometry(OPENING_R + 0.015, 0.018, 8, 32), new THREE.MeshLambertMaterial({ color: 0x3a3d42 }));
    rim.position.set(-OPENING_X, OPENING_Y, -D / 2 - 0.01);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(OPENING_R, 32), new THREE.MeshBasicMaterial({ color: 0x050505 }));
    hole.position.set(-OPENING_X, OPENING_Y, -D / 2 - 0.006);
    hole.rotation.y = Math.PI;
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0x444444 });
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(OPENING_R + 0.045, 0.01, 6, 40), this.ringMat);
    this.ring.position.set(-OPENING_X, OPENING_Y, -D / 2 - 0.012);
    this.root.add(rim, hole, this.ring);
    // Screen right of the opening (as seen from the front).
    [this.screenCanvas] = canvas(256, 192);
    this.screenTex = tex(this.screenCanvas);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.18), new THREE.MeshBasicMaterial({ map: this.screenTex }));
    screen.position.set(-0.2, OPENING_Y, -D / 2 - 0.006);
    screen.rotation.y = Math.PI;
    this.root.add(screen);
    // Receipt paper, hidden until printing.
    this.receipt = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.2).translate(0, -0.1, 0), new THREE.MeshLambertMaterial({ color: 0xf6f3ea, side: THREE.DoubleSide }));
    this.receipt.position.set(-0.1, 1.2 - 0.02, -D / 2 - 0.01);
    this.receipt.rotation.set(-0.15, Math.PI, 0);
    this.receipt.scale.y = 0.001;
    this.receipt.visible = false;
    this.root.add(this.receipt);
    this.setScreen({ kind: 'idle' });
  }

  /** World position of the opening centre. */
  openingWorld(target = new THREE.Vector3()) {
    return this.ring.getWorldPosition(target);
  }

  setRing(color: number) { this.ringMat.color.setHex(color); }

  setScreen(mode: ScreenMode) {
    const key = JSON.stringify(mode);
    if (key === this.lastKey) return;
    this.lastKey = key;
    const g = this.screenCanvas.getContext('2d')!;
    const W = 256, H = 192;
    const bg = mode.kind === 'reject' ? '#c0392b' : mode.kind === 'megtelt' || mode.kind === 'closed' ? '#8a8f96' : '#f4f6f8';
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.fillStyle = mode.kind === 'reject' ? '#fff' : INK;
    g.textAlign = 'center';
    const big = (t: string, y: number, size = 30) => { g.font = `bold ${size}px system-ui, sans-serif`; g.fillText(t, W / 2, y); };
    const small = (t: string, y: number) => { g.font = '18px system-ui, sans-serif'; g.fillText(t, W / 2, y); };
    switch (mode.kind) {
      case 'idle': big('Helyezze be', 70, 26); big('a palackot!', 104, 26); small('Insert a bottle', 150); break;
      case 'closed': big('Zárva', 90); small('Nyitás 06:00', 130); break;
      case 'megtelt': g.fillStyle = '#fff'; big('Megtelt', 90, 38); small('Használja a másik gépet', 135); break;
      case 'busy': big('…', 100); break;
      case 'feeding': small(`${mode.count} db`, 50); big(`${mode.ft} Ft`, 112, 44); small('Köszönjük!', 160); break;
      case 'reject': big(mode.message, 92, mode.message.length > 18 ? 20 : 26); small(`${mode.count} db · ${mode.ft} Ft`, 150); break;
      case 'done': small('Nyugta nyomtatása…', 50); big(`${mode.ft} Ft`, 112, 44); small(`${mode.count} db`, 160); break;
    }
    this.screenTex.needsUpdate = true;
  }
}

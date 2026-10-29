import type { CityData, Vec2 } from '../world/cityData';

// North-up minimap. The whole city is drawn once into an offscreen canvas at
// PX_PER_M; each frame a window around the player is copied into a round map, with the
// player arrow in the middle and the return points pinned to the rim when off-map.
// M toggles a large view of the whole playable area.

const PX_PER_M = 1;

export interface MapMarker { p: Vec2; label: string; color: string; }

const COL = {
  bg: '#c9c3b6',
  outside: '#a39d92',
  water: '#4f86a6',
  park: '#86ad62',
  plaza: '#d8d1c3',
  road: '#5b5d61',
  foot: '#e6dfd2',
  building: '#8a8580',
  scenery: '#9a958f',
  boundary: '#ffd200',
};

export class Minimap {
  private base: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private ox: number; private oz: number;
  private large = false;

  constructor(private canvas: HTMLCanvasElement, private city: CityData, private markers: MapMarker[]) {
    const { minX, maxX, minZ, maxZ } = city.extent;
    this.ox = minX; this.oz = minZ;
    this.base = document.createElement('canvas');
    this.base.width = Math.ceil((maxX - minX) * PX_PER_M);
    this.base.height = Math.ceil((maxZ - minZ) * PX_PER_M);
    this.ctx = canvas.getContext('2d')!;
    this.drawBase();
    this.fitCanvas();
    addEventListener('resize', () => this.fitCanvas());
  }

  toggleLarge() {
    this.large = !this.large;
    this.canvas.classList.toggle('large', this.large);
    this.fitCanvas();
  }

  /** Matches the canvas backing store to its CSS size so the map stays sharp. */
  private fitCanvas() {
    const dpr = Math.min(devicePixelRatio, 2);
    this.canvas.width = Math.round(this.canvas.clientWidth * dpr);
    this.canvas.height = Math.round(this.canvas.clientHeight * dpr);
  }

  private toBase([x, z]: Vec2): Vec2 { return [(x - this.ox) * PX_PER_M, (z - this.oz) * PX_PER_M]; }

  private drawBase() {
    const g = this.base.getContext('2d')!;
    const path = (rings: Vec2[][]) => {
      g.beginPath();
      for (const ring of rings) {
        ring.forEach((p, i) => { const [x, y] = this.toBase(p); i ? g.lineTo(x, y) : g.moveTo(x, y); });
        g.closePath();
      }
    };

    // Outside the playable area is darker; the boundary polygon is cut out of it.
    g.fillStyle = COL.outside;
    g.fillRect(0, 0, this.base.width, this.base.height);
    path([this.city.boundary]);
    g.fillStyle = COL.bg;
    g.fill();

    for (const a of this.city.areas) {
      path([a.outer, ...(a.holes ?? [])]);
      g.fillStyle = a.kind === 'water' ? COL.water : a.kind === 'plaza' ? COL.plaza : COL.park;
      g.fill('evenodd');
    }

    g.lineCap = g.lineJoin = 'round';
    for (const kind of ['foot', 'road'] as const) {
      g.strokeStyle = COL[kind];
      for (const r of this.city.roads) {
        if (r.kind !== kind || r.bridge) continue;
        g.lineWidth = r.w * PX_PER_M;
        g.beginPath();
        r.pts.forEach((p, i) => { const [x, y] = this.toBase(p); i ? g.lineTo(x, y) : g.moveTo(x, y); });
        g.stroke();
      }
    }

    for (const b of this.city.buildings) {
      path([b.outer, ...(b.holes ?? [])]);
      g.fillStyle = b.scenery ? COL.scenery : COL.building;
      g.fill('evenodd');
    }

    path([this.city.boundary]);
    g.strokeStyle = COL.boundary;
    g.lineWidth = 3;
    g.setLineDash([10, 8]);
    g.stroke();
  }

  /** heading: player facing around y, 0 = north. */
  draw(px: number, pz: number, heading: number) {
    const c = this.ctx;
    // Draw in CSS pixels; the transform scales up to the backing store.
    const dpr = this.canvas.width / (this.canvas.clientWidth || 1);
    const W = this.canvas.width / dpr, H = this.canvas.height / dpr;
    const R = Math.min(W, H) / 2;
    if (R < 8) return; // hidden
    // Metres shown across the map.
    const span = this.large ? Math.max(this.city.extent.maxX - this.city.extent.minX, this.city.extent.maxZ - this.city.extent.minZ) * 0.72 : 320;
    const scale = (R * 2) / span; // screen px per metre
    // Large view is centred on the playable area, small view on the player.
    const [cx, cz] = this.large ? centre(this.city.boundary) : [px, pz];
    const toScreen = ([x, z]: Vec2): Vec2 => [W / 2 + (x - cx) * scale, H / 2 + (z - cz) * scale];

    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.save();
    c.clearRect(0, 0, W, H);
    c.beginPath();
    if (this.large) c.roundRect(0, 0, W, H, 12); else c.arc(W / 2, H / 2, R, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = COL.outside;
    c.fillRect(0, 0, W, H);
    const [bx, bz] = this.toBase([cx - W / 2 / scale, cz - H / 2 / scale]);
    c.imageSmoothingEnabled = true;
    c.drawImage(this.base, bx, bz, (W / scale) * PX_PER_M, (H / scale) * PX_PER_M, 0, 0, W, H);

    // Return points, clamped to the rim when outside the window.
    for (const m of this.markers) {
      let [sx, sy] = toScreen(m.p);
      if (!this.large) {
        const dx = sx - W / 2, dy = sy - H / 2, d = Math.hypot(dx, dy), max = R - 11;
        if (d > max) { sx = W / 2 + (dx / d) * max; sy = H / 2 + (dy / d) * max; }
      }
      c.beginPath();
      c.arc(sx, sy, 9, 0, Math.PI * 2);
      c.fillStyle = m.color;
      c.fill();
      c.lineWidth = 2;
      c.strokeStyle = '#1b1b1b';
      c.stroke();
      c.fillStyle = '#fff';
      c.font = 'bold 11px system-ui, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(m.label, sx, sy + 0.5);
    }

    // Player arrow: forward is (-sin h, -cos h) in x/z, i.e. a rotation of -h from "up".
    const [ax, ay] = toScreen([px, pz]);
    c.translate(ax, ay);
    c.rotate(-heading);
    c.beginPath();
    c.moveTo(0, -9); c.lineTo(6.5, 7); c.lineTo(0, 3.5); c.lineTo(-6.5, 7); c.closePath();
    c.fillStyle = '#ffd200';
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = '#1b1b1b';
    c.stroke();
    c.restore();

    // North tick and rim.
    c.strokeStyle = 'rgba(27,27,27,0.85)';
    c.lineWidth = 3;
    c.beginPath();
    if (this.large) c.roundRect(1.5, 1.5, W - 3, H - 3, 12); else c.arc(W / 2, H / 2, R - 1.5, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = '#1b1b1b';
    c.font = 'bold 12px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'top';
    c.fillText('N', W / 2, 5);
  }
}

function centre(ring: Vec2[]): Vec2 {
  const xs = ring.map((p) => p[0]), zs = ring.map((p) => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2];
}

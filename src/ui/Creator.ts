import * as THREE from 'three';
import { CharacterModel } from '../player/CharacterModel';
import { GARMENT_SWATCHES, HAIR_SWATCHES, PRESETS, SKIN_SWATCHES, SLOTS, checkName, cloneLook, type CharacterLook } from '../player/look';

// Character creator: pick a preset, swap pieces, choose colours and a name while the
// model turns on a turntable. On confirm a 128 × 128 portrait is rendered for the scores.

const $ = (id: string) => document.getElementById(id)!;
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

export class Creator {
  active = false;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  private turntable = new THREE.Group();
  private model: CharacterModel | null = null;
  private look!: CharacterLook;
  private onDone: (look: CharacterLook, portrait: string) => void = () => {};
  private spin = 0;
  private dragging = false;
  private lastX = 0;
  private el = $('creator');

  constructor(private renderer: THREE.WebGLRenderer) {
    this.scene.background = new THREE.Color(0x2b2d30);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x555048, 1.8));
    const key = new THREE.DirectionalLight(0xfff1d6, 2);
    key.position.set(2, 4, -3);
    this.scene.add(key);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.95, 0.12, 40), new THREE.MeshLambertMaterial({ color: 0xffd200 }));
    disc.position.y = -0.06;
    this.turntable.add(disc);
    this.scene.add(this.turntable);
    this.camera.position.set(0, 1.25, -4.6);
    this.camera.lookAt(0, 0.95, 0);

    const canvas = renderer.domElement;
    canvas.addEventListener('pointerdown', (e) => { if (this.active) { this.dragging = true; this.lastX = e.clientX; } });
    addEventListener('pointerup', () => { this.dragging = false; });
    addEventListener('pointermove', (e) => {
      if (!this.active || !this.dragging) return;
      this.spin += (e.clientX - this.lastX) * 0.01;
      this.lastX = e.clientX;
    });
    $('cr-random').onclick = () => this.randomise();
    $('cr-done').onclick = () => this.confirm();
    const nameEl = $('cr-name') as HTMLInputElement;
    nameEl.addEventListener('input', () => { this.look.name = nameEl.value; this.validate(); });
    nameEl.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') this.confirm(); });
    nameEl.addEventListener('keyup', (e) => e.stopPropagation());
  }

  open(look: CharacterLook, onDone: (look: CharacterLook, portrait: string) => void) {
    this.look = cloneLook(look);
    this.onDone = onDone;
    this.active = true;
    this.el.classList.remove('hidden');
    this.buildUI();
    this.rebuild();
  }

  close() {
    this.active = false;
    this.el.classList.add('hidden');
  }

  private rebuild() {
    if (this.model) this.turntable.remove(this.model.root);
    this.model = new CharacterModel(this.look.colors, this.look.opts);
    this.model.root.rotation.y = 0; // models face −z, toward this camera
    this.turntable.add(this.model.root);
    this.buildUI();
  }

  private buildUI() {
    const presets = $('cr-presets');
    presets.replaceChildren(...PRESETS.map((p) => {
      const b = document.createElement('button');
      b.textContent = p.label;
      b.className = p.id === this.look.preset ? 'on' : '';
      b.onclick = () => {
        this.look = cloneLook(p.look);
        ($('cr-name') as HTMLInputElement).value = this.look.name;
        this.rebuild();
        this.validate();
      };
      return b;
    }));
    const slots = $('cr-slots');
    slots.replaceChildren(...SLOTS.map((slot) => {
      const row = document.createElement('div');
      row.className = 'slot';
      const idx = slot.options.findIndex((o) => o.v === this.look.opts[slot.key]);
      const step = (d: number) => () => {
        const n = slot.options.length;
        (this.look.opts as Record<string, string>)[slot.key] = slot.options[(Math.max(0, idx) + d + n) % n].v;
        this.rebuild();
      };
      const prev = Object.assign(document.createElement('button'), { textContent: '‹', onclick: step(-1) });
      const next = Object.assign(document.createElement('button'), { textContent: '›', onclick: step(1) });
      row.append(
        Object.assign(document.createElement('span'), { className: 'k', textContent: slot.label }),
        prev,
        Object.assign(document.createElement('span'), { className: 'v', textContent: slot.options[Math.max(0, idx)]?.label ?? '' }),
        next,
      );
      return row;
    }));
    const sw = (label: string, list: number[], get: () => number, set: (c: number) => void) => {
      const row = document.createElement('div');
      row.className = 'swatches';
      row.append(Object.assign(document.createElement('span'), { className: 'k', textContent: label }));
      for (const c of list) {
        const b = document.createElement('button');
        b.style.background = hex(c);
        b.className = c === get() ? 'on' : '';
        b.onclick = () => { set(c); this.rebuild(); };
        row.append(b);
      }
      return row;
    };
    $('cr-colors').replaceChildren(
      sw('Hair', HAIR_SWATCHES, () => this.look.colors.hair, (c) => { this.look.colors.hair = c; }),
      sw('Garment', GARMENT_SWATCHES, () => this.look.colors.top, (c) => { this.look.colors.top = c; }),
      sw('Skin', SKIN_SWATCHES, () => this.look.colors.skin, (c) => { this.look.colors.skin = c; }),
    );
    const nameEl = $('cr-name') as HTMLInputElement;
    if (document.activeElement !== nameEl) nameEl.value = this.look.name;
    this.validate();
  }

  private validate() {
    const err = checkName(this.look.name);
    $('cr-error').textContent = err ?? '';
    ($('cr-done') as HTMLButtonElement).disabled = !!err;
    return !err;
  }

  private randomise() {
    const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
    for (const slot of SLOTS) (this.look.opts as Record<string, string>)[slot.key] = pick(slot.options).v;
    this.look.colors.hair = pick(HAIR_SWATCHES);
    this.look.colors.top = pick(GARMENT_SWATCHES);
    this.look.colors.hat = pick(GARMENT_SWATCHES);
    this.look.colors.bottoms = pick([0x2c3445, 0x3d4a66, 0x4a4036, 0x1f1f1f, 0x6b6a4a]);
    this.rebuild();
  }

  private confirm() {
    if (!this.validate()) return;
    this.look.name = this.look.name.trim();
    const portrait = capturePortrait(this.renderer, this.look);
    this.close();
    this.onDone(cloneLook(this.look), portrait);
  }

  render(dt: number) {
    if (!this.dragging) this.spin += dt * 0.5;
    this.turntable.rotation.y = this.spin;
    this.model?.animate(dt, 0, false, false, 0);
    const w = innerWidth, h = innerHeight;
    this.camera.aspect = w / h;
    // Shift the view so the model stands right of the panel.
    this.camera.setViewOffset(w, h, -Math.min(260, w * 0.18), 0, w, h);
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
  }
}

/** Head and shoulders against a Mohu-yellow background, 128 × 128 PNG data URL. */
export function capturePortrait(renderer: THREE.WebGLRenderer, look: CharacterLook): string {
  const size = 128;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffd200);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8172, 2));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(1, 2, -2);
  scene.add(key);
  const model = new CharacterModel(look.colors, { ...look.opts, accessory: look.opts.accessory === 'dog' ? 'none' : look.opts.accessory });
  model.root.rotation.y = -0.35;
  model.animate(0.016, 0, false, false, 0);
  scene.add(model.root);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 10);
  cam.position.set(0.18, 1.72, -1.32);
  cam.lookAt(0, 1.6, 0);
  const rt = new THREE.WebGLRenderTarget(size, size, { colorSpace: THREE.SRGBColorSpace });
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  renderer.render(scene, cam);
  const px = new Uint8Array(size * size * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, size, size, px);
  renderer.setRenderTarget(prev);
  rt.dispose();
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  // Flip rows: WebGL reads bottom-up.
  for (let y = 0; y < size; y++) img.data.set(px.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
  g.putImageData(img, 0, 0);
  const png = c.toDataURL('image/png');
  // Keep under the 20 KB limit the online board will enforce.
  return png.length * 0.75 < 20000 ? png : c.toDataURL('image/jpeg', 0.85);
}

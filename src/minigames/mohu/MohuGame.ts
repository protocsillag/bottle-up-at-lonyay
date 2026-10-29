import * as THREE from 'three';
import type { GameState, Item, ItemKind } from '../../state/GameState';
import type { Input } from '../../player/input';
import { MachineModel, MACHINE_D, OPENING_X, OPENING_Y } from './MachineModel';
import { MOHU } from '../../state/balance';
import { formatFt, clockText, dayName } from '../../state/time';

// The bottle machine close-up. Hold Space: items fly from the bag into the opening at
// 3 per second. About 1 in 8 is refused; fix it (mash E / hold E / nothing), roll it
// with A / D until the ring turns green, and push it in with Space. Release Space to
// stop; E (or S) walks away. When the bag is empty the receipt prints and the money
// goes into the total.

type Phase = 'ready' | 'flying' | 'returning' | 'fix' | 'align' | 'lost' | 'pushing' | 'printing';
type Reason = 'crushed' | 'wet' | 'hiccup' | 'nodeposit';

const REASON_TEXT: Record<Reason, { hu: string; en: string; help: string }> = {
  crushed: { hu: 'Ne nyomd össze!', en: 'Item is crushed', help: 'Mash E to pop it back into shape' },
  wet: { hu: 'Nem olvasható vonalkód', en: 'Barcode unreadable', help: 'Hold E to wipe and straighten the label' },
  hiccup: { hu: 'Próbálja újra', en: 'Try again', help: 'Machine hiccup: line it up and retry' },
  nodeposit: { hu: 'Nem visszaváltható termék', en: 'No deposit label', help: 'Lost: it goes in the bin next to the machine' },
};

const COLORS: Record<ItemKind, number> = { pet: 0x8fd0e8, can: 0xc23b32, glass: 0x3d6b2a };

function barcodeTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff'; g.fillRect(0, 0, 128, 64);
  g.fillStyle = '#111';
  let x = 8;
  while (x < 120) { const w = 1 + ((x * 7) % 4); g.fillRect(x, 6, w, 46); x += w + 1 + ((x * 3) % 3); }
  g.font = '10px monospace'; g.fillText('5 998 817 32', 22, 62);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let barcodeTex: THREE.Texture | null = null;

/** A hand-held item for the close-up: axis along local x, barcode label on the −z side. */
function heldItem(kind: ItemKind, crushed: boolean) {
  barcodeTex ??= barcodeTexture();
  const g = new THREE.Group();
  const len = kind === 'can' ? 0.12 : kind === 'pet' ? 0.24 : 0.22;
  const r = kind === 'can' ? 0.033 : 0.038;
  const mat = new THREE.MeshLambertMaterial({ color: COLORS[kind], transparent: kind === 'pet', opacity: kind === 'pet' ? 0.85 : 1 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14).rotateZ(Math.PI / 2), mat);
  if (crushed) body.scale.set(0.9, 0.55, 1.15);
  g.add(body);
  if (kind !== 'can') {
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.013, r, 0.06, 12).rotateZ(-Math.PI / 2).translate(len / 2 + 0.03, 0, 0), mat);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.02, 10).rotateZ(Math.PI / 2).translate(len / 2 + 0.07, 0, 0), new THREE.MeshLambertMaterial({ color: kind === 'pet' ? 0x2f7fd0 : 0xd6b347 }));
    g.add(neck, cap);
  }
  const label = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.002, r + 0.002, len * 0.45, 14, 1, true).rotateZ(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xe9e4d4, side: THREE.DoubleSide }));
  g.add(label);
  const code = new THREE.Mesh(new THREE.PlaneGeometry(len * 0.4, r * 1.1), new THREE.MeshBasicMaterial({ map: barcodeTex }));
  code.position.set(0, 0, -(r + 0.004));
  code.rotation.y = Math.PI;
  g.add(code);
  return g;
}

const $ = (id: string) => document.getElementById(id)!;

export interface MohuSession { machine: MachineModel; name: string; onEnd: () => void; }

export class MohuGame {
  active = false;
  private s: MohuSession | null = null;
  private phase: Phase = 'ready';
  private item: Item | null = null;
  private mesh: THREE.Group | null = null;
  private t = 0;
  private sinceLast = 99;
  private reason: Reason | null = null;
  private fixProgress = 0;
  private angle = 0;
  private count = 0;
  private ft = 0;
  private flyFrom = new THREE.Vector3();
  private flyTo = new THREE.Vector3();
  private ui = $('mohu');
  private uiTitle = $('mohu-title');
  private uiMsg = $('mohu-msg');
  private uiHelp = $('mohu-help');
  private uiFill = $('mohu-fill');
  private uiBar = $('mohu-bar');
  private uiDial = $('mohu-dial');
  private uiNeedle = $('mohu-needle');
  private receiptEl = $('receipt');
  /** Sound hooks (M9). */
  onSound: (name: 'beep' | 'reject' | 'print' | 'clunk' | 'pop' | 'wipe') => void = () => {};

  constructor(private scene: THREE.Scene, private state: GameState) {}

  start(s: MohuSession) {
    this.s = s;
    this.active = true;
    this.phase = 'ready';
    this.count = 0;
    this.ft = 0;
    this.sinceLast = 99;
    s.machine.setScreen({ kind: 'idle' });
    s.machine.setRing(0x444444);
    s.machine.receipt.visible = false;
    this.ui.classList.remove('hidden');
    this.receiptEl.classList.add('hidden');
    this.uiTitle.textContent = s.name;
  }

  /** Local point on the machine (x to the machine's left as seen from the front, y up, z out toward the player). */
  private local(x: number, y: number, out: number) {
    return this.s!.machine.root.localToWorld(new THREE.Vector3(x, y, -MACHINE_D / 2 - out));
  }

  /** Puts the camera in front of the machine. */
  camera(cam: THREE.PerspectiveCamera) {
    if (!this.s) return;
    cam.position.copy(this.local(-0.02, OPENING_Y + 0.12, 1.25));
    cam.lookAt(this.local(-0.02, OPENING_Y - 0.08, 0));
  }

  private handPos() { return this.local(-OPENING_X, OPENING_Y - 0.02, 0.33); }
  private holePos(depth = 0) { return this.local(-OPENING_X, OPENING_Y, -depth); }

  private spawnMesh(item: Item) {
    this.removeMesh();
    this.mesh = heldItem(item.kind, item.cond === 'crushed');
    this.scene.add(this.mesh);
  }
  private removeMesh() {
    if (this.mesh) this.scene.remove(this.mesh);
    this.mesh = null;
  }

  private faceMachine(roll: number) {
    if (!this.mesh || !this.s) return;
    // Held sideways in front of the opening, label rolled by `roll` (0 = facing the scanner).
    this.mesh.quaternion.copy(this.s.machine.root.getWorldQuaternion(new THREE.Quaternion()));
    this.mesh.rotateX(roll);
  }

  private pointInto() {
    if (!this.mesh || !this.s) return;
    this.mesh.quaternion.copy(this.s.machine.root.getWorldQuaternion(new THREE.Quaternion()));
    this.mesh.rotateY(Math.PI / 2);
  }

  update(dt: number, input: Input) {
    const s = this.s;
    if (!s) return;
    const st = this.state;
    this.sinceLast += dt;
    const space = input.isDown('Space');
    let help = '';
    let msg = '';
    this.uiBar.classList.add('hidden');
    this.uiDial.classList.add('hidden');

    if (!st.shopsOpen && this.phase !== 'printing') {
      st.toast('The shop just closed!', 'bad');
      this.finish();
      return;
    }

    // E walks away only between items (it is the fix key during a reject); S works any time.
    const leave = this.phase !== 'printing' && this.phase !== 'flying' && this.phase !== 'pushing' &&
      (input.wasPressed('KeyS') || (input.wasPressed('KeyE') && this.phase === 'ready'));

    switch (this.phase) {
      case 'ready': {
        msg = st.bag.length ? `${st.bag.length} items in the bag` : 'Bag empty';
        help = space ? 'Feeding…' : 'Hold SPACE to feed · E / S walk away';
        if (!st.bag.length && this.count > 0) { this.print(); break; }
        if (space && st.bag.length && this.sinceLast >= 1 / MOHU.feedRate) {
          this.sinceLast = 0;
          this.item = st.takeFromBag()!;
          this.spawnMesh(this.item);
          this.flyFrom.copy(this.local(-OPENING_X + 0.05, OPENING_Y - 0.45, 0.6));
          this.flyTo.copy(this.holePos(0.05));
          this.t = 0;
          this.phase = 'flying';
          s.machine.setScreen({ kind: 'feeding', count: this.count, ft: this.ft });
        }
        break;
      }
      case 'flying': {
        msg = `${st.bag.length} items in the bag`;
        help = 'Feeding…';
        this.t += dt / 0.26;
        const k = Math.min(1, this.t);
        const p = new THREE.Vector3().lerpVectors(this.flyFrom, this.flyTo, k);
        p.y += Math.sin(k * Math.PI) * 0.12;
        this.mesh!.position.copy(p);
        this.pointInto();
        if (k >= 1) this.arrive();
        break;
      }
      case 'returning': {
        this.t += dt / 0.25;
        const k = Math.min(1, this.t);
        this.mesh!.position.lerpVectors(this.holePos(0.05), this.handPos(), k);
        this.faceMachine(this.angle * k);
        msg = `${REASON_TEXT[this.reason!].hu}`;
        if (k >= 1) {
          this.phase = this.reason === 'nodeposit' ? 'lost' : this.reason === 'hiccup' ? 'align' : 'fix';
          this.t = 0;
        }
        break;
      }
      case 'fix': {
        const r = REASON_TEXT[this.reason!];
        msg = `${r.hu} — ${r.en}`;
        help = `${r.help} · S walk away`;
        this.uiBar.classList.remove('hidden');
        if (this.reason === 'crushed') {
          if (input.wasPressed('KeyE')) {
            this.fixProgress += 1 / MOHU.mashPresses;
            this.onSound('pop');
            this.mesh!.scale.setScalar(1 + 0.08 * Math.random());
          }
        } else if (input.isDown('KeyE')) {
          this.fixProgress += dt / MOHU.wipeHold;
          this.mesh!.position.copy(this.handPos()).add(new THREE.Vector3(Math.sin(performance.now() / 40) * 0.01, 0, 0));
        }
        this.uiFill.style.width = `${Math.min(1, this.fixProgress) * 100}%`;
        this.faceMachine(this.angle);
        if (this.fixProgress >= 1) {
          if (this.reason === 'crushed') this.spawnMeshKeep(false);
          this.onSound(this.reason === 'crushed' ? 'pop' : 'wipe');
          this.phase = 'align';
        }
        break;
      }
      case 'align': {
        const r = REASON_TEXT[this.reason!];
        if (input.isDown('KeyA')) this.angle -= dt * 2.4;
        if (input.isDown('KeyD')) this.angle += dt * 2.4;
        this.angle = Math.atan2(Math.sin(this.angle), Math.cos(this.angle));
        const ok = Math.abs(this.angle) < MOHU.alignTolerance;
        s.machine.setRing(ok ? 0x2ecc71 : 0xc0392b);
        this.faceMachine(this.angle);
        msg = this.reason === 'hiccup' ? `${r.hu} — ${r.en}` : 'Line up the barcode';
        help = ok ? 'Ring is green: press SPACE to push it in' : 'A / D to roll the item until the ring turns green · S walk away';
        this.uiDial.classList.remove('hidden');
        this.uiDial.classList.toggle('ok', ok);
        this.uiNeedle.style.transform = `rotate(${this.angle}rad)`;
        if (ok && input.wasPressed('Space')) {
          this.phase = 'pushing';
          this.t = 0;
          s.machine.setScreen({ kind: 'feeding', count: this.count, ft: this.ft });
        }
        break;
      }
      case 'pushing': {
        this.t += dt / 0.25;
        const k = Math.min(1, this.t);
        this.mesh!.position.lerpVectors(this.handPos(), this.holePos(0.05), k);
        this.pointInto();
        if (k >= 1) {
          s.machine.setRing(0x444444);
          // A retried hiccup can hiccup again ("sometimes three times in a row").
          if (this.reason === 'hiccup' && this.state.rng.chance(MOHU.hiccupAgain)) this.reject('hiccup');
          else this.accept();
        }
        break;
      }
      case 'lost': {
        const r = REASON_TEXT.nodeposit;
        msg = `${r.hu} — ${r.en}`;
        help = r.help;
        this.t += dt;
        // Into the bin beside the machine.
        if (this.t > 1.2) this.mesh!.position.lerp(this.local(-0.75, 0.9, 0.2), Math.min(1, dt * 6));
        if (this.t > 1.9) {
          this.removeMesh();
          this.item = null;
          this.onSound('clunk');
          this.phase = 'ready';
          s.machine.setScreen({ kind: 'feeding', count: this.count, ft: this.ft });
        }
        break;
      }
      case 'printing': {
        this.t += dt;
        s.machine.receipt.scale.y = Math.min(1, this.t / 1.4);
        msg = `${this.count} items · ${formatFt(this.ft)}`;
        help = 'Printing receipt…';
        if (this.t > 1.5 && this.receiptEl.classList.contains('hidden')) this.showReceipt();
        if (this.t > 4.2 || (this.t > 1.6 && (input.wasPressed('KeyE') || input.wasPressed('KeyS') || input.wasPressed('Space')))) this.end();
        break;
      }
    }

    if (leave && this.active && this.phase !== 'printing') {
      // A refused item that is not lost goes back into the bag.
      if (this.item && this.reason !== 'nodeposit' && this.phase !== 'ready') st.bag.unshift(this.item);
      this.item = null;
      this.removeMesh();
      this.finish();
      return;
    }
    this.uiMsg.textContent = msg;
    this.uiHelp.textContent = help;
  }

  private spawnMeshKeep(crushed: boolean) {
    const pos = this.mesh!.position.clone();
    this.removeMesh();
    this.mesh = heldItem(this.item!.kind, crushed);
    this.mesh.position.copy(pos);
    this.scene.add(this.mesh);
  }

  private arrive() {
    const it = this.item!;
    if (it.cond === 'crushed' || it.cond === 'wet' || it.cond === 'nodeposit') return this.reject(it.cond);
    if (this.state.rng.chance(MOHU.hiccup)) return this.reject('hiccup');
    this.accept();
  }

  private accept() {
    this.ft += this.state.acceptItem();
    this.count++;
    this.item = null;
    this.removeMesh();
    this.onSound('beep');
    this.s!.machine.setScreen({ kind: 'feeding', count: this.count, ft: this.ft });
    this.phase = 'ready';
  }

  private reject(reason: Reason) {
    this.state.stats.itemsRejected++;
    this.reason = reason;
    this.fixProgress = 0;
    // Start well off upright so there is something to line up.
    this.angle = (this.state.rng.chance(0.5) ? 1 : -1) * this.state.rng.range(0.8, 2.6);
    this.phase = 'returning';
    this.t = 0;
    this.onSound('reject');
    this.s!.machine.setScreen({ kind: 'reject', message: REASON_TEXT[reason].hu, count: this.count, ft: this.ft });
    // Once fixed, it is a fine item.
    if (reason !== 'nodeposit' && this.item) this.item = { ...this.item, cond: 'fine' };
  }

  private print() {
    this.phase = 'printing';
    this.t = 0;
    this.s!.machine.receipt.visible = true;
    this.s!.machine.receipt.scale.y = 0.001;
    this.s!.machine.setScreen({ kind: 'done', count: this.count, ft: this.ft });
    this.onSound('print');
  }

  private showReceipt() {
    const st = this.state;
    st.payout(this.ft);
    const paid = this.ft;
    this.ft = 0;
    this.receiptEl.replaceChildren(
      ...[
        ['b', 'REpont · visszaváltás'],
        ['', this.s!.name],
        ['', `${dayName(st.minute)} ${clockText(st.minute)}`],
        ['hr', ''],
        ['', `${this.count} db × 50 Ft`],
        ['b big', formatFt(paid)],
        ['hr', ''],
        ['', 'Köszönjük, hogy visszaváltott!'],
      ].map(([cls, text]) => Object.assign(document.createElement('div'), { className: cls, textContent: text })),
    );
    this.receiptEl.classList.remove('hidden');
    st.toast(`+${formatFt(paid)}`, 'good');
  }

  /** Walk away: print a receipt for anything already fed. */
  finish() {
    if (!this.s) return;
    if (this.count > 0 && this.ft > 0) {
      // Quick receipt on the way out.
      this.state.payout(this.ft);
      this.state.toast(`Receipt: ${this.count} items, +${formatFt(this.ft)}`, 'good');
      this.ft = 0;
    }
    this.end();
  }

  private end() {
    if (!this.s) return;
    if (this.ft > 0) { this.state.payout(this.ft); this.ft = 0; }
    this.removeMesh();
    this.s.machine.setRing(0x444444);
    this.s.machine.receipt.visible = false;
    this.s.machine.setScreen({ kind: 'idle' });
    const done = this.s.onEnd;
    this.s = null;
    this.active = false;
    this.ui.classList.add('hidden');
    setTimeout(() => this.receiptEl.classList.add('hidden'), 600);
    done();
  }
}

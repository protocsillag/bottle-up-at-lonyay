import { FIGHT } from '../../state/balance';
import type { CharacterLook } from '../../player/look';
import type { CharacterColors, CharacterOptions } from '../../player/CharacterModel';
import { sound } from '../../audio/Sfx';
import { ZSIGA_COLORS, ZSIGA_OPTS } from './FireBarrel';

// M13: the fire barrel fight. A one-round 2D side-view brawler on its own full-screen
// canvas, drawn entirely in code: the player (from the creator look) against Zsiga, a
// Bajnok, on the Nehru part at night. Virtual screen 1600 × 900, ground at y = 780.

export type FightResult = 'won' | 'lost' | 'draw';

/** What the fight reads from the keyboard (or, from M14, touch controls). */
export interface FightInput {
  left: boolean; right: boolean; up: boolean; down: boolean;
  /** Pressed this frame. */
  punch: boolean; kick: boolean; special: boolean; pause: boolean;
}

const W = 1600, H = 900, GROUND = 780;
type Move = 'punch' | 'kick' | 'lowKick' | 'jumpKick' | 'special';
type FState = 'idle' | 'walk' | 'jump' | 'crouch' | 'attack' | 'block' | 'hit' | 'down' | 'ko' | 'win';

interface Fighter {
  name: string;
  colors: CharacterColors;
  opts: CharacterOptions;
  isPlayer: boolean;
  x: number; y: number; vy: number; facing: 1 | -1;
  hp: number; shownHp: number;
  state: FState; t: number; anim: number;
  move: Move | null; hitDone: boolean;
  stun: number; invuln: number; down: number;
  specialCd: number; blocking: boolean; walkDir: number;
}

interface Fx { kind: 'star' | 'dust' | 'can'; x: number; y: number; vx: number; vy: number; age: number; life: number; }

const css = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const shade = (c: number, k: number) => {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * k)), g = Math.min(255, Math.round(((c >> 8) & 255) * k)), b = Math.min(255, Math.round((c & 255) * k));
  return `rgb(${r},${g},${b})`;
};
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class FightGame {
  active = false;
  paused = false;
  /** Tests run fights without drawing. */
  draw = true;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private bg: HTMLCanvasElement | null = null;
  private p!: Fighter;
  private z!: Fighter;
  private timeLeft = FIGHT.time;
  private clock = 0;
  private intro = 0;
  private outro = 0;
  private result: FightResult | null = null;
  private tipsy = 0;
  private fx: Fx[] = [];
  private onEnd: (r: FightResult) => void = () => {};
  // Zsiga's brain.
  private ai = { think: 0, attackIn: 1.2, specialIn: 9, blockUntil: 0, reactTo: null as Move | null, reactIn: 0, retreat: 0 };
  // J + K within a short window is the special.
  private pending: { key: 'punch' | 'kick'; t: number } | null = null;
  private cheer = 0;

  constructor() {
    this.canvas = document.getElementById('fight') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
  }

  start(look: CharacterLook, tipsyLevel: number, onEnd: (r: FightResult) => void) {
    this.onEnd = onEnd;
    this.tipsy = tipsyLevel;
    const mk = (name: string, colors: CharacterColors, opts: CharacterOptions, isPlayer: boolean, x: number): Fighter => ({
      name, colors, opts, isPlayer, x, y: 0, vy: 0, facing: isPlayer ? 1 : -1, hp: FIGHT.health, shownHp: FIGHT.health,
      state: 'idle', t: 0, anim: Math.random() * 3, move: null, hitDone: false, stun: 0, invuln: 0, down: 0, specialCd: 0, blocking: false, walkDir: 0,
    });
    this.p = mk(look.name, look.colors, look.opts, true, 560);
    this.z = mk('Zsiga, a Bajnok', ZSIGA_COLORS, ZSIGA_OPTS, false, 1040);
    this.timeLeft = FIGHT.time;
    this.intro = 1.6;
    this.outro = 0;
    this.result = null;
    this.fx = [];
    this.paused = false;
    this.pending = null;
    this.ai = { think: 0, attackIn: rand(1.0, 1.6), specialIn: rand(...FIGHT.zsigaSpecial.every), blockUntil: 0, reactTo: null, reactIn: 0, retreat: 0 };
    this.active = true;
    this.canvas.classList.remove('hidden');
    this.resize();
    this.bg = null;
    sound.play('cheer');
  }

  private resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth, h = window.innerHeight;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
  }

  private finish() {
    this.active = false;
    this.canvas.classList.add('hidden');
    this.onEnd(this.result ?? 'draw');
  }

  // ---------------------------------------------------------------- simulation

  update(dt: number, inp: FightInput) {
    if (!this.active) return;
    this.resize();
    if (inp.pause) this.paused = !this.paused;
    if (this.paused) { if (this.draw) this.render(); return; }
    this.clock += dt;
    const p = this.p, z = this.z;
    if (this.intro > 0) {
      this.intro -= dt;
      if (this.intro <= 0) sound.play('whoosh');
    } else if (!this.result) {
      this.timeLeft -= dt;
      this.control(p, inp, dt);
      this.brain(z, p, dt);
    }
    for (const f of [p, z]) this.physics(f, f === p ? z : p, dt);
    // Who faces whom (only while free to turn).
    for (const [f, o] of [[p, z], [z, p]] as const) {
      if (f.state === 'idle' || f.state === 'walk' || f.state === 'crouch' || f.state === 'block') f.facing = o.x >= f.x ? 1 : -1;
    }
    // Keep them apart.
    const gap = 120;
    if (Math.abs(p.x - z.x) < gap && p.y < 60 && z.y < 60) {
      const push = (gap - Math.abs(p.x - z.x)) / 2, s = p.x < z.x ? -1 : 1;
      p.x += s * push; z.x -= s * push;
    }
    for (const f of [p, z]) f.x = Math.max(FIGHT.arena[0], Math.min(FIGHT.arena[1], f.x));
    // Results: KO, double KO, time.
    if (!this.result) {
      const pk = p.hp <= 0, zk = z.hp <= 0;
      if (pk || zk) {
        this.result = pk && zk ? 'draw' : zk ? 'won' : 'lost';
        if (pk) { p.state = 'ko'; p.t = 0; }
        if (zk) { z.state = 'ko'; z.t = 0; }
        if (!pk) { p.state = 'win'; p.t = 0; }
        if (!zk) { z.state = 'win'; z.t = 0; }
        sound.play('ko');
        setTimeout(() => sound.play('cheer'), 300);
        this.outro = 3.2;
      } else if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.result = 'draw';
        this.outro = 2.6;
      }
    } else {
      this.outro -= dt;
      if (this.outro <= 0) { this.finish(); return; }
    }
    for (const f of [p, z]) f.shownHp += (f.hp - f.shownHp) * Math.min(1, dt * 3);
    // Effects.
    for (const e of this.fx) {
      e.age += dt; e.x += e.vx * dt; e.y += e.vy * dt;
      if (e.kind === 'can') e.vy += 1800 * dt;
      if (e.kind === 'dust') { e.vx *= 0.95; e.vy *= 0.95; }
    }
    this.fx = this.fx.filter((e) => e.age < e.life);
    this.cheer = Math.max(0, this.cheer - dt);
    if (this.draw) this.render();
  }

  /** For tests: the current state of both fighters. */
  get snapshot() { return { p: { x: this.p.x, hp: this.p.hp, state: this.p.state, facing: this.p.facing }, z: { x: this.z.x, hp: this.z.hp, state: this.z.state, move: this.z.move, t: this.z.t }, time: this.timeLeft, result: this.result }; }

  private control(p: Fighter, inp: FightInput, dt: number) {
    p.specialCd = Math.max(0, p.specialCd - dt);
    const busy = p.state === 'attack' || p.state === 'hit' || p.state === 'down' || p.state === 'ko' || p.stun > 0;
    // Special: J + K together (a short window), or the touch Special button.
    let doPunch = false, doKick = false, doSpecial = inp.special;
    if (inp.punch && inp.kick) doSpecial = true;
    else if (inp.punch || inp.kick) {
      const key = inp.punch ? 'punch' : 'kick';
      if (this.pending && this.pending.key !== key) { doSpecial = true; this.pending = null; }
      else this.pending = { key, t: 0.07 };
    }
    if (this.pending) {
      this.pending.t -= dt;
      if (this.pending.t <= 0) { if (this.pending.key === 'punch') doPunch = true; else doKick = true; this.pending = null; }
    }
    if (busy) { p.blocking = false; return; }
    const toward = p.facing;
    const away = (inp.left && toward === 1) || (inp.right && toward === -1);
    if (p.y > 0) {
      if (doKick || doPunch) this.attack(p, 'jumpKick');
      return;
    }
    if (doSpecial) {
      if (p.specialCd <= 0) { this.attack(p, 'special'); p.specialCd = FIGHT.special.cooldown; return; }
    }
    if (inp.down) {
      p.state = 'crouch';
      p.blocking = away;
      if (doKick) this.attack(p, 'lowKick');
      else if (doPunch) this.attack(p, 'punch');
      return;
    }
    if (doPunch) { this.attack(p, 'punch'); return; }
    if (doKick) { this.attack(p, 'kick'); return; }
    if (inp.up) { p.vy = FIGHT.jumpSpeed; p.y = 1; p.state = 'jump'; p.walkDir = inp.left ? -1 : inp.right ? 1 : 0; sound.play('whoosh', 0.5); return; }
    p.blocking = away;
    const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    p.walkDir = dir;
    p.state = dir ? (away ? 'block' : 'walk') : 'idle';
    p.x += dir * FIGHT.walk * (away ? 0.6 : 1) * dt;
  }

  /** Zsiga: walks in, mixes punches and kicks, blocks some attacks he sees coming, and
   *  throws his belly punch every 8–12 s. Reactions take 350–500 ms. */
  private brain(z: Fighter, p: Fighter, dt: number) {
    const ai = this.ai;
    ai.attackIn -= dt; ai.specialIn -= dt; ai.retreat -= dt;
    z.specialCd = 0;
    const busy = z.state === 'attack' || z.state === 'hit' || z.state === 'down' || z.state === 'ko' || z.stun > 0 || z.y > 0;
    // See the player's attack start and decide (after a reaction delay) whether to block.
    if (p.state === 'attack' && p.t < 0.05 && ai.reactTo === null) { ai.reactTo = p.move; ai.reactIn = rand(...FIGHT.ai.react); }
    if (ai.reactTo !== null) {
      ai.reactIn -= dt;
      if (ai.reactIn <= 0) {
        if (Math.random() < FIGHT.ai.block && !busy) ai.blockUntil = this.clock + 0.55;
        ai.reactTo = null;
      }
    }
    if (busy) { z.blocking = false; return; }
    const d = Math.abs(p.x - z.x);
    z.blocking = this.clock < ai.blockUntil;
    if (z.blocking) { z.state = 'block'; return; }
    if (p.state === 'down' || p.state === 'ko' || this.result) { z.state = 'idle'; return; }
    if (ai.specialIn <= 0 && d < FIGHT.zsigaSpecial.reach + 20) {
      this.attack(z, 'special');
      ai.specialIn = rand(...FIGHT.zsigaSpecial.every);
      sound.play('grunt');
      return;
    }
    if (ai.attackIn <= 0 && d < FIGHT.kick.reach - 5) {
      const move: Move = d < FIGHT.punch.reach - 10 ? (Math.random() < 0.6 ? 'punch' : 'kick') : 'kick';
      this.attack(z, move);
      ai.attackIn = rand(...FIGHT.ai.attackGap);
      if (Math.random() < 0.25) ai.retreat = 0.5;
      return;
    }
    let dir = 0;
    if (ai.retreat > 0) dir = -z.facing;
    else if (d > FIGHT.ai.range) dir = z.facing;
    else if (d < 125) dir = -z.facing * (Math.random() < 0.5 ? 1 : 0);
    z.walkDir = dir;
    z.state = dir ? 'walk' : 'idle';
    z.x += dir * FIGHT.walk * FIGHT.ai.walk * dt;
  }

  private attack(f: Fighter, move: Move) {
    f.state = 'attack'; f.move = move; f.t = 0; f.hitDone = false; f.blocking = false;
    if (move !== 'special') sound.play('whoosh', 0.6);
  }

  private moveData(f: Fighter, move: Move) {
    if (move === 'special') return f.isPlayer ? FIGHT.special : FIGHT.zsigaSpecial;
    if (move === 'jumpKick') return { startup: 0.06, active: 9, recovery: 0, reach: FIGHT.jumpKick.reach, damage: FIGHT.jumpKick.damage };
    const m = move === 'lowKick' ? FIGHT.kick : FIGHT[move];
    return f.isPlayer ? m : { ...m, startup: m.startup * FIGHT.zsigaWindup };
  }

  private physics(f: Fighter, o: Fighter, dt: number) {
    f.anim += dt;
    f.t += dt;
    f.invuln = Math.max(0, f.invuln - dt);
    if (f.stun > 0) { f.stun -= dt; if (f.stun <= 0 && f.state === 'hit') f.state = 'idle'; }
    if (f.state === 'down') {
      f.down -= dt;
      if (f.down <= 0) { f.state = 'idle'; f.invuln = FIGHT.getUpInvuln; }
    }
    // Air.
    if (f.y > 0 || f.vy > 0) {
      f.vy -= FIGHT.gravity * dt;
      f.y += f.vy * dt;
      f.x += f.walkDir * FIGHT.walk * dt;
      if (f.y <= 0) {
        f.y = 0; f.vy = 0;
        if (f.state === 'jump' || (f.state === 'attack' && f.move === 'jumpKick')) { f.state = 'idle'; f.move = null; }
        this.dust(f.x, 3);
      }
    }
    if (f.state !== 'attack' || !f.move) return;
    const m = this.moveData(f, f.move);
    const end = m.startup + m.active + m.recovery;
    const activeNow = f.t >= m.startup && f.t < m.startup + m.active;
    if (f.move === 'special' && f.t >= m.startup && f.t - dt < m.startup) sound.play('whoosh');
    if (activeNow && !f.hitDone) {
      const d = (o.x - f.x) * f.facing;
      const reachOk = d > 0 && d < m.reach;
      const heightOk = f.move !== 'punch' || o.state !== 'crouch'; // punches go over a crouch
      if (reachOk && heightOk && o.invuln <= 0 && o.state !== 'down' && o.state !== 'ko') {
        f.hitDone = true;
        this.land(f, o, f.move, m.damage);
      }
    }
    if (f.move !== 'jumpKick' && f.t >= end) { f.state = 'idle'; f.move = null; }
  }

  private land(a: Fighter, d: Fighter, move: Move, damage: number) {
    const hx = d.x - d.facing * 30, hy = GROUND - d.y - (move === 'lowKick' ? 60 : move === 'special' && !a.isPlayer ? 150 : 250);
    const blocked = d.blocking && (d.state === 'block' || d.state === 'crouch' || d.state === 'idle' || d.state === 'walk') && move !== 'special';
    if (blocked) {
      d.hp -= FIGHT.blockedDamage;
      d.stun = FIGHT.blockStun;
      d.x += a.facing * FIGHT.blockKnockback;
      sound.play('block');
      this.star(hx, hy, 1);
      return;
    }
    let dmg = damage;
    if (a.isPlayer && move === 'punch') dmg += this.tipsy * FIGHT.tipsyPunch;
    d.hp -= dmg;
    sound.play('hit');
    if (Math.random() < 0.5) sound.play('grunt', 0.7);
    this.star(hx, hy, move === 'special' ? 3 : 2);
    if (move === 'special') {
      d.state = 'down'; d.down = FIGHT.knockdown; d.t = 0; d.y = 0; d.vy = 0;
      d.x += a.facing * FIGHT.knockback * 2;
      this.dust(d.x, 8);
      this.cans(3);
      this.cheer = 1;
      sound.play('cheer');
    } else {
      d.state = 'hit'; d.stun = FIGHT.hitStun; d.t = 0; d.move = null;
      d.x += a.facing * FIGHT.knockback;
      if (move === 'jumpKick' || move === 'kick') this.cans(1);
    }
  }

  private star(x: number, y: number, n: number) {
    for (let i = 0; i < n * 3; i++) this.fx.push({ kind: 'star', x, y, vx: rand(-260, 260), vy: rand(-260, 120), age: 0, life: 0.35 });
  }
  private dust(x: number, n: number) {
    for (let i = 0; i < n; i++) this.fx.push({ kind: 'dust', x: x + rand(-50, 50), y: GROUND - 6, vx: rand(-90, 90), vy: rand(-60, -10), age: 0, life: 0.7 });
  }
  /** The crowd throws cans in delight. */
  private cans(n: number) {
    for (let i = 0; i < n; i++) this.fx.push({ kind: 'can', x: rand(200, 1400), y: 560, vx: rand(-160, 160), vy: rand(-700, -450), age: 0, life: 1.2 });
  }

  // ---------------------------------------------------------------- drawing

  private render() {
    const c = this.ctx, cw = this.canvas.width, ch = this.canvas.height;
    const s = Math.max(cw / W, ch / H); // cover: crop the edges rather than letterbox
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#0b1020';
    c.fillRect(0, 0, cw, ch);
    const sway = this.tipsy ? Math.sin(this.clock * 0.9) * 6 * this.tipsy : 0;
    c.setTransform(s, 0, 0, s, (cw - W * s) / 2, (ch - H * s) / 2);
    // Painted background, drawn once.
    if (!this.bg) this.bg = this.paintBackground();
    c.save();
    c.translate(sway, 0);
    c.rotate(sway * 0.0006);
    c.drawImage(this.bg, -40, -20, W + 80, H + 40);
    this.drawBarrel(c, 220, GROUND - 40);
    this.drawCrowd(c);
    c.restore();
    // Fighters: the player sways a little when tipsy.
    for (const f of [this.z, this.p].sort((a, b) => (a.state === 'attack' ? 1 : 0) - (b.state === 'attack' ? 1 : 0))) {
      c.save();
      if (f.isPlayer && this.tipsy) c.translate(Math.sin(this.clock * 1.3) * 4 * this.tipsy, 0);
      this.drawFighter(c, f);
      c.restore();
    }
    for (const e of this.fx) this.drawFx(c, e);
    this.drawHud(c);
  }

  private paintBackground() {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d')!;
    const sky = g.createLinearGradient(0, 0, 0, 560);
    sky.addColorStop(0, '#0a1230'); sky.addColorStop(1, '#2a2a50');
    g.fillStyle = sky; g.fillRect(0, 0, W, 560);
    for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(255,255,240,${0.3 + Math.random() * 0.6})`; g.fillRect(Math.random() * W, Math.random() * 300, 2, 2); }
    // Buda hills with the citadel and a few lit windows.
    g.fillStyle = '#141a30';
    g.beginPath(); g.moveTo(0, 470); g.bezierCurveTo(300, 330, 520, 360, 760, 420); g.bezierCurveTo(1000, 470, 1300, 380, W, 440); g.lineTo(W, 560); g.lineTo(0, 560); g.fill();
    g.fillStyle = '#1e2442'; g.fillRect(420, 355, 120, 20);
    for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(255,210,140,0.7)'; g.fillRect(Math.random() * W, 440 + Math.random() * 90, 3, 3); }
    // The river with reflections.
    const river = g.createLinearGradient(0, 520, 0, 640);
    river.addColorStop(0, '#16284a'); river.addColorStop(1, '#0e1a30');
    g.fillStyle = river; g.fillRect(0, 520, W, 120);
    for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(${200 + Math.random() * 55},${160 + Math.random() * 60},90,0.35)`; g.fillRect(Math.random() * W, 530 + Math.random() * 100, 20 + Math.random() * 40, 2); }
    // Szabadság híd: green steel, lit.
    g.strokeStyle = '#3f8a5a'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(900, 512); g.lineTo(W, 512); g.stroke();
    for (const tx of [1060, 1400]) {
      g.lineWidth = 10; g.beginPath(); g.moveTo(tx, 512); g.lineTo(tx, 380); g.stroke();
      g.lineWidth = 4; g.beginPath(); g.moveTo(tx - 30, 400); g.lineTo(tx + 30, 400); g.stroke();
      g.fillStyle = '#4f9a6a'; g.beginPath(); g.arc(tx, 372, 10, 0, Math.PI * 2); g.fill();
    }
    g.lineWidth = 4;
    g.beginPath(); g.moveTo(900, 470); g.quadraticCurveTo(1060, 380, 1230, 470); g.quadraticCurveTo(1400, 380, W, 470); g.stroke();
    for (let x = 920; x < W; x += 40) { g.beginPath(); g.moveTo(x, 512); g.lineTo(x, 470 + Math.abs(Math.sin((x - 900) / 170 * Math.PI)) * -60 + 60); g.stroke(); }
    for (let x = 910; x < W; x += 36) { g.fillStyle = 'rgba(255,220,150,0.9)'; g.fillRect(x, 506, 4, 4); }
    // Railing, then the lawn, plane trees.
    g.fillStyle = '#1a1a1a'; g.fillRect(0, 636, W, 6);
    for (let x = 0; x < W; x += 48) g.fillRect(x, 610, 5, 30);
    g.fillRect(0, 608, W, 4);
    const lawn = g.createLinearGradient(0, 640, 0, H);
    lawn.addColorStop(0, '#1e3a24'); lawn.addColorStop(1, '#14281a');
    g.fillStyle = lawn; g.fillRect(0, 640, W, H - 640);
    for (const [x, h] of [[120, 300], [470, 260], [1220, 320], [1520, 280]]) {
      g.fillStyle = '#4a4438'; g.fillRect(x - 10, 640 - h * 0.45, 20, h * 0.45 + 10);
      g.fillStyle = '#1c3020';
      for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(x + rand(-60, 60), 640 - h * 0.45 - rand(30, h * 0.5), rand(55, 85), 0, Math.PI * 2); g.fill(); }
    }
    // Trampled grass where they fight.
    g.fillStyle = 'rgba(70,60,40,0.35)';
    g.beginPath(); g.ellipse(W / 2, GROUND + 10, 620, 40, 0, 0, Math.PI * 2); g.fill();
    return cv;
  }

  private drawBarrel(c: CanvasRenderingContext2D, x: number, y: number) {
    c.fillStyle = '#6a3a22'; c.fillRect(x - 40, y - 90, 80, 100);
    c.fillStyle = '#4a2416'; for (const yy of [y - 88, y - 45, y]) c.fillRect(x - 42, yy, 84, 6);
    // Flames.
    for (let i = 0; i < 6; i++) {
      const k = Math.sin(this.clock * (7 + i) + i * 2) * 0.5 + 0.5;
      const fx = x - 30 + i * 12, fh = 50 + k * 60;
      const gr = c.createLinearGradient(0, y - 90 - fh, 0, y - 90);
      gr.addColorStop(0, 'rgba(255,90,20,0)'); gr.addColorStop(0.4, 'rgba(255,160,40,0.85)'); gr.addColorStop(1, 'rgba(255,240,180,0.95)');
      c.fillStyle = gr;
      c.beginPath(); c.moveTo(fx - 12, y - 88); c.quadraticCurveTo(fx, y - 90 - fh, fx + 12, y - 88); c.fill();
    }
    const glow = c.createRadialGradient(x, y - 110, 10, x, y - 110, 260);
    glow.addColorStop(0, 'rgba(255,140,50,0.35)'); glow.addColorStop(1, 'rgba(255,140,50,0)');
    c.fillStyle = glow; c.fillRect(x - 260, y - 370, 520, 520);
  }

  /** The other three at the back, swaying and cheering. */
  private drawCrowd(c: CanvasRenderingContext2D) {
    const mates: [number, string, string][] = [[330, '#6a4a3a', '#6a3a2a'], [1270, '#8a2f2f', '#2f4a6a'], [1420, '#4a5a6a', '#4a4a40']];
    mates.forEach(([x, top, hat], i) => {
      const t = this.clock * (this.cheer > 0 ? 6 : 1.4) + i * 2;
      const sway = Math.sin(t) * (this.cheer > 0 ? 10 : 5);
      const arms = this.cheer > 0 || Math.sin(this.clock * 0.7 + i) > 0.85;
      const by = 690;
      c.save(); c.translate(x + sway, by);
      c.fillStyle = '#2a2a30'; c.fillRect(-14, -60, 12, 60); c.fillRect(4, -60, 12, 60);
      c.fillStyle = top; c.fillRect(-24, -140, 50, 84);
      c.strokeStyle = top; c.lineWidth = 12; c.lineCap = 'round';
      c.beginPath();
      if (arms) { c.moveTo(-20, -130); c.lineTo(-40, -190 + Math.sin(t * 2) * 10); c.moveTo(22, -130); c.lineTo(42, -190 + Math.cos(t * 2) * 10); }
      else { c.moveTo(-20, -130); c.lineTo(-30, -80); c.moveTo(22, -130); c.lineTo(30, -80); }
      c.stroke();
      c.fillStyle = '#d8a882'; c.beginPath(); c.arc(1, -160, 20, 0, Math.PI * 2); c.fill();
      c.fillStyle = hat; c.beginPath(); c.arc(1, -166, 21, Math.PI, 0); c.fill();
      c.restore();
    });
  }

  private drawFx(c: CanvasRenderingContext2D, e: Fx) {
    const k = 1 - e.age / e.life;
    if (e.kind === 'star') {
      c.fillStyle = `rgba(255,240,120,${k})`;
      c.save(); c.translate(e.x, e.y); c.rotate(e.age * 8);
      c.beginPath();
      for (let i = 0; i < 10; i++) { const r = i % 2 ? 6 : 16; const a = (i / 10) * Math.PI * 2; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      c.fill(); c.restore();
    } else if (e.kind === 'dust') {
      c.fillStyle = `rgba(160,150,130,${0.5 * k})`;
      c.beginPath(); c.arc(e.x, e.y, 14 + (1 - k) * 22, 0, Math.PI * 2); c.fill();
    } else {
      c.save(); c.translate(e.x, e.y); c.rotate(e.age * 10);
      c.fillStyle = '#c8c8d0'; c.fillRect(-7, -12, 14, 24);
      c.fillStyle = '#c8202c'; c.fillRect(-7, -4, 14, 8);
      c.restore();
    }
  }

  private drawHud(c: CanvasRenderingContext2D) {
    const bar = (x: number, f: Fighter, right: boolean) => {
      const w = 560, h = 30, y = 50;
      c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(x - 4, y - 4, w + 8, h + 8);
      const frac = Math.max(0, f.hp) / FIGHT.health, shown = Math.max(0, f.shownHp) / FIGHT.health;
      c.fillStyle = '#c8202c';
      c.fillRect(right ? x + w * (1 - shown) : x, y, w * shown, h);
      c.fillStyle = frac > 0.3 ? '#ffd23a' : '#ff7a2a';
      c.fillRect(right ? x + w * (1 - frac) : x, y, w * frac, h);
      c.fillStyle = '#fff'; c.font = 'bold 28px system-ui, sans-serif'; c.textAlign = right ? 'right' : 'left'; c.textBaseline = 'top';
      c.fillText(f.name, right ? x + w : x, y + h + 10);
    };
    bar(90, this.p, false);
    bar(W - 90 - 560, this.z, true);
    // Timer.
    const t = Math.ceil(this.timeLeft);
    c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(W / 2 - 80, 30, 160, 76);
    c.fillStyle = t <= 10 ? '#ff5a4a' : '#fff'; c.font = '900 56px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, W / 2, 70);
    // The bag swing's cooldown under the player's bar.
    const cd = this.p.specialCd;
    c.font = 'bold 22px system-ui, sans-serif'; c.textAlign = 'left'; c.textBaseline = 'top';
    c.fillStyle = cd > 0 ? 'rgba(255,255,255,0.5)' : '#ffd23a';
    c.fillText(cd > 0 ? `Zsákos csapás ${Math.ceil(cd)} s` : `Zsákos csapás ready (${document.body.classList.contains('touch') ? 'Special' : 'J + K'})`, 90, 130);
    // Banners.
    const banner = (text: string, color: string, sub?: string) => {
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(0, 330, W, 200);
      c.font = '900 150px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 12; c.strokeStyle = '#111'; c.strokeText(text, W / 2, 420);
      c.fillStyle = color; c.fillText(text, W / 2, 420);
      if (sub) { c.font = 'bold 34px system-ui, sans-serif'; c.fillStyle = '#fff'; c.fillText(sub, W / 2, 505); }
    };
    if (this.intro > 0 && this.intro < 1.2) banner('HARC!', '#ffd23a', 'FIGHT!');
    else if (this.intro > 0) { c.fillStyle = '#fff'; c.font = 'bold 40px system-ui, sans-serif'; c.textAlign = 'center'; c.fillText('Egy menet. — One round.', W / 2, 420); }
    if (this.result) {
      if (this.result === 'draw') banner('DÖNTETLEN', '#9ad8ff', this.timeLeft <= 0 ? 'Time! A draw.' : 'Double K.O.! A draw.');
      else banner('K.O.', this.result === 'won' ? '#ffd23a' : '#ff5a4a', this.result === 'won' ? 'You beat Zsiga!' : 'Zsiga wins.');
    }
    // Controls hint, and the pause screen.
    c.font = '20px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'bottom'; c.fillStyle = 'rgba(255,255,255,0.6)';
    if (!document.body.classList.contains('touch')) c.fillText('A / D move · W jump · S crouch · J punch · K kick · J + K bag swing · hold away to block · Esc pause', W / 2, H - 16);
    if (this.paused) {
      c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#fff'; c.font = '900 90px system-ui, sans-serif'; c.textBaseline = 'middle'; c.fillText('Szünet', W / 2, H / 2 - 30);
      c.font = '30px system-ui, sans-serif'; c.fillText(document.body.classList.contains('touch') ? 'Paused — tap ❚❚ to carry on' : 'Paused — Esc to carry on', W / 2, H / 2 + 50);
    }
  }

  // ---------------------------------------------------------------- the fighters

  /** Limb angles in radians: 0 points straight down, positive swings forward (toward the
   *  opponent), π points up. [upper, lower] where lower is relative to upper. */
  private pose(f: Fighter) {
    const t = f.anim;
    const p = { lean: 0, crouch: 0, armF: [0.5, 2.0], armB: [0.35, 2.2], legF: [0.18, 0], legB: [-0.15, 0], head: 0, lie: 0, bag: false, tell: false };
    const breathe = Math.sin(t * 2.2) * 0.05;
    p.armF[0] += breathe; p.armB[0] += breathe;
    const m = f.move ? this.moveData(f, f.move) : null;
    const phase = m ? (f.t < m.startup ? 0 : f.t < m.startup + m.active ? 1 : 2) : 0;
    switch (f.state) {
      case 'walk': {
        const s = Math.sin(t * 9) * 0.45;
        p.legF = [0.1 + s, -Math.max(0, -s) * 0.8]; p.legB = [-0.1 - s, -Math.max(0, s) * 0.8];
        break;
      }
      case 'jump': p.legF = [0.9, -1.6]; p.legB = [0.4, -1.4]; p.armF = [1.2, 1.4]; break;
      case 'crouch': p.crouch = 90; p.legF = [1.2, -2.0]; p.legB = [0.6, -1.9]; break;
      case 'block': p.armF = [0.9, 2.1]; p.armB = [0.8, 2.2]; p.lean = -0.08; break;
      case 'hit': p.lean = -0.25; p.head = -0.3; p.armF = [-0.4, 0.6]; p.armB = [-0.5, 0.6]; break;
      case 'down': case 'ko': p.lie = 1; break;
      case 'win': p.armF = [3.0, 0.1]; p.armB = [2.8, 0.2]; break;
      case 'attack':
        if (f.move === 'punch') p.armF = phase === 0 ? [0.7, 2.2] : phase === 1 ? [1.55, 0.05] : [1.1, 1.0];
        else if (f.move === 'kick') { p.legF = phase === 0 ? [0.9, -1.4] : phase === 1 ? [1.5, 0] : [0.8, -0.8]; p.lean = -0.18; }
        else if (f.move === 'lowKick') { p.crouch = 70; p.legB = [0.6, -1.9]; p.legF = phase === 1 ? [1.3, 0] : [0.8, -1.2]; }
        else if (f.move === 'jumpKick') { p.legF = [1.1, 0]; p.legB = [0.3, -1.6]; p.lean = -0.15; }
        else if (f.move === 'special') {
          if (f.isPlayer) {
            // Zsákos csapás: the bag goes up behind the head, then swings over and down.
            p.bag = true;
            p.armB = phase === 0 ? [-2.7, 0.2] : phase === 1 ? [1.5, 0.1] : [1.0, 0.3];
            p.lean = phase === 0 ? -0.18 : 0.15;
          } else {
            // Gyomros: the arm pulled right back (the tell), then a low drive to the belly.
            p.tell = phase === 0;
            p.armF = phase === 0 ? [-0.9, 1.6] : [1.15, 0.1];
            p.lean = phase === 0 ? -0.15 : 0.22;
          }
        }
        break;
    }
    return p;
  }

  private drawFighter(c: CanvasRenderingContext2D, f: Fighter) {
    const o = f.opts, col = f.colors;
    const big = o.width ?? 1;
    const sc = (o.scale ?? 1) * 1.0;
    const p = this.pose(f);
    const baseY = GROUND - f.y;
    c.save();
    c.translate(f.x, baseY);
    c.scale(f.facing * sc, sc);
    // Shadow.
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.beginPath(); c.ellipse(0, -2 + f.y / sc, 70 * big, 12, 0, 0, Math.PI * 2); c.fill();
    c.save();
    if (p.lie) {
      // Flat on the back, head away from the opponent; KO gets stars and a bird.
      c.rotate(-Math.PI / 2 * Math.min(1, f.t * 4));
      c.translate(-30, 0);
    }
    const legLen = [82, 78], armLen = [60, 56], torso = 122;
    const hipY = -legLen[0] - legLen[1] + p.crouch * 0.6 + 10;
    const lim = (x: number, y: number, a: number, b: number, l1: number, l2: number, w: number, colA: string, colB: string, end?: (x: number, y: number, ang: number) => void) => {
      const kx = x + Math.sin(a) * l1, ky = y + Math.cos(a) * l1;
      const ex = kx + Math.sin(a + b) * l2, ey = ky + Math.cos(a + b) * l2;
      c.lineCap = 'round';
      c.strokeStyle = colA; c.lineWidth = w; c.beginPath(); c.moveTo(x, y); c.lineTo(kx, ky); c.stroke();
      c.strokeStyle = colB; c.lineWidth = w * 0.9; c.beginPath(); c.moveTo(kx, ky); c.lineTo(ex, ey); c.stroke();
      end?.(ex, ey, a + b);
    };
    const bottoms = css(col.bottoms), shin = o.bottomsStyle === 'shorts' ? css(col.skin) : bottoms;
    const shoe = (x: number, y: number, ang: number) => {
      c.save(); c.translate(x, y); c.rotate(-ang);
      c.fillStyle = o.shoesStyle === 'sandals' ? '#f0f0f0' : css(col.shoes);
      c.fillRect(-10, -6, 38, 16); c.restore();
    };
    c.save();
    c.translate(0, 0);
    c.rotate(p.lean);
    // Back leg and arm first, darker.
    lim(-8, hipY, p.legB[0], p.legB[1], legLen[0], legLen[1], 34, shade(col.bottoms, 0.75), o.bottomsStyle === 'shorts' ? shade(col.skin, 0.85) : shade(col.bottoms, 0.75), shoe);
    const shoulderY = hipY - torso + 18;
    const topCol = css(col.top);
    const sleeve = o.top === 'tee' ? css(col.skin) : shade(col.top, 0.8);
    const hand = (dark: boolean) => (x: number, y: number) => {
      c.fillStyle = f.isPlayer ? css(col.skin) : dark ? '#2a2a26' : '#2a2a26';
      c.beginPath(); c.arc(x, y, 13, 0, Math.PI * 2); c.fill();
      if (!f.isPlayer) { c.fillStyle = css(col.skin); c.fillRect(x - 4, y - 14, 10, 8); } // fingerless gloves
    };
    lim(-10, shoulderY, p.armB[0], p.armB[1], armLen[0], armLen[1], 26, shade(col.top, 0.75), sleeve, (x, y) => {
      hand(true)(x, y);
      if (p.bag) { c.fillStyle = '#2457c5'; c.save(); c.translate(x, y); c.rotate(f.t * 6); c.fillRect(-26, -10, 52, 64); c.fillStyle = '#9ad8ff'; c.fillRect(-26, -10, 52, 8); c.restore(); }
    });
    // Torso.
    const tw = 82 * big;
    const tLen = o.top === 'coat' ? torso + 70 : o.top === 'parka' ? torso + 20 : torso;
    c.fillStyle = topCol;
    c.beginPath(); (c as CanvasRenderingContext2D & { roundRect: (x: number, y: number, w: number, h: number, r: number) => void }).roundRect(-tw / 2, shoulderY - 18, tw, tLen, 16); c.fill();
    if (o.top === 'leather') { c.fillStyle = '#d8d8d8'; for (let i = 0; i < 6; i++) c.fillRect(-tw / 2 + 8 + i * 12, shoulderY, 4, 4); }
    if (o.top === 'tee') { c.fillStyle = '#f4f4f0'; c.font = 'bold 16px system-ui'; c.textAlign = 'center'; c.fillText('ZÚZMARA', 0, shoulderY + 40); }
    if (o.top === 'parka' || o.top === 'hoodie') { c.fillStyle = shade(col.top, 0.8); c.beginPath(); c.arc(-tw * 0.2, shoulderY - 12, 26, Math.PI * 0.5, Math.PI * 1.6); c.fill(); }
    if (o.accessory === 'chain') { c.strokeStyle = '#e8c040'; c.lineWidth = 4; c.beginPath(); c.arc(8, shoulderY - 6, 20, 0.2, Math.PI - 0.2); c.stroke(); }
    if (o.accessory === 'backpack') { c.fillStyle = '#3a4a2a'; c.fillRect(-tw / 2 - 22, shoulderY + 5, 26, 70); }
    if (o.bottomsStyle === 'tracksuit') { c.fillStyle = '#f0f0f0'; c.fillRect(-4, hipY, 4, 40); }
    // Front leg.
    lim(8, hipY, p.legF[0], p.legF[1], legLen[0], legLen[1], 36, bottoms, shin, shoe);
    if (o.bottomsStyle === 'ripped') { c.fillStyle = css(col.skin); c.fillRect(14, hipY + 50, 12, 8); }
    // Head.
    const hx = 6, hy = shoulderY - 48;
    c.save(); c.translate(hx, hy); c.rotate(p.head);
    c.fillStyle = css(col.skin); c.beginPath(); c.arc(0, 0, 32, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#222'; c.fillRect(14, -8, 6, 6); // eye
    if (!f.isPlayer) { c.strokeStyle = '#a83a2a'; c.lineWidth = 3; c.beginPath(); c.moveTo(26, -4); c.lineTo(34, 8); c.stroke(); } // the scarred nose
    c.fillStyle = shade(col.skin, 0.9); c.beginPath(); c.arc(30, 4, 7, 0, Math.PI * 2); c.fill();
    if (o.face === 'beard') { c.fillStyle = css(col.hair); c.beginPath(); c.arc(8, 14, 26, 0.1, Math.PI - 0.6); c.fill(); }
    else if (o.face === 'moustache') { c.fillStyle = css(col.hair); c.fillRect(18, 12, 18, 6); }
    else if (o.face === 'stubble') { c.fillStyle = 'rgba(40,30,25,0.35)'; c.beginPath(); c.arc(8, 12, 26, 0.1, Math.PI - 0.5); c.fill(); }
    if (o.accessory === 'sunglasses') { c.fillStyle = '#111'; c.fillRect(6, -12, 28, 10); }
    if (o.accessory === 'earring') { c.fillStyle = '#e8c040'; c.beginPath(); c.arc(-4, 14, 4, 0, Math.PI * 2); c.fill(); }
    // Hair and hat.
    const hair = css(col.hair), hat = css(col.hat);
    if (o.hairStyle === 'long') { c.fillStyle = hair; c.fillRect(-34, -10, 22, 56); }
    if (o.hairStyle === 'mohawk' && (o.hat ?? 'none') === 'none') { c.fillStyle = hair; c.fillRect(-10, -58, 18, 30); }
    else if (o.hairStyle !== 'bald') { c.fillStyle = hair; c.beginPath(); c.arc(-4, -6, 32, Math.PI * 1.05, Math.PI * 1.95); c.fill(); }
    if (o.hat === 'beanie') { c.fillStyle = hat; c.beginPath(); c.arc(0, -10, 33, Math.PI, 0); c.fill(); c.fillRect(-34, -14, 68, 10); }
    else if (o.hat === 'flatcap') { c.fillStyle = hat; c.beginPath(); c.ellipse(4, -20, 36, 14, 0, Math.PI, 0); c.fill(); c.fillRect(10, -22, 34, 8); }
    else if (o.hat === 'bucket') { c.fillStyle = hat; c.fillRect(-26, -40, 52, 26); c.fillRect(-40, -18, 80, 8); }
    else if (o.hat === 'cap') { c.fillStyle = hat; c.beginPath(); c.arc(0, -12, 32, Math.PI, 0); c.fill(); c.fillRect(14, -16, 36, 8); }
    if (p.tell) { c.fillStyle = '#ffd23a'; c.font = '900 50px system-ui'; c.textAlign = 'center'; c.fillText('!', 0, -60); }
    c.restore();
    // Front arm last.
    lim(10, shoulderY, p.armF[0], p.armF[1], armLen[0], armLen[1], 28, topCol, sleeve, hand(false));
    c.restore();
    c.restore(); // the lying-down rotation
    // KO: stars and a little bird circling the head (which is on the ground behind).
    if (f.state === 'ko') {
      for (let i = 0; i < 4; i++) {
        const a = this.clock * 3 + (i / 4) * Math.PI * 2;
        const x = -330 + Math.cos(a) * 50, y = -80 + Math.sin(a) * 14;
        if (i === 0) { c.fillStyle = '#ffd23a'; c.beginPath(); c.arc(x, y, 9, 0, Math.PI * 2); c.fill(); c.fillStyle = '#e8822a'; c.fillRect(x + 6, y - 2, 8, 4); }
        else { c.fillStyle = '#fff6a0'; c.font = '900 26px system-ui'; c.textAlign = 'center'; c.fillText('★', x, y + 9); }
      }
    }
    c.restore();
  }
}

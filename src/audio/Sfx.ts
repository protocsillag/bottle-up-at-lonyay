import type { Line, Speaker } from './lines';

// All sound: effects synthesised with WebAudio, a quiet city ambience, and voice lines.
// Voices play public/audio/voice/<id>.mp3 when the manifest lists them (generated
// offline with Piper, see tools/voice/), through a crackly intercom filter for intercom
// lines; otherwise the browser's hu-HU speech voice; otherwise subtitles only.

export type SfxName =
  | 'beep' | 'reject' | 'print' | 'clunk' | 'pop' | 'wipe' | 'pickup' | 'glass' | 'slam' | 'creak'
  | 'buzz' | 'crackle' | 'squelch' | 'bell' | 'ching' | 'step' | 'click' | 'search' | 'bag' | 'shout'
  | 'tick' | 'honk' | 'thud' | 'stream' | 'kick' | 'till' | 'gulp' | 'munch'
  | 'whoosh' | 'hit' | 'block' | 'grunt' | 'cheer' | 'ko' | 'fire';

export type VoiceMode = 'auto' | 'speech' | 'off';

export class Sound {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private voiceGain!: GainNode;
  private amb!: GainNode;
  private noise!: AudioBuffer;
  private manifest: Set<string> | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private huVoice: SpeechSynthesisVoice | null = null;
  volumes = { master: 0.8, sfx: 0.8, voice: 0.9 };
  voiceMode: VoiceMode = 'auto';
  private nextBird = 0;

  /** Must be called from a user gesture. */
  init() {
    if (this.ctx) { void this.ctx.resume(); return; }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.voiceGain = ctx.createGain();
    this.voiceGain.connect(this.master);
    this.amb = ctx.createGain();
    this.amb.gain.value = 0;
    this.amb.connect(this.sfx);
    // Two seconds of white noise for everything noisy.
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // City hum: brown-ish noise through a low-pass, looping forever.
    const brown = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const b = brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < b.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
    const src = ctx.createBufferSource();
    src.buffer = brown;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    src.connect(lp).connect(this.amb);
    src.start();
    this.applyVolumes();
    void fetch(`${import.meta.env.BASE_URL}audio/voice/manifest.json`).then((r) => (r.ok ? r.json() : [])).then((ids: string[]) => {
      this.manifest = new Set(Array.isArray(ids) ? ids : []);
    }).catch(() => { this.manifest = new Set(); });
    const pickVoice = () => { this.huVoice = speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith('hu')) ?? null; };
    if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.volumes.master;
    this.sfx.gain.value = this.volumes.sfx;
    this.voiceGain.gain.value = this.volumes.voice;
  }

  /** Ambience level follows the time of day and whether you are outside. */
  ambience(night: number, outside: boolean, dt: number) {
    if (!this.ctx) return;
    const want = outside ? 0.05 - night * 0.03 : 0.015;
    this.amb.gain.value += (want - this.amb.gain.value) * Math.min(1, dt * 2);
    // Birds by day, outside.
    this.nextBird -= dt;
    if (outside && night < 0.3 && this.nextBird <= 0) {
      this.nextBird = 4 + Math.random() * 9;
      this.bird();
    }
  }

  private env(g: GainNode, t: number, a: number, peak: number, d: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private tone(type: OscillatorType, f0: number, f1: number, t: number, dur: number, peak: number, out: AudioNode = this.sfx) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    this.env(g, t, 0.005, peak, dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private hiss(t: number, dur: number, peak: number, type: BiquadFilterType, freq: number, q = 1, freqEnd?: number) {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    this.env(g, t, 0.005, peak, dur);
    s.connect(f).connect(g).connect(this.sfx);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }

  private bird() {
    const t = this.ctx!.currentTime;
    const base = 2500 + Math.random() * 1500;
    for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) this.tone('sine', base, base * 1.3, t + i * 0.12, 0.08, 0.02);
  }

  play(name: SfxName, volume = 1) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const v = volume;
    switch (name) {
      case 'beep': this.tone('sine', 1760, 1760, t, 0.07, 0.18 * v); this.tone('sine', 2640, 2640, t + 0.05, 0.05, 0.1 * v); break;
      case 'reject': this.tone('square', 220, 200, t, 0.14, 0.08 * v); this.tone('square', 180, 170, t + 0.17, 0.2, 0.08 * v); break;
      case 'print': for (let i = 0; i < 22; i++) this.hiss(t + i * 0.055, 0.035, 0.08 * v, 'bandpass', 2400, 3); break;
      case 'clunk': this.tone('sine', 140, 55, t, 0.18, 0.4 * v); this.hiss(t, 0.08, 0.1 * v, 'lowpass', 800); break;
      case 'pop': this.tone('sine', 320, 900, t, 0.05, 0.2 * v); break;
      case 'wipe': this.hiss(t, 0.35, 0.08 * v, 'bandpass', 1200, 2, 3000); break;
      case 'pickup': {
        const f = 2200 + Math.random() * 900;
        this.tone('triangle', f, f, t, 0.12, 0.09 * v);
        this.tone('triangle', f * 1.5, f * 1.5, t + 0.06, 0.1, 0.06 * v);
        this.hiss(t, 0.06, 0.05 * v, 'highpass', 3000);
        break;
      }
      case 'bag': this.hiss(t, 0.25, 0.08 * v, 'bandpass', 900, 0.8, 2500); break;
      case 'search': this.hiss(t, 0.18, 0.06 * v, 'bandpass', 600 + Math.random() * 600, 1.5); this.tone('triangle', 1800 + Math.random() * 800, 1800, t + 0.05, 0.05, 0.03 * v); break;
      case 'glass': {
        this.hiss(t, 0.3, 0.22 * v, 'highpass', 2500);
        for (let i = 0; i < 6; i++) { const f = 3000 + Math.random() * 3000; this.tone('sine', f, f * 0.98, t + Math.random() * 0.15, 0.12, 0.05 * v); }
        break;
      }
      case 'slam': this.tone('sine', 90, 40, t, 0.35, 0.6 * v); this.hiss(t, 0.15, 0.25 * v, 'lowpass', 600); this.tone('square', 600, 600, t + 0.02, 0.03, 0.05 * v); break;
      case 'creak': {
        const ctx = this.ctx;
        const o = ctx.createOscillator();
        const lfo = ctx.createOscillator();
        const lg = ctx.createGain();
        const f = ctx.createBiquadFilter();
        const g = ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(170, t);
        o.frequency.linearRampToValueAtTime(110, t + 0.7);
        lfo.frequency.value = 24;
        lg.gain.value = 18;
        lfo.connect(lg).connect(o.frequency);
        f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 4;
        this.env(g, t, 0.05, 0.05 * v, 0.7);
        o.connect(f).connect(g).connect(this.sfx);
        o.start(t); lfo.start(t); o.stop(t + 0.8); lfo.stop(t + 0.8);
        break;
      }
      case 'buzz': this.tone('square', 120, 120, t, 0.9, 0.06 * v); this.tone('square', 240, 240, t, 0.9, 0.03 * v); break;
      case 'crackle': for (let i = 0; i < 8; i++) this.hiss(t + Math.random() * 0.25, 0.02, 0.08 * v, 'bandpass', 1500, 2); break;
      case 'squelch': this.hiss(t, 0.3, 0.25 * v, 'lowpass', 900, 3, 200); this.tone('sine', 200, 70, t, 0.25, 0.15 * v); break;
      case 'bell': this.tone('sine', 2800, 2800, t, 0.3, 0.12 * v); this.tone('sine', 2800, 2800, t + 0.15, 0.3, 0.1 * v); break;
      case 'ching': this.tone('sine', 1320, 1320, t, 0.5, 0.15 * v); this.tone('sine', 1980, 1980, t + 0.08, 0.5, 0.12 * v); break;
      case 'step': this.hiss(t, 0.04, 0.035 * v, 'lowpass', 500); break;
      case 'click': this.tone('square', 1000, 1000, t, 0.02, 0.04 * v); break;
      case 'shout': break;
      case 'tick': this.tone('square', 1500, 1500, t, 0.03, 0.06 * v); break;
      case 'honk': this.tone('sawtooth', 392, 392, t, 0.35, 0.09 * v); this.tone('sawtooth', 494, 494, t, 0.35, 0.07 * v); break;
      case 'thud': this.tone('sine', 110, 45, t, 0.3, 0.6 * v); this.hiss(t, 0.2, 0.3 * v, 'lowpass', 1200); break;
      case 'stream': this.hiss(t, 2.8, 0.06 * v, 'bandpass', 2600, 1.5, 1800); break;
      case 'kick': this.tone('sine', 160, 60, t, 0.25, 0.5 * v); this.hiss(t + 0.05, 0.4, 0.15 * v, 'bandpass', 900, 1); for (let i = 0; i < 5; i++) this.tone('triangle', 2000 + Math.random() * 1500, 1800, t + 0.1 + Math.random() * 0.4, 0.08, 0.05 * v); break;
      case 'till': this.tone('sine', 1200, 1200, t, 0.08, 0.1 * v); this.tone('sine', 1800, 1800, t + 0.09, 0.15, 0.1 * v); break;
      case 'gulp': for (let i = 0; i < 3; i++) this.tone('sine', 300, 180, t + i * 0.25, 0.12, 0.15 * v); break;
      // M13 fight sounds.
      case 'whoosh': this.hiss(t, 0.14, 0.12 * v, 'bandpass', 900, 1.2, 2600); break;
      case 'hit': this.tone('sine', 150, 50, t, 0.16, 0.55 * v); this.hiss(t, 0.08, 0.3 * v, 'lowpass', 1800); break;
      case 'block': this.tone('square', 320, 260, t, 0.06, 0.12 * v); this.hiss(t, 0.05, 0.15 * v, 'highpass', 3000); break;
      case 'grunt': this.tone('sawtooth', 140 + Math.random() * 30, 90, t, 0.18, 0.07 * v); break;
      case 'cheer': for (let i = 0; i < 6; i++) this.hiss(t + i * 0.12, 0.35, 0.05 * v, 'bandpass', 700 + Math.random() * 900, 2); break;
      case 'ko': this.tone('sine', 220, 40, t, 0.6, 0.6 * v); for (let i = 0; i < 4; i++) this.tone('triangle', 2400, 2200, t + 0.3 + i * 0.12, 0.06, 0.06 * v); break;
      case 'fire': for (let i = 0; i < 5; i++) this.hiss(t + Math.random() * 0.35, 0.015 + Math.random() * 0.02, 0.05 * v, 'bandpass', 2200 + Math.random() * 1800, 3); break;
      case 'munch': for (let i = 0; i < 4; i++) this.hiss(t + i * 0.2, 0.08, 0.1 * v, 'bandpass', 1500, 2); break;
    }
  }

  /** Speaks a voice line (or does nothing; subtitles are shown by the caller). */
  speak(line: Line) {
    if (this.voiceMode === 'off') return;
    const intercom = line.id.startsWith('ic_');
    if (this.voiceMode === 'auto' && this.ctx && this.manifest?.has(line.id)) { void this.playFile(line.id, intercom); return; }
    if (!('speechSynthesis' in window) || !this.huVoice || line.hu.startsWith('(')) return;
    if (intercom) this.play('crackle');
    const u = new SpeechSynthesisUtterance(line.hu.replace(/\.\.\./g, ', '));
    u.voice = this.huVoice;
    u.lang = this.huVoice.lang;
    const p: Record<Speaker, [number, number]> = { granny: [1.5, 0.85], grandpa: [0.6, 0.85], hazmester: [0.5, 1.15], zsiga: [0.4, 0.9], street: [0.8, 0.95], player: [1, 1], machine: [1, 1], cashier: [1.2, 1.05], driver: [0.7, 1.2] };
    [u.pitch, u.rate] = p[line.who];
    u.volume = this.volumes.master * this.volumes.voice;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }

  private async playFile(id: string, intercom: boolean) {
    const ctx = this.ctx!;
    let buf = this.buffers.get(id);
    if (!buf) {
      try {
        const r = await fetch(`${import.meta.env.BASE_URL}audio/voice/${id}.mp3`);
        buf = await ctx.decodeAudioData(await r.arrayBuffer());
        this.buffers.set(id, buf);
      } catch { return; }
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    let node: AudioNode = src;
    if (intercom) {
      // Crackly intercom: band-limited, slightly overdriven, with static.
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 400;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3000;
      const sh = ctx.createWaveShaper();
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) { const x = (i / 128) - 1; curve[i] = Math.tanh(x * 2.5); }
      sh.curve = curve;
      node.connect(hp).connect(lp).connect(sh);
      node = sh;
      this.play('crackle');
    }
    node.connect(this.voiceGain);
    src.start();
  }
}

export const sound = new Sound();

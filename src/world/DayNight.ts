import * as THREE from 'three';
import { hourOf } from '../state/time';

// Sun, moon, sky and fog from the game clock. A full day lasts 15 real minutes.
// Sunrise ~06:00, sunset ~19:00; night is dark blue, never black.

export interface Lighting {
  /** 0 = full day, 1 = full night. */
  night: number;
  /** 0 = day, 1 = lamps fully on (switches on at dusk, before full night). */
  lamps: number;
}

const DAY_SKY = new THREE.Color(0x9fc3e0);
const DUSK_SKY = new THREE.Color(0xe7a27c);
const NIGHT_SKY = new THREE.Color(0x0c1730);
const DAY_SUN = new THREE.Color(0xfff1d6);
const DUSK_SUN = new THREE.Color(0xffa36b);
const MOON = new THREE.Color(0x8fa6d6);
const SUNRISE = 6, SUNSET = 19;

function smooth(a: number, b: number, x: number) {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

export class DayNight {
  readonly offset = new THREE.Vector3();
  private sky = new THREE.Color();

  constructor(private scene: THREE.Scene, private hemi: THREE.HemisphereLight, private sun: THREE.DirectionalLight) {}

  update(minute: number): Lighting {
    const h = hourOf(minute);
    // Daylight 0..1 with soft twilight either side of sunrise and sunset.
    const day = smooth(SUNRISE - 0.6, SUNRISE + 0.9, h) * (1 - smooth(SUNSET - 0.9, SUNSET + 0.6, h));
    const night = 1 - day;
    // Dusk/dawn glow peaks around sunrise and sunset.
    const glow = Math.max(Math.exp(-(((h - SUNSET) / 0.9) ** 2)), Math.exp(-(((h - SUNRISE) / 0.8) ** 2)));

    // Sun path: rises in the east (+x), south at noon (+z), sets in the west.
    const t = (h - SUNRISE) / (SUNSET - SUNRISE);
    if (day > 0.02) {
      const az = Math.PI * THREE.MathUtils.clamp(t, -0.1, 1.1);
      const el = Math.max(0.12, Math.sin(Math.PI * THREE.MathUtils.clamp(t, 0, 1)) * 1.0);
      this.offset.set(Math.cos(az) * 200, Math.sin(el) * 200 + 20, Math.sin(az) * 120 + 40);
      this.sun.color.copy(DAY_SUN).lerp(DUSK_SUN, glow * 0.8);
      this.sun.intensity = 2.3 * day;
    } else {
      // Moonlight from the south-west.
      this.offset.set(-120, 180, 90);
      this.sun.color.copy(MOON);
      this.sun.intensity = 0;
    }
    if (night > 0.5) {
      this.offset.set(-120, 180, 90);
      this.sun.color.copy(MOON);
      this.sun.intensity = 0.45 * night;
    }

    this.sky.copy(DAY_SKY).lerp(NIGHT_SKY, night).lerp(DUSK_SKY, glow * 0.55);
    (this.scene.background as THREE.Color).copy(this.sky);
    this.scene.fog!.color.copy(this.sky);
    (this.scene.fog as THREE.Fog).far = 1300 - night * 700;
    this.hemi.intensity = 1.6 - 1.05 * night;
    this.hemi.color.setHex(0xdcecff).lerp(new THREE.Color(0x6f86c0), night);
    this.hemi.groundColor.setHex(0x8a8172).lerp(new THREE.Color(0x2a2620), night);
    document.body.style.background = `#${this.sky.getHexString()}`;

    const lamps = 1 - smooth(SUNRISE + 0.2, SUNRISE + 1, h) * (1 - smooth(SUNSET - 1.2, SUNSET - 0.3, h));
    return { night, lamps };
  }
}

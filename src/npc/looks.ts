import type { CharacterColors } from '../player/CharacterModel';
import type { Rng } from '../state/rng';

// Random everyday colour sets for NPCs.

const SKIN = [0xf1c9a5, 0xe0b48f, 0xc99a74, 0xa87652, 0x7a5236];
const HAIR = [0x2a1d15, 0x4a3426, 0x7a5a3a, 0xb8a27a, 0xd9d4cc, 0x8e8e8e, 0x1b1b1b];
const TOPS = [0x3d4a66, 0x8a2f2f, 0x2f5a4a, 0xc9b98f, 0x5a5a5a, 0xd8d2c4, 0x274060, 0x6b4a7a, 0xb36b2e, 0x1f1f1f, 0x7d8c5a];
const BOTTOMS = [0x2c3445, 0x3d4a66, 0x4a4036, 0x1f1f1f, 0x6a6a6a, 0x8a7a5a];
const SHOES = [0x2a2522, 0x1b1b1b, 0xe8e2d6, 0x5a3a26];

export function randomColors(rng: Rng | { pick<T>(a: readonly T[]): T }): CharacterColors {
  return {
    skin: rng.pick(SKIN), hair: rng.pick(HAIR), hat: rng.pick(TOPS),
    top: rng.pick(TOPS), bottoms: rng.pick(BOTTOMS), shoes: rng.pick(SHOES),
  };
}

/** Math.random-backed picker for purely cosmetic choices. */
export const cosmetic = { pick<T>(a: readonly T[]): T { return a[Math.floor(Math.random() * a.length)]; } };

export const HAZMESTER_COLORS: CharacterColors = {
  skin: 0xe0a98a, hair: 0x8e8e8e, hat: 0x5a5a5a, top: 0x7c8186, bottoms: 0x3a3f46, shoes: 0x6b4a3a,
};

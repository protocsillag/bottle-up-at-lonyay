import type { AccessoryKind, BottomsKind, CharacterColors, CharacterOptions, FaceKind, HairKind, HatKind, ShoesKind, TopKind } from './CharacterModel';

// The player's look: presets, customise slots and colour swatches, saved to localStorage.

export type PresetId = 'punk' | 'oldtimer' | 'romantic' | 'festival';

export interface CharacterLook {
  preset: PresetId;
  name: string;
  colors: CharacterColors;
  opts: Required<Pick<CharacterOptions, 'hat' | 'hairStyle' | 'face' | 'top' | 'bottomsStyle' | 'shoesStyle' | 'accessory'>>;
}

export interface Preset { id: PresetId; label: string; look: CharacterLook; }

const SKIN = 0xe0b48f;

export const PRESETS: Preset[] = [
  {
    id: 'punk', label: 'The Punk',
    look: { preset: 'punk', name: 'Tüske',
      colors: { skin: 0xe6bc98, hair: 0x3fbf3f, hat: 0x1b1b1b, top: 0x1d1d1f, bottoms: 0x40567a, shoes: 0x151515 },
      opts: { hat: 'none', hairStyle: 'mohawk', face: 'none', top: 'leather', bottomsStyle: 'ripped', shoesStyle: 'boots', accessory: 'chain' } },
  },
  {
    id: 'oldtimer', label: 'The Old Timer',
    look: { preset: 'oldtimer', name: 'Feri bácsi',
      colors: { skin: 0xdcae8c, hair: 0xb8b4ac, hat: 0x5a5046, top: 0x7a5f45, bottoms: 0x5a5a5a, shoes: 0x7a5232 },
      opts: { hat: 'flatcap', hairStyle: 'short', face: 'beard', top: 'tweed', bottomsStyle: 'trousers', shoesStyle: 'sandals', accessory: 'none' } },
  },
  {
    id: 'romantic', label: 'The Hobo Romantic',
    look: { preset: 'romantic', name: 'Bandi',
      colors: { skin: SKIN, hair: 0x5a3e2b, hat: 0x7a2f3a, top: 0x4a4f3a, bottoms: 0x3a3530, shoes: 0x2a2522 },
      opts: { hat: 'beanie', hairStyle: 'long', face: 'stubble', top: 'coat', bottomsStyle: 'trousers', shoesStyle: 'boots', accessory: 'none' } },
  },
  {
    id: 'festival', label: 'The Festival Survivor',
    look: { preset: 'festival', name: 'Csabi',
      colors: { skin: 0xe8b894, hair: 0x7a5a3a, hat: 0xd8c27a, top: 0x6b4a7a, bottoms: 0x6b6a4a, shoes: 0x3a3a3a },
      opts: { hat: 'bucket', hairStyle: 'short', face: 'none', top: 'tee', bottomsStyle: 'shorts', shoesStyle: 'sneakers', accessory: 'sunglasses' } },
  },
];

type Slot = keyof CharacterLook['opts'];
export const SLOTS: { key: Slot; label: string; options: { v: string; label: string }[] }[] = [
  { key: 'hat', label: 'Hat', options: [
    { v: 'none', label: 'None' }, { v: 'beanie', label: 'Beanie' }, { v: 'flatcap', label: 'Flat cap' }, { v: 'bucket', label: 'Bucket hat' }, { v: 'cap', label: 'Baseball cap' }] satisfies { v: HatKind; label: string }[] },
  { key: 'hairStyle', label: 'Hair', options: [
    { v: 'short', label: 'Short' }, { v: 'long', label: 'Long' }, { v: 'mohawk', label: 'Mohawk' }, { v: 'bald', label: 'Bald' }] satisfies { v: HairKind; label: string }[] },
  { key: 'face', label: 'Face', options: [
    { v: 'none', label: 'Clean' }, { v: 'stubble', label: 'Stubble' }, { v: 'moustache', label: 'Moustache' }, { v: 'beard', label: 'Beard' }] satisfies { v: FaceKind; label: string }[] },
  { key: 'top', label: 'Top', options: [
    { v: 'parka', label: 'Parka' }, { v: 'leather', label: 'Studded leather' }, { v: 'tweed', label: 'Tweed jacket' }, { v: 'coat', label: 'Long coat & scarf' },
    { v: 'tee', label: 'Band T-shirt' }, { v: 'hoodie', label: 'Hoodie' }] satisfies { v: TopKind; label: string }[] },
  { key: 'bottomsStyle', label: 'Bottoms', options: [
    { v: 'jeans', label: 'Jeans' }, { v: 'ripped', label: 'Ripped jeans' }, { v: 'trousers', label: 'Trousers' }, { v: 'shorts', label: 'Cargo shorts' }, { v: 'tracksuit', label: 'Tracksuit' }] satisfies { v: BottomsKind; label: string }[] },
  { key: 'shoesStyle', label: 'Shoes', options: [
    { v: 'boots', label: 'Boots' }, { v: 'sneakers', label: 'Sneakers' }, { v: 'sandals', label: 'Sandals & socks' }, { v: 'slippers', label: 'Slippers' }] satisfies { v: ShoesKind; label: string }[] },
  { key: 'accessory', label: 'Accessory', options: [
    { v: 'none', label: 'None' }, { v: 'sunglasses', label: 'Sunglasses' }, { v: 'earring', label: 'Earring' }, { v: 'chain', label: 'Chain' },
    { v: 'backpack', label: 'Backpack' }, { v: 'dog', label: 'Dog on a string' }] satisfies { v: AccessoryKind; label: string }[] },
];

export const HAIR_SWATCHES = [0x1b1b1b, 0x4a3426, 0x7a5a3a, 0xc9a25a, 0xb8b4ac, 0x3fbf3f, 0xd23a8a];
export const GARMENT_SWATCHES = [0x1d1d1f, 0x4f6b45, 0x7a5f45, 0x4a4f3a, 0x6b4a7a, 0x8a2f2f, 0x274060, 0xb36b2e, 0xd8d2c4];
export const SKIN_SWATCHES = [0xf1c9a5, 0xe0b48f, 0xc99a74, 0xa87652, 0x7a5236];

/** Invented band for the festival T-shirt (no real band names). */
export const BAND_NAME = 'Zúzmara';

const KEY = 'bual.character.v1';

export function cloneLook(l: CharacterLook): CharacterLook {
  return { ...l, colors: { ...l.colors }, opts: { ...l.opts } };
}

export function loadLook(): CharacterLook {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const l = JSON.parse(raw) as CharacterLook;
      if (l?.colors && l?.opts && typeof l.name === 'string') return { ...cloneLook(PRESETS[0].look), ...l, colors: { ...PRESETS[0].look.colors, ...l.colors }, opts: { ...PRESETS[0].look.opts, ...l.opts } };
    }
  } catch { /* storage blocked */ }
  return cloneLook(PRESETS[0].look);
}

export function saveLook(l: CharacterLook) {
  try { localStorage.setItem(KEY, JSON.stringify(l)); } catch { /* storage blocked */ }
}

// A short blocklist for slurs and the worst words (Hungarian and English), matched on
// letters only so "c.i.g.a.n.y" style tricks still hit. Kept deliberately small.
const BLOCK = ['cigany', 'buzi', 'nigger', 'nigga', 'faggot', 'fagot', 'retard', 'kurva', 'geci', 'fasz', 'picsa', 'zsido', 'nazi', 'hitler', 'cunt', 'whore'];

function fold(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '')
    .replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's');
}

/** Returns an error message, or null if the name is fine. Accents allowed, 1–16 characters. */
export function checkName(name: string): string | null {
  const n = name.trim();
  if (n.length < 1) return 'Type a name';
  if ([...n].length > 16) return 'Max 16 characters';
  if (!/^[\p{L}\p{N} .'\-_!?]+$/u.test(n)) return 'Letters, numbers and spaces only';
  const f = fold(n.replace(/[0-9]/g, (d) => ({ '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's' }[d] ?? '')));
  if (BLOCK.some((w) => f.includes(w))) return 'Pick a friendlier name';
  return null;
}

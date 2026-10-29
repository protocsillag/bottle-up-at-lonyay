import type { VoiceMode } from '../audio/Sfx';

// Player settings, saved in localStorage.

export type Quality = 'low' | 'medium' | 'high';

export interface Settings {
  master: number; // 0–1
  sfx: number;
  voice: number;
  voiceMode: VoiceMode;
  mouse: number; // multiplier, 0.3–2.5
  quality: Quality;
}

const KEY = 'bual.settings.v1';
export const DEFAULT_SETTINGS: Settings = { master: 0.8, sfx: 0.8, voice: 0.9, voiceMode: 'auto', mouse: 1, quality: 'high' };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { /* storage blocked */ }
  // Default to medium on small or high-DPI screens where fill rate hurts most.
  return { ...DEFAULT_SETTINGS, quality: devicePixelRatio > 1.5 ? 'medium' : 'high' };
}

export function saveSettings(s: Settings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage blocked */ }
}

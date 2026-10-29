// Generates the Hungarian voice lines with Piper TTS into public/audio/voice/.
// Run: node tools/voice/generate.mjs   (see tools/voice/README.md for setup)
//
// Reads the lines from src/audio/lines.ts, synthesises each with the voice for its
// speaker, then uses ffmpeg to slow and pitch the old lady, roughen the házmester,
// and encode small MP3s. The game adds the crackly intercom filter at runtime, and
// only plays files listed in manifest.json.
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const ROOT = new URL('../../', import.meta.url);
const OUT = new URL('public/audio/voice/', ROOT);
const MODELS = new URL('tools/voice/models/', ROOT);
const PIPER = process.env.PIPER ?? 'piper';

// Speaker → Piper voice and post-processing. Anna (female) is for personal,
// non-commercial use, which fits this free hobby game; check each voice's MODEL_CARD.
const SPEAKERS = {
  granny: { model: 'hu_HU-anna-medium', length: 1.25, filter: 'asetrate=22050*1.06,aresample=22050,atempo=0.88' },
  grandpa: { model: 'hu_HU-imre-medium', length: 1.2, filter: 'asetrate=22050*0.94,aresample=22050,atempo=1.0' },
  hazmester: { model: 'hu_HU-imre-medium', length: 0.95, filter: 'asetrate=22050*0.9,aresample=22050,atempo=1.08,volume=1.6' },
  street: { model: 'hu_HU-imre-medium', length: 1.0, filter: 'asetrate=22050*0.97,aresample=22050' },
  player: { model: 'hu_HU-berta-medium', length: 1.0, filter: 'anull' },
  machine: null,
};

const src = await readFile(new URL('src/audio/lines.ts', ROOT), 'utf8');
const lines = [...src.matchAll(/\{\s*id:\s*'([^']+)',\s*hu:\s*'([^']+)',\s*en:\s*(?:'[^']*'|"[^"]*"),\s*who:\s*'([^']+)'/g)]
  .map(([, id, hu, who]) => ({ id, hu, who }));
if (!lines.length) throw new Error('No lines found in src/audio/lines.ts');

await mkdir(OUT, { recursive: true });
const done = [];
for (const l of lines) {
  const sp = SPEAKERS[l.who];
  if (!sp || l.hu.startsWith('(')) continue; // sound effects, snoring and the buzzer are synthesised in code
  const model = new URL(`${sp.model}.onnx`, MODELS);
  if (!existsSync(model)) { console.warn(`skip ${l.id}: missing ${model.pathname}`); continue; }
  const wav = new URL(`${l.id}.wav`, OUT), mp3 = new URL(`${l.id}.mp3`, OUT);
  const text = l.hu.replace(/\.\.\./g, ', ');
  execFileSync(PIPER, ['--model', model.pathname, '--length_scale', String(sp.length), '--output_file', wav.pathname], { input: text });
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav.pathname, '-af', `${sp.filter},highpass=f=90,loudnorm=I=-18`, '-ac', '1', '-b:a', '48k', mp3.pathname]);
  await rm(wav);
  done.push(l.id);
  console.log(`${l.id}  ${l.hu}`);
}
await writeFile(new URL('manifest.json', OUT), JSON.stringify(done, null, 0));
console.log(`${done.length} lines written to public/audio/voice/`);

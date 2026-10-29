# Voice lines (Piper TTS)

The game speaks its Hungarian lines from `public/audio/voice/<id>.mp3` when they are listed in
`public/audio/voice/manifest.json`. Until then it uses the browser's Hungarian speech voice (if the
system has one) and always shows subtitles.

The cloud sandbox that built M9 could not download the Piper voices (huggingface.co is blocked
there), so generate them locally:

```bash
pip install piper-tts                     # the piper CLI
mkdir -p tools/voice/models && cd tools/voice/models
for v in anna berta imre; do
  curl -LO https://huggingface.co/rhasspy/piper-voices/resolve/main/hu/hu_HU/$v/medium/hu_HU-$v-medium.onnx
  curl -LO https://huggingface.co/rhasspy/piper-voices/resolve/main/hu/hu_HU/$v/medium/hu_HU-$v-medium.onnx.json
done
cd ../../..
node tools/voice/generate.mjs             # needs ffmpeg on the PATH
```

Then commit `public/audio/voice/`. The models folder is git-ignored.

Licences: check each voice's `MODEL_CARD`. Anna is for personal, non-commercial use, which fits this
free hobby game. Speakers map to voices in `generate.mjs` (`granny` → Anna, `grandpa`/`hazmester`/
`street` → Imre, `player` → Berta). The intercom crackle is added at runtime, not baked in.

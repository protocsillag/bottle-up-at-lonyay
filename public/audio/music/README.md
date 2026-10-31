# Music

Drop looping tracks here and they play; leave them out and the game stays silent.

| File | Plays on |
| --- | --- |
| `menu.mp3` | Title, character creator, intro card, end screen, high scores |
| `game.mp3` | During a run (also while paused) |
| `fight.mp3` | Zsiga's fire barrel fight, until the result card. Without it, `game.mp3` keeps playing through the fight |

- MP3, any length; it loops, so cut it to loop cleanly. 128 kbps stereo is plenty (a 2-minute loop is about 2 MB).
- Exactly these names, lower case. Any file can be missing: that screen just has no music (the fight falls back to `game.mp3`).
- The tracks cross-fade over about a second when you switch between menu, game and fight.
- Players set the volume and switch music off in Settings ("Music" and "Music on / off"). The master volume applies too.
- Browsers only allow sound after the first click, tap or key press, so the menu music starts then.
- Only use music you have the rights to publish (your own, or licensed for free use, e.g. CC0 or CC BY with credit added to the README).

After adding the files: commit and push to `main`; GitHub Pages redeploys.

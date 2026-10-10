# EnglishQuest — Audio licenses

All music (in-app themes and Ranked Quest themes), layers, cues and sound effects currently used by EnglishQuest are **original works**,
synthesized live in the browser by `public/js/audio.js` (Web Audio API oscillators, filters and noise).
No third-party recordings, samples, melodies, game/film/anime music, or AI-generated audio are included.

| Field | Value |
|---|---|
| source | Original — procedural synthesis in `public/js/audio.js` |
| license | Proprietary, original work for EnglishQuest |
| author | EnglishQuest |

Seasonal: **Pumpkin Lantern Parade** and **Moonlit Study** (Halloween 2026) are original compositions synthesized the same way.

## Adding licensed or commissioned music later
1. Put the compressed file (`.ogg` / `.m4a`, ideally ≤ 1.5 MB, seamless loop points) in this folder.
2. In `manifest.json`, set `file` for that track and fill `track_name`, `source`, `license`, `author`, `license_url`
   with the real, verified licence (commercial use must be allowed — check AI-music services' terms before use).
3. Optional: `loopStart` / `loopEnd` (seconds) for a gapless loop.
The engine lazy-loads the file only when that track is needed and falls back to the synthesized version if loading fails.

# Asset sources and licenses

Keep this file current whenever an asset is added. Only use assets whose license
allows commercial publication and redistribution of the rendered video.

| Asset | Path | Source | License | Notes |
|---|---|---|---|---|
| Inter (Regular, Medium, SemiBold) | `assets/fonts/Inter-*.woff2` | `@fontsource/inter` 5.3.0 (Inter by Rasmus Andersson) | SIL Open Font License 1.1 (`assets/fonts/LICENSE-Inter-OFL.txt`) | Bundled so text measurement is identical on every machine. |
| Sound cues: `receive`, `send`, `boom`, `ding`, `sad`, `heartbeat` | `assets/generated/sfx/*.wav` (generated, gitignored) | Synthesized locally by `src/audio/cues.js` and `src/audio/assets.js` with FFmpeg lavfi | Original work of this project | Recreated on demand by `npm run assets`. `boom` is an original synth in the spirit of the "vine boom" meme. It is **not** a copy of any recording. |
| Voice cues: `bruh`, `rizz` | `assets/sfx/voice/bruh.mp3`, `assets/sfx/voice/rizz.mp3` (committed source files) | Spoken with the platform text-to-speech voice `voice-00`, trimmed in `src/audio/cues.js` | Generated for this project with the platform TTS. Check the platform's terms for generated speech before redistributing outside this repo. | Substitutes for requested SFX. Real vine-boom, rizz, and bruh recordings could not be downloaded from the sandbox. To use a recording, add a CC0 or royalty-free file and point the cue `source` at it, then record it here. |
| Background music | Generated at render time (`aevalsrc` pad) | Synthesized locally in `src/audio/mix.js` | Original work of this project | Replace with `audio.music` in the story to use your own licensed track. |
| Avatars | Generated initials avatars | Drawn by the renderer | Original work of this project | Use `contacts[].avatar` only with images you have rights to. |

No third-party gameplay footage, music, or sound effects are bundled. Gameplay
footage (for example Minecraft parkour) must be supplied by you under a license
that permits it, referenced via `background.video`.

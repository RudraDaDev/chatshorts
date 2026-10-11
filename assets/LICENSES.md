# Asset sources and licenses

Keep this file current whenever an asset is added. Only use assets whose license
allows commercial publication and redistribution of the rendered video.

| Asset | Path | Source | License | Notes |
|---|---|---|---|---|
| Inter (Regular, Medium, SemiBold) | `assets/fonts/Inter-*.woff2` | `@fontsource/inter` 5.3.0 (Inter by Rasmus Andersson) | SIL Open Font License 1.1 (`assets/fonts/LICENSE-Inter-OFL.txt`) | Bundled so text measurement is identical on every machine. |
| Sound effects (`receive`, `send`) | `assets/generated/sfx/*.wav` (generated, gitignored) | Synthesized locally by `src/audio/assets.js` with FFmpeg lavfi | Original work of this project | Recreated on demand by `npm run assets`. |
| Background music | Generated at render time (`aevalsrc` pad) | Synthesized locally in `src/audio/mix.js` | Original work of this project | Replace with `audio.music` in the story to use your own licensed track. |
| Avatars | Generated initials avatars | Drawn by the renderer | Original work of this project | Use `contacts[].avatar` only with images you have rights to. |

No third-party gameplay footage, music, or sound effects are bundled. Gameplay
footage (for example Minecraft parkour) must be supplied by you under a license
that permits it, referenced via `background.video`.

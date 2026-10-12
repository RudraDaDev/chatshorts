# Asset sources and licenses

Keep this file current whenever an asset is added. Only use assets whose license
allows commercial publication and redistribution of the rendered video.

| Asset | Path | Source | License | Notes |
|---|---|---|---|---|
| Inter (Regular, Medium, SemiBold) | `assets/fonts/Inter-*.woff2` | `@fontsource/inter` 5.3.0 (Inter by Rasmus Andersson) | SIL Open Font License 1.1 (`assets/fonts/LICENSE-Inter-OFL.txt`) | Bundled so text measurement is identical on every machine. |
| Sound cues: `receive`, `send`, `boom`, `ding`, `sad`, `heartbeat` | `assets/generated/sfx/*.wav` (generated, gitignored) | Synthesized locally by `src/audio/cues.js` and `src/audio/assets.js` with FFmpeg lavfi | Original work of this project | Recreated on demand by `npm run assets`. `boom` is an original synth in the spirit of the "vine boom" meme. It is **not** a copy of any recording. |
| Voice cues: `bruh`, `rizz` | `assets/sfx/voice/bruh.mp3`, `assets/sfx/voice/rizz.mp3` (committed source files) | Spoken with the platform text-to-speech voice `voice-00`, trimmed in `src/audio/cues.js` | Generated for this project with the platform TTS. Check the platform's terms for generated speech before redistributing outside this repo. | Substitutes for requested SFX. Real vine-boom, rizz, and bruh recordings could not be downloaded from the sandbox. To use a recording, add a CC0 or royalty-free file and point the cue `source` at it, then record it here. |
| Background music | Generated at render time (`aevalsrc` pad) | Synthesized locally in `src/audio/mix.js` | Original work of this project | Replace with `audio.music` in the story to use your own licensed track. |
| Narration model: Kokoro-82M (q8 ONNX) | `assets/models/kokoro/model_quantized.onnx` (downloaded, gitignored) | Weights from the npm package `kokoro-q8-shards@1.0.0`, which joins to the `model_quantized.onnx` of `onnx-community/Kokoro-82M-v1.0-ONNX` (Hugging Face). The joined SHA-256 is `fbae9257…8a1478`, checked by `src/tts/fetch-model.js`. Original model by hexgrad. | Apache-2.0 (model card and package). The Hugging Face copy was not reachable from the build sandbox, so the package's own checksum is the only verification here. | Run `npm run tts:assets`. |
| Narration voices (28 English) | `assets/models/kokoro/voices/*.bin` (downloaded, gitignored) | `kokoro-js@1.2.1` npm package, `voices/` directory | Apache-2.0 | Voice ids are listed in `src/tts/voices.js`. |
| Phonemizer code | `src/tts/phonemize.js` | Adapted from `kokoro-js` `src/phonemize.js`, unchanged except for a header | Apache-2.0 | Text normalization and phoneme post-processing. |
| Phoneme vocabulary | `src/tts/kokoro-vocab.json` | `vocab` and `n_token` from `thewh1teagle/kokoro-onnx` `src/kokoro_onnx/config.json` | MIT (repository license) | Maps IPA symbols to Kokoro token ids. Reproduces the upstream config. |
| Phonemizer library | `node_modules/phonemizer` (npm dependency) | `phonemizer@1.2.1` on npm | Labeled Apache-2.0 in its package.json. **Review before distributing:** it embeds eSpeak-NG, which is GPL-3.0. | Used only to turn text into IPA for narration. Confirm the license terms before redistributing the code or binaries. |
| ONNX runtime | `node_modules/onnxruntime-node` (npm dependency) | Microsoft ONNX Runtime | MIT | CPU inference for the Kokoro model. |
| Narration clips | `assets/generated/tts/*.wav` (generated, gitignored) | Spoken by the Kokoro voices above, trimmed and peak-normalized | Same terms as the model and voices | Rebuilt on demand. |
| Background video: Minecraft parkour clip | `assets/backgrounds/vidssave.com Minecraft Parkour Gameplay - NO COPYRIGHT (4K QUALITY) 480p.mp4` (committed in `5da13ed` by the repository owner) | Re-upload from vidssave.com of a Minecraft parkour video. The file name says "NO COPYRIGHT", which is the uploader's label. It is not a license. | **Unverified.** Minecraft is copyrighted by Mojang / Microsoft, and gameplay footage can be claimed on monetized videos. Confirm the rights before publishing monetized Shorts. | 480p AV1, 608×1080, 59 s. Used for the stories in `stories/examples/`. Renders that include it are kept out of Git (see `samples/README.md`). |
| Background video: generated plasma | `assets/backgrounds/plasma-720p30.mp4` (generated, gitignored) | `scripts/make-background.js`, a procedural sine pattern computed in this repository | Original work of this project | Rebuild with `npm run backgrounds`. |
| Avatars | Generated initials avatars | Drawn by the renderer | Original work of this project | Use `contacts[].avatar` only with images you have rights to. |

No third-party gameplay footage, music, or sound effects are bundled. Gameplay
footage (for example Minecraft parkour) must be supplied by you under a license
that permits it, referenced via `background.video`.

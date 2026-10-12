# ChatShorts

Renders fictional iMessage-style text-story YouTube Shorts (1080×1920, 30 fps, H.264/AAC MP4)
from a JSON story script. **No LLM or API key is used.** You supply the story JSON yourself, or
generate it with any AI tool and paste it in. Everything after that is deterministic:
layout, rendering, audio, encoding, and QA.

A 36-second example renders in about 30 seconds on a 2-vCPU sandbox (see [Performance](#performance)).

## Setup

Requires Node.js 22.13 or newer.

```bash
npm install
npm run assets          # optional: build the sound cues into assets/generated/sfx/
npm run tts:assets      # optional, for narration: download the Kokoro voice model (about 120 MB)
node src/cli.js generate --story stories/examples/someone-using-my-number.json --narrate   # render with voice-over
node src/cli.js help
```

FFmpeg and ffprobe come from npm (`@ffmpeg-installer`, `@ffprobe-installer`). Chromium is found
automatically on macOS (installed Chrome) and bundled on Linux x64 (`@sparticuz/chromium`). On other
platforms, set `CHROME_PATH` in `.env` (copy `.env.example`).

## Use

```bash
# Check a script without rendering
node src/cli.js validate stories/examples/someone-using-my-number.json

# Render a Short (validate → layout → render → encode → QA → finalize)
node src/cli.js generate --story stories/examples/someone-using-my-number.json

# Choose the output path, keep intermediate frames, or skip audio
node src/cli.js generate --story my-story.json --output output/story-001.mp4 --keep-temp --no-audio

# Read the script from stdin (for example, piped from another AI tool)
cat my-story.json | node src/cli.js generate --story -

# Recover a failed or interrupted job; finished stages are not repeated
node src/cli.js resume job-20261011172725-c23f4f

node src/cli.js jobs            # recent jobs and their states
node src/cli.js qa output/x.mp4 # media QA on any MP4
```

Each generate run writes `output/<title-slug>-<id>.mp4` and a sibling `.report.json` with stage
timings, validation warnings, QA results, and API usage (always zero for manual stories).
The command exits with code 1 on any failure and prints the job ID for resuming.

The story format is documented in [docs/STORY_FORMAT.md](docs/STORY_FORMAT.md). It includes a
prompt you can paste into any AI tool to produce a valid script.

## How it works

| Stage | What happens | Code |
|---|---|---|
| validate | JSON Schema plus semantic checks: references, participants, reveal order, timing, asset existence. Writes the normalized story. | `src/stories/` |
| layout | Chromium measures each message with the real font, width, and line height. Bubble sizes, groups, corners, names, avatars, and content height are computed. The viewport index (reveal times and scroll events) is built. | `src/layout/`, `templates/imessage/` |
| render | A pure timeline gives the visible state at each frame: which messages are drawn, the scroll offset, and the entrance animation. Each distinct state is rendered once as a PNG (static frames are reused). Every rendered state is checked in the DOM. | `src/layout/viewport.js`, `src/renderer/scenes.js` |
| encode | FFmpeg concatenates stills with exact durations. Optional background video is overlaid. Sound effects are placed at reveal times. Music is mixed, limited, and loudness-normalized (−14 LUFS target). | `src/renderer/ffmpeg.js`, `src/audio/` |
| qa | ffprobe checks (codec, size, fps, duration, streams). Full decode of video and audio. Peak and mean levels (no clipping). Visual-state verification results. | `src/qa/validate-output.js` |
| finalize | Copies the MP4 to output, writes the report, removes frames unless `--keep-temp`. | `src/jobs/pipeline.js` |

**Key design rules**
- The story never supplies pixel coordinates. Positions are computed from measured text.
- Future messages are never drawn. The DOM contains only revealed bubbles, and the render stage checks this.
- Contacts and conversations are separate, so changing a name or avatar does not affect messages.
- Jobs are stored in SQLite (`temp/chatshorts.sqlite`), built on Node's `node:sqlite`. Each stage writes an artifact. Resume starts at the first unfinished stage, so a failed encode does not re-render, and a failed render does not re-validate.

## Configuration

Environment variables, or a `.env` file in the project root (see `.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `CHATSHORTS_WIDTH`, `CHATSHORTS_HEIGHT`, `CHATSHORTS_FPS` | 1080, 1920, 30 | Output format |
| `CHATSHORTS_TEMP_DIR`, `CHATSHORTS_OUTPUT_DIR` | `temp`, `output` | Working and output directories |
| `CHROME_PATH` | auto | Chrome/Chromium binary |
| `FFMPEG_PATH`, `FFPROBE_PATH` | bundled | Use your own FFmpeg |
| `STORY_PROVIDER` | `manual` | Story source. Only `manual` exists today. |

## Tests

```bash
npm run test:unit   # validation, layout geometry, viewport timing (about 1 s)
npm test            # plus real-Chromium measurement and end-to-end renders (about 2 minutes)
```

The end-to-end suite renders the example, renders a background-video variant without audio, checks
resume after a failed encode, and checks that an invalid story fails and records the job.

## Assets and licensing

- Background video: `assets/backgrounds/` holds your own footage (not in Git for `*.mp4`). `node scripts/make-background.js` makes an original, copyright-free plasma loop (2 minutes, 720×1280, 30 fps) if you need a placeholder.

- Narration uses Kokoro-82M (Apache-2.0), run locally on CPU with onnxruntime. Its model and voice files are downloaded on demand to `assets/models/` and are not stored in Git. Everything else is in [assets/LICENSES.md](assets/LICENSES.md).
- The Inter font (OFL) is bundled. Most sound cues and the default music bed are synthesized
  locally. The `bruh` and `rizz` cues are short spoken-word files generated with the platform
  TTS voice and committed under `assets/sfx/voice/`. The project has no licensed recordings. See
  [assets/LICENSES.md](assets/LICENSES.md).
- Gameplay footage (for example Minecraft parkour) is **not** included. Supply footage you are licensed to use through `background.video`.
- Record every asset you add in [assets/LICENSES.md](assets/LICENSES.md).
- Check current YouTube content and monetization rules before publishing. Fictional stories should be labeled as such if the channel requires it.

## Performance

Measured in this sandbox (2 vCPU, 4 GB RAM, software rendering):

| Stage | 36 s example |
|---|---|
| validate | ~5 ms |
| layout (Chromium measurement) | ~0.2 s |
| render (116 unique states) | ~11 s |
| encode (H.264 + AAC) | ~18 s |
| QA | ~1.3 s |
| **Total** | **~31 s** |

The 10-minute target is met with a wide margin. The largest cost is FFmpeg encoding. A faster
preset would reduce it at a small quality cost.

## Limitations (current version)

- **No story generation.** This is intentional, since no API key is in use. The provider interface is in `src/providers/llm.js`, so an API provider can be added later without changing the rest of the pipeline.
- **No text-to-speech, typing indicator, or delivery receipts.** These are optional items in the spec and are not implemented.
- **Visual approximation of iMessage.** The layout uses Inter, not SF Pro (which is not licensed for this use). Corner shapes are approximated, and there is no speech-bubble tail path. Emoji depend on the system emoji font.
- **Chromium bundling:** the bundled build is Linux x64 only. Elsewhere, set `CHROME_PATH`.
- **Visual QA is structural.** It checks DOM geometry, state counts, and reveal order, not pixel-level output. Contact sheets for human review are a planned improvement.
- **No dashboard.** The CLI is the only interface, as the spec's first version describes.

# Sample renders

Committed example outputs, so they can be viewed on GitHub. `output/` is gitignored for everyday renders; only deliberate samples are copied here.

| File | Source story | Notes |
|---|---|---|
| `someone-using-my-number.mp4` | `stories/examples/someone-using-my-number.json` | 40 s, 1080×1920, 30 fps, 3 voices, plain background, passed 17/17 QA |
| `the-fifth-member.mp4` | `stories/examples/the-fifth-member.json` | 57 s, group chat, 5 voices, plain background, passed 17/17 QA |
| `my-ex-texted-at-1-am-after-six-months.mp4` | `stories/examples/one-am-closure.json` | 51 s, heartbreak, 1:1 plus group, 4 voices |
| `i-planned-a-surprise-and-almost-set-off-the-alarm.mp4` | `stories/examples/the-picnic-proposal.json` | 48 s, happy relationship, 1:1 plus group, 4 voices |
| `she-left-me-on-read-for-three-hours.mp4` | `stories/examples/left-on-read-for-three-hours.json` | 57 s, crush, 1:1 plus group, 4 voices |

These samples use the plain full-screen layout with narration. The parkour-background versions of all six stories (with the bottom-anchored card) render to `output/` locally. They are not committed. Each render re-encodes the Minecraft footage (13 to 17 MB each), and the footage's license still needs confirming (see `assets/LICENSES.md`).

Each `.report.json` has the stage timings, validation warnings, QA summary, and API usage (zero).

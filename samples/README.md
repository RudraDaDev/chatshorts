# Sample renders

Committed example outputs, so they can be viewed on GitHub. `output/` is gitignored for
everyday renders; only deliberate samples are copied here. All samples use Kokoro narration
(see [docs/STORY_FORMAT.md](../docs/STORY_FORMAT.md#narration)) and sound cues.

| File | Source story | Notes |
|---|---|---|
| `someone-using-my-number.mp4` | `stories/examples/someone-using-my-number.json` | 40 s, 1080×1920, 30 fps, 3 voices, passed 17/17 QA |
| `the-fifth-member.mp4` | `stories/examples/the-fifth-member.json` | 57 s, group chat, 5 voices, passed 17/17 QA |
| `my-ex-texted-at-1-am-after-six-months.mp4` | `stories/examples/one-am-closure.json` | 51 s, heartbreak, 1:1 plus group, 4 voices |
| `i-planned-a-surprise-and-almost-set-off-the-alarm.mp4` | `stories/examples/the-picnic-proposal.json` | 48 s, happy relationship, 1:1 plus group, 4 voices |
| `she-left-me-on-read-for-three-hours.mp4` | `stories/examples/left-on-read-for-three-hours.json` | 57 s, crush, 1:1 plus group, 4 voices |

Each `.report.json` has the stage timings, validation warnings, QA summary, and API usage (zero).
Earlier silent-narration renders are in git history.

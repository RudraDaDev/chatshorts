# Story script format (v1)

A story is one JSON document. ChatShorts validates it and then renders it. No AI
call is made by this tool. You can write the JSON by hand or generate it with any AI tool.

Run `node src/cli.js validate your-story.json` to check a script before rendering.

## Top level

| Field | Required | Notes |
|---|---|---|
| `title` | yes | 1–120 characters. Used for the output file name. |
| `durationSeconds` | yes | 10–180. The spec target is 30–60. |
| `contacts` | yes | 1–12 people who are not you. |
| `conversations` | yes | 1–5 threads. Each thread is `direct` or `group`. |
| `messages` | yes | 2–200 messages, **in reveal order** (`revealAtMs` non-decreasing). |
| `localUser` | no | Defaults to `{ "id": "me", "displayName": "Me" }`. Your messages are on the right. |
| `appearance` | no | `dark` (default) or `light`. |
| `statusTime` | no | Text in the status bar, default `9:41`. |
| `background` | no | `{ "video": "path.mp4", "dim": 0.35 }`. Loops behind an inset chat card. You must supply licensed footage. |
| `narration` | no | `{ "enabled": true, "voice": "af_heart", "speed": 1 }`. Voice-over with Kokoro. See Narration below. |
| `audio` | no | `{ "sfx": true, "music": null, "musicVolumeDb": -24 }`. `music` may be a path to your licensed track. |
| `meta` | no | `premise`, `genre`, `tone`, `endingStyle` (`twist`, `cliffhanger`, `resolution`, `open`), `language`. |

## Contacts and conversations

Contacts and conversations are separate. Messages refer to IDs, so renaming a contact
never breaks a message.

- `contacts[]`: `{ "id", "displayName", "avatar"?, "color"? }`. Without `avatar`, an initials avatar is drawn. `color` is `#RRGGBB`.
- `conversations[]`: `{ "id", "type", "participants", "title" }`. `participants` lists contact IDs, not `localUser`.
  - `direct` needs exactly one other participant.
  - `group` needs at least two other participants. Group bubbles show the sender's name and avatar.

## Background video

Set `background.video` to a video file and it plays behind the chat. Paths are relative to the story file's folder. The clip loops and is cropped to fill the 1080×1920 frame.

- The chat becomes a smaller card anchored to the bottom (about 66% of the frame height, with a gap underneath). The top of the frame shows the footage, which keeps viewers watching.
- `background.dim` (0 to 0.9, default 0.35) darkens the footage. The examples use 0.2.
- The clip's own audio is ignored. Sound comes only from cues, narration, and the music bed.
- To keep your own footage private or out of Git, store it under `assets/backgrounds/`, which is gitignored for `*.mp4`.

Stories don't need two contacts. A story can be one direct conversation with one contact (see `stories/examples/dad-found-a-photo.json`).

## Narration

Narration reads each message aloud with a Kokoro-82M voice. Each character gets a voice, and the render retimes the story to fit the speech.

- `contacts[].voice` and `localUser.voice`: a voice id (run `node src/cli.js voices`). The sender's voice speaks that sender's lines.
- `narration.voice`: fallback voice for anyone without one (default `af_heart`). `narration.speed`: 0.7 to 1.3.
- `narration.enabled`: turn narration on for this story. The CLI flags `--narrate` and `--no-narrate` override it.
- `messages[].narration`: a string to speak instead of `text`, or `false` for silence.

Timing when narration is on. Reveal times in the file are ignored and rebuilt from the audio:
- The first message keeps its `revealAtMs`.
- A bubble appears 150 ms before its line starts, and the next bubble waits until the line ends plus 450 ms.
- Silent messages keep their authored gap, with a floor of 800 ms.
- The video is at least `durationSeconds`, and at least 2 s after the last line ends. Stories that run past 60 s still render, but YouTube Shorts allows up to 60 s.

The model and voices are downloaded once with `node src/cli.js tts-assets` (about 120 MB, stored under `assets/models/kokoro`). Synthesized lines are cached in `assets/generated/tts`, so re-renders are fast.

## Messages

```json
{ "id": "m05", "conversationId": "maya-thread", "senderId": "maya",
  "text": "I did. Then the message vanished.", "revealAtMs": 8800,
  "timestamp": "Today 11:52 PM", "sound": "auto" }
```

- `id`: unique. `senderId`: a contact, or `localUser.id` for your messages.
- `revealAtMs`: when the bubble appears. Must not decrease down the array. The last message must reveal at least 1.5 s before the end.
- `timestamp` (optional): a centered label before this message. It also breaks a sender group.
- `narration` (optional): a spoken line for this message, or `false` to keep it silent. The default is the message `text`. Narration is only used when it is turned on (see Narration).
- `sound` (optional, default `auto`): `auto` plays `send` for your messages and `receive` for others. `none` plays nothing. Any other value must be a cue name:

  | Cue | Kind | What it is |
  |---|---|---|
  | `receive` | synth | short pop for incoming messages |
  | `send` | synth | short whoosh for outgoing messages |
  | `boom` | synth | deep bass drop, a "vine boom"-style hit (original synth, not a recording) |
  | `ding` | synth | two-tone notification chime |
  | `sad` | synth | four falling notes |
  | `heartbeat` | synth | two thumps, lub-dub |
  | `bruh` | voice | the word "Bruh", spoken by the platform TTS voice |
  | `rizz` | voice | the word "Rizz", spoken by the platform TTS voice |

  Unknown names fail validation. Cues are built by `npm run assets` into `assets/generated/sfx/`.

The viewport scrolls to keep the newest bubble above the input bar. The layout engine measures every
bubble's text in Chromium, so you never provide pixel positions.

## Validation rules

Errors (the job is not rendered):
- schema mismatches and unknown fields
- duplicate contact, conversation, or message IDs
- unknown sender, conversation, or participant references
- a sender who is not in the conversation's participants
- reveal times out of order, or the last message too close to the end
- direct/group participant counts
- a missing avatar, background, or music file

Warnings (rendered, but review them):
- first message after 5 s (weak hook)
- fewer than 4 messages
- bubbles longer than 180 characters
- reveals less than 400 ms apart
- last message in the first half of the runtime
- no `meta` block

## Prompt you can paste into any AI tool

> Write a fictional text-message story for a YouTube Short as JSON only, matching the
> ChatShorts v1 format described below. Use 4–8 messages per conversation, a hook in the first
> 2 seconds, escalation in the middle, and a cliffhanger ending. Keep each message under 120
> characters. Set `revealAtMs` values in increasing order, about 1.5–3 seconds apart, and make the
> last reveal at least 2 seconds before `durationSeconds`. Use `schemaVersion: 1`, `theme: "imessage"`,
> the contacts/conversations/messages fields, and `meta.endingStyle`. Output only the JSON.
> [paste the "Top level" and "Messages" sections of this file]

Then save the output as `my-story.json` and run:

```bash
node src/cli.js validate my-story.json
node src/cli.js generate --story my-story.json
```

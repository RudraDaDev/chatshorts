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
| `audio` | no | `{ "sfx": true, "music": null, "musicVolumeDb": -24 }`. `music` may be a path to your licensed track. |
| `meta` | no | `premise`, `genre`, `tone`, `endingStyle` (`twist`, `cliffhanger`, `resolution`, `open`), `language`. |

## Contacts and conversations

Contacts and conversations are separate. Messages refer to IDs, so renaming a contact
never breaks a message.

- `contacts[]`: `{ "id", "displayName", "avatar"?, "color"? }`. Without `avatar`, an initials avatar is drawn. `color` is `#RRGGBB`.
- `conversations[]`: `{ "id", "type", "participants", "title" }`. `participants` lists contact IDs, not `localUser`.
  - `direct` needs exactly one other participant.
  - `group` needs at least two other participants. Group bubbles show the sender's name and avatar.

## Messages

```json
{ "id": "m05", "conversationId": "maya-thread", "senderId": "maya",
  "text": "I did. Then the message vanished.", "revealAtMs": 8800,
  "timestamp": "Today 11:52 PM", "sound": "auto" }
```

- `id`: unique. `senderId`: a contact, or `localUser.id` for your messages.
- `revealAtMs`: when the bubble appears. Must not decrease down the array. The last message must reveal at least 1.5 s before the end.
- `timestamp` (optional): a centered label before this message. It also breaks a sender group.
- `sound`: `auto` (default: a pop for received, a whoosh for sent) or `none`.

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

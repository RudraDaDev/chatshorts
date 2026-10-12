# Prompt: fictional text-message story for a ChatShorts video

You are writing one fictional text-message story for a vertical YouTube Short. Output JSON only,
matching the ChatShorts v1 format (`docs/STORY_FORMAT.md`). No prose outside the JSON.

## Premise
{{PREMISE}}

## Parameters
- Duration: {{DURATION_SECONDS}} seconds (target 30–45).
- Conversations: {{CONVERSATIONS}} (one group thread plus, optionally, one private thread).
- Messages: 15–20 in total. Every message is a short text (under 110 characters).
- Ending style: {{ENDING_STYLE}} (cliffhanger, twist, or resolution).
- Language: English.
- Content: no graphic violence, no real people or brands, no sexual content, no slurs.
  Scary or uncanny is fine; keep it fictional and non-instructional.

## Story shape
1. **Hook (first 2 seconds):** the first message is a direct question or a strange claim that makes the viewer ask "what?". Use a concrete detail: a name, a time, a number.
2. **Escalation (middle 60%):** each message adds one new fact that makes the previous one worse. Keep at least one reveal that contradicts what a character said earlier.
3. **Ending (last 15%):** end on a line that reframes everything. For a cliffhanger, end on an unanswered question or an instruction. Do not explain the twist.

## Writing rules
- Each message sounds like a real person typing fast: short sentences, no stage directions, minimal punctuation tricks.
- Give each contact a distinct voice (one blunt, one anxious, one dry).
- Use the local user ("me") for 3–5 messages, mostly as questions or reactions.
- Reveal times: the first message at 500–1000 ms. Space messages 1.4–2.5 seconds apart. The last message reveals at least 2 seconds before the end.
- Add a `timestamp` label to at most two messages, only where a time matters to the plot.
- Every `senderId` must be a participant of its conversation (or `me`). Ids are lowercase, hyphenated.

## Output checklist
- `schemaVersion: 1`, `theme: "imessage"`, `appearance: "dark"`
- `contacts`, `conversations`, `messages` (in reveal order), `meta` with `premise`, `genre`, `tone`, `endingStyle`, `language`
- Run `node src/cli.js validate` on the result. Fix every error. Warnings should be read and either fixed or accepted on purpose.

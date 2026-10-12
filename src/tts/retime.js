// Deterministic pacing for narrated stories: each message's bubble appears when
// its voice line starts, and the next message waits until the line finishes.
// Pure functions, so they are easy to test.

export const NARRATION_TIMING = Object.freeze({
  leadMs: 150, // bubble appears this long before its voice line starts (lets the sound cue land first)
  pauseMs: 450, // silence between one line finishing and the next bubble
  minGapMs: 800, // never reveal two bubbles closer together than this
  tailHoldMs: 2000, // the last line stays on screen this long after it finishes
  maxDurationSeconds: 180, // the story schema's ceiling
});

/**
 * @param {object} story  normalized story (messages in reveal order)
 * @param {Map<string, number>} clipMs  message id -> spoken clip length in ms (absent or 0 = silent)
 * @returns {{ story: object, timeline: object[] }}  story with retimed messages and durationSeconds;
 *          timeline lists each message's reveal and voice start/end (ms).
 */
export function retimeForNarration(story, clipMs, timing = NARRATION_TIMING) {
  const msgs = story.messages;
  const timeline = [];
  let t = msgs[0].revealAtMs;
  let lastEnd = 0;
  msgs.forEach((m, i) => {
    const d = clipMs.get(m.id) || 0;
    const reveal = Math.round(t);
    const startMs = d ? reveal + timing.leadMs : null;
    const endMs = d ? reveal + timing.leadMs + d : null;
    timeline.push({ messageId: m.id, revealMs: reveal, startMs, endMs, durationMs: d });
    lastEnd = Math.max(lastEnd, endMs ?? reveal);
    const nextOriginalGap = i < msgs.length - 1 ? msgs[i + 1].revealAtMs - m.revealAtMs : 0;
    if (d) {
      t = Math.max(endMs + timing.pauseMs, reveal + timing.minGapMs);
    } else {
      // Silent messages keep their authored reading time, with the minimum gap as a floor.
      t = reveal + Math.max(timing.minGapMs, nextOriginalGap);
    }
  });

  const needed = lastEnd + timing.tailHoldMs;
  const durationMs = Math.max(Math.round(story.durationSeconds * 1000), Math.ceil(needed / 100) * 100);
  if (durationMs > timing.maxDurationSeconds * 1000) {
    throw new Error(`narrated story would run ${Math.round(durationMs / 1000)} s, over the ${timing.maxDurationSeconds} s limit; shorten the lines`);
  }
  const retimed = structuredClone(story);
  retimed.durationSeconds = durationMs / 1000;
  timeline.forEach((row, i) => {
    retimed.messages[i].revealAtMs = row.revealMs;
  });
  return { story: retimed, timeline };
}

/** Which narration line each message gets: null for silent messages. */
export function planNarration(story, { defaultVoice, defaultSpeed }) {
  const contacts = new Map(story.contacts.map((c) => [c.id, c]));
  const localId = story.localUser.id;
  return story.messages.map((m) => {
    if (m.narration === false) return { id: m.id, voice: null, speed: null, text: null };
    const sender = m.senderId === localId ? story.localUser : contacts.get(m.senderId);
    const voice = sender?.voice ?? story.narration?.voice ?? defaultVoice;
    const speed = story.narration?.speed ?? defaultSpeed;
    const text = typeof m.narration === 'string' ? m.narration : m.text;
    return { id: m.id, voice, speed, text };
  });
}

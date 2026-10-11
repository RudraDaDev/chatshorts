// Viewport controller: a pure function of time. It decides which messages are
// drawn, where the conversation is scrolled, and which entrance animation is
// active at any instant. Future messages can never be drawn because the state
// only counts messages whose reveal time has passed.

import { METRICS } from '../../templates/imessage/theme.js';

const easeOutCubic = (p) => 1 - Math.pow(1 - p, 3);

/** Scroll offset that keeps the newest visible bubble above the input bar. */
export function scrollTargetFor(conv, visibleCount, viewportH, metrics = METRICS) {
  if (visibleCount <= 0) return 0;
  const newest = conv.items[visibleCount - 1];
  const wanted = newest.bottom - (viewportH - metrics.viewportBottomMarginPx);
  const maxScroll = Math.max(0, conv.contentHeight - viewportH);
  return Math.max(0, Math.min(maxScroll, wanted));
}

/** Scroll "events" for a conversation: one per message, at its reveal time. */
export function scrollEvents(conv, viewportH, metrics = METRICS) {
  return conv.items.map((it, k) => ({ t: it.reveal, to: scrollTargetFor(conv, k + 1, viewportH, metrics) }));
}

function evalAnim(s, t, durationMs) {
  if (t >= s.start + durationMs) return s.to;
  const p = Math.max(0, Math.min(1, (t - s.start) / durationMs));
  return s.from + (s.to - s.from) * easeOutCubic(p);
}

/** Scroll offset of one conversation at time t (ms), animating between events. */
export function scrollAt(events, t, durationMs = METRICS.scrollMs) {
  let anim = { start: -Infinity, from: 0, to: 0 };
  for (const ev of events) {
    if (ev.t > t) break;
    const from = evalAnim(anim, ev.t, durationMs);
    anim = { start: ev.t, from, to: ev.to };
  }
  return evalAnim(anim, t, durationMs);
}

/**
 * Visual state at time t (ms).
 * The active conversation is the one holding the most recent revealed message.
 */
export function stateAt(layout, t, metrics = METRICS) {
  const { messages, eventsByConv, fallbackConvId } = layout;
  let last = null;
  for (const ref of messages) {
    if (ref.reveal > t) break;
    last = ref;
  }
  const convId = last ? last.convId : fallbackConvId;
  let visibleCount = 0;
  for (const ref of messages) {
    if (ref.reveal > t) break;
    if (ref.convId === convId) visibleCount += 1;
  }
  const scrollY = Math.round(scrollAt(eventsByConv[convId], t, metrics.scrollMs));
  let enter = null;
  if (last && t - last.reveal < metrics.enterMs) {
    const p = easeOutCubic((t - last.reveal) / metrics.enterMs);
    enter = { index: last.indexInConv, progress: Math.round(p * 20) / 20 };
  }
  return { convId, visibleCount, scrollY, enter };
}

/** Stable key for a state; equal keys render the same pixels. */
export function stateKey(state) {
  return `${state.convId}|${state.visibleCount}|${state.scrollY}|${state.enter ? `${state.enter.index}:${state.enter.progress}` : '-'}`;
}

/**
 * Build the frame-by-frame timeline, collapsed into runs of identical states.
 * Each run becomes one rendered still held for `frames` frames.
 */
export function buildTimeline(layout, { fps, durationMs }, metrics = METRICS) {
  const totalFrames = Math.round((durationMs * fps) / 1000);
  const runs = [];
  for (let f = 0; f < totalFrames; f++) {
    const t = (f * 1000) / fps;
    const state = stateAt(layout, t, metrics);
    const key = stateKey(state);
    const last = runs[runs.length - 1];
    if (last && last.key === key) {
      last.frames += 1;
    } else {
      runs.push({ key, state: publicState(state), frames: 1, startFrame: f });
    }
  }
  return { fps, durationMs, totalFrames, runs };
}

function publicState(state) {
  return { convId: state.convId, visibleCount: state.visibleCount, scrollY: state.scrollY, enter: state.enter };
}

/**
 * Index messages globally by reveal time and precompute per-conversation scroll events.
 * Plain JSON-serializable data, so it can be written to layout.json and read back.
 */
export function buildLayoutIndex(conversations, messages, viewportH, metrics = METRICS) {
  const counters = new Map();
  const refs = messages.map((m, order) => {
    const idx = counters.get(m.convId) ?? 0;
    counters.set(m.convId, idx + 1);
    return { order, reveal: m.revealAtMs, convId: m.convId, indexInConv: idx };
  });
  refs.sort((a, b) => a.reveal - b.reveal || a.order - b.order);
  const eventsByConv = {};
  for (const c of conversations) eventsByConv[c.id] = scrollEvents(c, viewportH, metrics);
  return {
    messages: refs,
    eventsByConv,
    fallbackConvId: refs.length ? refs[0].convId : conversations[0].id,
  };
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateStory } from '../src/stories/validate.js';
import { resolveContacts, resolveConversations } from '../src/contacts/model.js';
import { layoutConversation } from '../src/layout/conversation.js';
import { buildLayoutIndex, buildTimeline, scrollTargetFor, stateAt } from '../src/layout/viewport.js';
import { METRICS, frameFor, viewportHeightFor } from '../templates/imessage/theme.js';
import { readExample, ROOT } from './helpers.js';

// Build the full index with fabricated measurements (2 lines per bubble) so the
// viewport logic can be tested without a browser.
function buildIndex(story) {
  const contacts = resolveContacts(story, ROOT);
  const convs = resolveConversations(story, contacts);
  const frame = frameFor({ width: 1080, height: 1920, hasBackground: false });
  const viewportH = viewportHeightFor(frame);
  const laid = convs.map((conv) => {
    const msgs = story.messages.filter((m) => m.conversationId === conv.id);
    return layoutConversation({
      conv, messages: msgs, contacts, localId: story.localUser.id,
      measures: msgs.map(() => ({ width: 500, height: 116, lines: 2 })), metrics: METRICS, frame,
    });
  });
  const index = buildLayoutIndex(laid, story.messages.map((m) => ({ convId: m.conversationId, revealAtMs: m.revealAtMs, id: m.id })), viewportH);
  return { laid, index, viewportH };
}

const { story } = validateStory(readExample(), { storyDir: `${ROOT}/stories/examples` });
const { index, laid, viewportH } = buildIndex(story);
const durationMs = story.durationSeconds * 1000;

test('a future message is never counted as visible before its reveal time', () => {
  for (let t = 0; t <= durationMs; t += 7) {
    const s = stateAt(index, t);
    const revealed = story.messages.filter((m) => m.revealAtMs <= t && m.conversationId === s.convId).length;
    assert.equal(s.visibleCount, revealed, `t=${t}`);
  }
});

test('each message appears exactly at its reveal time (frame-accurate)', () => {
  const fps = 30;
  const timeline = buildTimeline(index, { fps, durationMs });
  for (const m of story.messages) {
    const firstFrame = Math.ceil((m.revealAtMs * fps) / 1000);
    const before = stateAt(index, (firstFrame - 1) * 1000 / fps);
    const at = stateAt(index, (firstFrame * 1000) / fps);
    assert.ok(at.visibleCount >= 1);
    if (firstFrame > 0) {
      // Right before the reveal frame, the message is not drawn (it is either in another thread or not yet counted).
      const convCount = (state) => (state.convId === m.conversationId ? state.visibleCount : -1);
      assert.ok(convCount(before) < convCount(at) || before.convId !== m.conversationId, `message ${m.id} visible too early`);
    }
  }
  assert.equal(timeline.totalFrames, durationMs * fps / 1000);
});

test('timeline runs cover every frame exactly once, in order', () => {
  const timeline = buildTimeline(index, { fps: 30, durationMs });
  const total = timeline.runs.reduce((n, r) => n + r.frames, 0);
  assert.equal(total, timeline.totalFrames);
  let expectedStart = 0;
  for (const r of timeline.runs) {
    assert.equal(r.startFrame, expectedStart);
    expectedStart += r.frames;
  }
});

test('scroll is zero while the conversation fits, and grows once it overflows', () => {
  const dm = laid.find((c) => c.id === 'maya-thread');
  assert.equal(scrollTargetFor(dm, 1, viewportH), 0);
  const full = scrollTargetFor(dm, dm.items.length, viewportH);
  assert.ok(full > 0, 'eight messages of two lines overflow the viewport');
  assert.ok(full <= Math.max(0, dm.contentHeight - viewportH));
});

test('newest bubble stays above the input bar after each reveal', () => {
  for (const conv of laid) {
    for (let k = 1; k <= conv.items.length; k++) {
      const scroll = scrollTargetFor(conv, k, viewportH);
      const newest = conv.items[k - 1];
      const screenBottom = newest.bottom - scroll;
      assert.ok(screenBottom <= viewportH, `${conv.id} item ${k} hidden below the input bar`);
    }
  }
});

test('scroll position is non-decreasing over time within a conversation', () => {
  const timeline = buildTimeline(index, { fps: 30, durationMs });
  let last = { convId: null, scrollY: 0 };
  for (const r of timeline.runs) {
    if (r.state.convId === last.convId) assert.ok(r.state.scrollY >= last.scrollY, 'scrolled backwards');
    last = { convId: r.state.convId, scrollY: r.state.scrollY };
  }
});

test('entrance animation is only active for the newest message, and ends', () => {
  const after = stateAt(index, story.messages[3].revealAtMs + METRICS.enterMs + 10);
  assert.equal(after.enter, null);
  const during = stateAt(index, story.messages[3].revealAtMs + 5);
  assert.ok(during.enter && during.enter.progress >= 0 && during.enter.progress <= 1);
});

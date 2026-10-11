import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateStory } from '../src/stories/validate.js';
import { resolveContacts, resolveConversations } from '../src/contacts/model.js';
import { layoutConversation } from '../src/layout/conversation.js';
import { groupFlags, bubbleRadii } from '../src/layout/bubbles.js';
import { METRICS, frameFor, viewportHeightFor } from '../templates/imessage/theme.js';
import { miniStory, ROOT } from './helpers.js';

// Measurements here are fabricated; the real measurements come from Chromium
// (see test/browser.test.js). This test only covers the geometry rules.
function setup() {
  const { story } = validateStory(miniStory(), { storyDir: ROOT });
  const contacts = resolveContacts(story, ROOT);
  const convs = resolveConversations(story, contacts);
  const frame = frameFor({ width: 1080, height: 1920, hasBackground: false });
  return { story, contacts, convs, frame };
}

test('grouping: same sender without a timestamp forms a group', () => {
  const msgs = [
    { senderId: 'ben' }, { senderId: 'ben' }, { senderId: 'ann', timestamp: 'x' }, { senderId: 'ann' },
  ];
  const f = groupFlags(msgs);
  assert.deepEqual(f.map((x) => x.sameAsPrev), [false, true, false, true]);
  assert.deepEqual(f.map((x) => x.sameAsNext), [true, false, true, false]);
});

test('bubble corners: tail only on the last bubble of a group', () => {
  const r = bubbleRadii({ side: 'left', sameAsPrev: false, sameAsNext: true }, METRICS);
  assert.equal(r[3], METRICS.groupCornerPx);
  const last = bubbleRadii({ side: 'left', sameAsPrev: true, sameAsNext: false }, METRICS);
  assert.equal(last[3], METRICS.tailCornerPx);
  assert.equal(last[0], METRICS.groupCornerPx);
});

test('direct messages: right for local user, left for others, no name labels', () => {
  const { story, contacts, convs, frame } = setup();
  const msgs = story.messages.filter((m) => m.conversationId === 'dm');
  const measures = msgs.map(() => ({ width: 200, height: 58, lines: 1 }));
  const conv = layoutConversation({ conv: convs[0], messages: msgs, contacts, localId: 'me', measures, metrics: METRICS, frame });
  assert.equal(conv.items[0].side, 'left');
  assert.equal(conv.items[1].side, 'right');
  assert.equal(conv.items[1].x + conv.items[1].width, frame.w - METRICS.sidePadPx);
  assert.equal(conv.items.every((i) => i.name === null), true);
  assert.equal(conv.leftInset, 0);
});

test('group messages: names and avatars only where they belong', () => {
  const { story, contacts, convs, frame } = setup();
  const msgs = story.messages.filter((m) => m.conversationId === 'group');
  const measures = msgs.map(() => ({ width: 200, height: 58, lines: 1 }));
  const conv = layoutConversation({ conv: convs[1], messages: msgs, contacts, localId: 'me', measures, metrics: METRICS, frame });
  const [g1, g2, g3, g4] = conv.items;
  assert.equal(g1.name.text, 'Ben');
  assert.equal(g2.name, null, 'second bubble of a group has no name label');
  assert.ok(g1.avatar === null, 'first bubble of a group has no avatar');
  assert.ok(g2.avatar, 'avatar sits on the last bubble of a group');
  assert.equal(g3.timestamp.text, 'Later');
  assert.equal(g3.name.text, 'Ann', 'timestamp breaks the group, so the name shows again');
  assert.ok(g3.avatar, 'single-bubble group gets an avatar');
  assert.equal(g4.side, 'right');
  assert.ok(g2.y - (g1.y + g1.height) === METRICS.groupGapPx);
});

test('vertical positions never overlap and content height covers every bubble', () => {
  const { story, contacts, convs, frame } = setup();
  const msgs = story.messages.filter((m) => m.conversationId === 'group');
  const measures = msgs.map((m, i) => ({ width: 300 + i * 40, height: 58 * (1 + (i % 2)), lines: 1 + (i % 2) }));
  const conv = layoutConversation({ conv: convs[1], messages: msgs, contacts, localId: 'me', measures, metrics: METRICS, frame });
  for (let i = 1; i < conv.items.length; i++) {
    assert.ok(conv.items[i].y >= conv.items[i - 1].bottom, `item ${i} overlaps previous`);
  }
  assert.ok(conv.contentHeight >= conv.items.at(-1).bottom);
});

test('frame geometry: inset card for backgrounds, full screen otherwise', () => {
  const full = frameFor({ width: 1080, height: 1920, hasBackground: false });
  assert.deepEqual([full.x, full.y, full.w, full.h], [0, 0, 1080, 1920]);
  const card = frameFor({ width: 1080, height: 1920, hasBackground: true });
  assert.ok(card.x > 0 && card.y > 0 && card.w < 1080 && card.h < 1920);
  assert.ok(viewportHeightFor(full) > 1000);
});

// Story -> full layout: measures every message in Chromium, then computes
// bubble geometry and the viewport index. Output is JSON-serializable.

import { METRICS, THEMES, bubbleMaxTextWidth, frameFor, viewportHeightFor } from '../../templates/imessage/theme.js';
import { layoutConversation } from './conversation.js';
import { buildLayoutIndex } from './viewport.js';
import { measureTexts } from './measure-text.js';

/** Style-only configuration (no conversations yet). Needed before measuring text. */
export function styleFor({ story, canvas, hasBackground = false }) {
  const frame = frameFor({ ...canvas, hasBackground });
  return {
    metrics: METRICS,
    theme: THEMES[story.appearance],
    frame,
    viewportH: viewportHeightFor(frame),
    conversations: [],
  };
}

/**
 * @param {object} args
 * @param {object} args.story       validated, normalized story
 * @param {Map} args.contacts       resolved contacts (contacts/model.js)
 * @param {object[]} args.conversations  resolved conversations (contacts/model.js)
 * @param {import('puppeteer-core').Page} args.page  chat page configured with styleFor()
 * @param {{width:number,height:number}} args.canvas
 */
export async function buildStoryLayout({ story, contacts, conversations, page, canvas, hasBackground = false }) {
  const metrics = METRICS;
  const frame = frameFor({ ...canvas, hasBackground });
  const viewportH = viewportHeightFor(frame);
  const theme = THEMES[story.appearance];

  const messages = story.messages.filter((m) => conversations.some((c) => c.id === m.conversationId));
  const innerMax = bubbleMaxTextWidth(frame);
  const measures = await measureTexts(page, messages.map((m) => m.text), innerMax);
  const measureById = new Map(messages.map((m, i) => [m.id, measures[i]]));

  const convLayouts = conversations.map((conv) => {
    const convMessages = messages.filter((m) => m.conversationId === conv.id);
    return layoutConversation({
      conv,
      messages: convMessages,
      contacts,
      localId: story.localUser.id,
      measures: convMessages.map((m) => measureById.get(m.id)),
      metrics,
      frame,
    });
  });

  const index = buildLayoutIndex(
    convLayouts,
    messages.map((m) => ({ convId: m.conversationId, revealAtMs: m.revealAtMs, id: m.id })),
    viewportH,
    metrics,
  );

  return {
    canvas,
    frame,
    viewportH,
    metrics,
    theme,
    statusTime: story.statusTime,
    innerMaxTextWidth: innerMax,
    conversations: convLayouts,
    measurements: messages.map((m) => ({ messageId: m.id, ...measureById.get(m.id) })),
    index,
  };
}

/** Payload sent to the browser page via ChatShorts.configure. */
export function browserPayload(layout) {
  return {
    metrics: layout.metrics,
    theme: layout.theme,
    frame: layout.frame,
    viewportH: layout.viewportH,
    conversations: layout.conversations,
  };
}

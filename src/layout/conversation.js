// Computes the position of every bubble in a conversation. Pure function of the
// story, measured text sizes, and metrics. The LLM/story never supplies pixels.

import { bubbleBox, bubbleRadii, groupFlags } from './bubbles.js';

/**
 * @param {object} args
 * @param {object} args.conv        resolved conversation (see contacts/model.js)
 * @param {object[]} args.messages  messages of this conversation, in reveal order
 * @param {Map} args.contacts       id -> resolved contact (avatar, displayName)
 * @param {string} args.localId     local user's id (right-aligned messages)
 * @param {object[]} args.measures  measured text per message (same order as messages)
 * @param {object} args.metrics     METRICS from templates/imessage/theme.js
 * @param {object} args.frame       { w, h } of the chat screen
 */
export function layoutConversation({ conv, messages, contacts, localId, measures, metrics, frame }) {
  const flags = groupFlags(messages);
  const isGroup = conv.type === 'group';
  const leftInset = isGroup ? metrics.avatarSlotPx : 0;
  const leftX = metrics.sidePadPx + leftInset;
  const rightX = frame.w - metrics.sidePadPx;
  const items = [];
  let y = metrics.contentTopPadPx;

  messages.forEach((m, i) => {
    const side = m.senderId === localId ? 'right' : 'left';
    const { sameAsPrev, sameAsNext } = flags[i];
    if (i > 0) y += sameAsPrev ? metrics.groupGapPx : metrics.groupBreakPx;

    let timestamp = null;
    if (m.timestamp !== undefined) {
      timestamp = { text: m.timestamp, y, height: metrics.timestampHeightPx };
      y += metrics.timestampHeightPx;
    }

    let name = null;
    if (side === 'left' && isGroup && !sameAsPrev) {
      name = { text: contacts.get(m.senderId).displayName, x: leftX, y };
      y += metrics.nameHeightPx;
    }

    const box = bubbleBox(measures[i], metrics);
    const x = side === 'right' ? rightX - box.width : leftX;
    const top = y;
    y += box.height;
    const isLastInGroup = !sameAsNext;

    let avatar = null;
    if (side === 'left' && isGroup && isLastInGroup) {
      const c = contacts.get(m.senderId).avatar;
      avatar = {
        x: metrics.sidePadPx,
        y: top + box.height - metrics.avatarSizePx,
        ...c,
      };
    }

    items.push({
      index: i,
      messageId: m.id,
      senderId: m.senderId,
      side,
      text: m.text,
      reveal: m.revealAtMs,
      x,
      y: top,
      width: box.width,
      height: box.height,
      textWidth: box.textWidth,
      textHeight: box.textHeight,
      lines: box.lines,
      radii: bubbleRadii({ side, sameAsPrev, sameAsNext }, metrics),
      name,
      timestamp,
      avatar,
      bottom: top + box.height,
    });
  });

  const contentHeight = y + metrics.contentBottomPadPx;
  return {
    id: conv.id,
    type: conv.type,
    header: conv.header,
    leftInset,
    contentHeight,
    items,
  };
}

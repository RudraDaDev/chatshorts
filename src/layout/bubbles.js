// Pure helpers for bubble grouping and corner shapes. No browser needed.

/** Messages from the same sender, with no timestamp row in between, form a group. */
export function groupFlags(messages) {
  return messages.map((m, i) => {
    const prev = messages[i - 1];
    const next = messages[i + 1];
    return {
      sameAsPrev: Boolean(prev) && prev.senderId === m.senderId && m.timestamp === undefined,
      sameAsNext: Boolean(next) && next.senderId === m.senderId && next.timestamp === undefined,
    };
  });
}

/**
 * iMessage-like corners: the edge a bubble shares with the screen margin keeps
 * full rounding; joins inside a group get small corners; the last bubble of a
 * group gets a small "tail" corner.
 * Returns [topLeft, topRight, bottomRight, bottomLeft].
 */
export function bubbleRadii({ side, sameAsPrev, sameAsNext }, m) {
  const R = m.bubbleRadiusPx;
  const G = m.groupCornerPx;
  const T = m.tailCornerPx;
  if (side === 'right') {
    return [R, sameAsPrev ? G : R, sameAsNext ? G : T, R];
  }
  return [sameAsPrev ? G : R, R, R, sameAsNext ? G : T];
}

/** Bubble box from a measured text box (measured by Chromium) and padding. */
export function bubbleBox(measure, metrics) {
  const textHeight = measure.lines * metrics.bubbleLineHeightPx;
  return {
    textWidth: measure.width,
    textHeight,
    lines: measure.lines,
    width: measure.width + metrics.bubblePadX * 2,
    height: textHeight + metrics.bubblePadY * 2,
  };
}

// Shared design tokens and layout metrics for the iMessage-style theme.
// Used by both the Node layout engine (positions, measurement) and the
// browser page (CSS variables), so the two can never drift apart.

export const METRICS = Object.freeze({
  fontFamily: "'ChatShortsInter', 'Inter', 'Helvetica Neue', Arial, sans-serif",
  bubbleFontPx: 46,
  bubbleLineHeightPx: 58,
  bubblePadX: 30,
  bubblePadY: 18,
  bubbleMaxRatio: 0.74, // max bubble text width as a fraction of the screen content width
  sidePadPx: 34,
  groupGapPx: 8, // vertical gap between bubbles of the same sender
  groupBreakPx: 30, // vertical gap between sender groups
  nameFontPx: 30,
  nameHeightPx: 40,
  timestampFontPx: 34,
  timestampHeightPx: 72,
  avatarSizePx: 76,
  avatarSlotPx: 92, // horizontal space reserved for avatars on the left
  headerAvatarPx: 120,
  statusBarPx: 96,
  headerPx: 262,
  inputBarPx: 150,
  contentTopPadPx: 30,
  contentBottomPadPx: 40,
  viewportBottomMarginPx: 44, // gap kept between newest bubble and the input bar
  scrollMs: 380, // duration of the eased scroll after each reveal
  enterMs: 240, // duration of the fade/slide-in of a newly revealed bubble
  bubbleRadiusPx: 40,
  groupCornerPx: 12,
  tailCornerPx: 6,
});

export const THEMES = Object.freeze({
  dark: {
    screenBg: '#000000',
    recvBubble: '#26262A',
    recvText: '#FFFFFF',
    sendBubble: '#0A84FF',
    sendText: '#FFFFFF',
    headerText: '#FFFFFF',
    subText: '#8E8E93',
    divider: '#1C1C1E',
    inputBg: '#000000',
    inputField: '#1C1C1E',
    inputBorder: '#3A3A3C',
    placeholder: '#8E8E93',
  },
  light: {
    screenBg: '#FFFFFF',
    recvBubble: '#E9E9EB',
    recvText: '#000000',
    sendBubble: '#0A84FF',
    sendText: '#FFFFFF',
    headerText: '#000000',
    subText: '#8E8E93',
    divider: '#E5E5EA',
    inputBg: '#FFFFFF',
    inputField: '#FFFFFF',
    inputBorder: '#C7C7CC',
    placeholder: '#8E8E93',
  },
});

/**
 * Where the phone-like chat "screen" sits on the output canvas.
 * Without a background video the screen fills the canvas; with one it is an
 * inset card so the footage is visible around it.
 */
export function frameFor({ width, height, hasBackground }) {
  if (!hasBackground) {
    return { x: 0, y: 0, w: width, h: height, radius: 0 };
  }
  const inset = Math.round(width * 0.037); // ~40px at 1080 wide
  const insetY = Math.round(height * 0.073); // ~140px at 1920 tall
  return {
    x: inset,
    y: insetY,
    w: width - inset * 2,
    h: height - insetY * 2,
    radius: Math.round(width * 0.052),
  };
}

export function viewportHeightFor(frame) {
  return frame.h - METRICS.statusBarPx - METRICS.headerPx - METRICS.inputBarPx;
}

export function bubbleMaxTextWidth(frame) {
  const screenContent = frame.w - METRICS.sidePadPx * 2;
  return Math.floor(screenContent * METRICS.bubbleMaxRatio) - METRICS.bubblePadX * 2;
}

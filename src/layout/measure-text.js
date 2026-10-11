// Text measurement runs inside Chromium so widths and wrapping come from the
// same font, weight, size, and line-height that the renderer uses.
// Bubble widths are never estimated from character counts.

/**
 * @param {import('puppeteer-core').Page} page  a page loaded from templates/imessage/chat.html
 * @param {string[]} texts
 * @param {number} innerMaxWidth  max text width (bubble width minus horizontal padding)
 * @returns {Promise<{width:number,height:number,lines:number}[]>}
 */
export async function measureTexts(page, texts, innerMaxWidth) {
  return page.evaluate(
    (list, max) => window.ChatShorts.measure(list, max),
    texts,
    innerMaxWidth,
  );
}

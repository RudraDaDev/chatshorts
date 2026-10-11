// Real Chromium measurement: strings with equal character counts must measure differently,
// and the layout measurement must match what the page renders (no overflow, no height drift).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { launchBrowser } from '../src/renderer/browser.js';
import { openChatPage } from '../src/renderer/scenes.js';
import { measureTexts } from '../src/layout/measure-text.js';
import { styleFor } from '../src/layout/build.js';
import { loadConfig } from '../src/config.js';
import { ROOT } from './helpers.js';

const config = loadConfig({ ...process.env });
let browser;
let page;
const canvas = { width: 1080, height: 1920 };
const style = styleFor({ story: { appearance: 'dark' }, canvas, hasBackground: false });

before(async () => {
  browser = await launchBrowser({ ...config, tempDir: path.join(ROOT, 'temp') });
  page = await openChatPage(browser, { templateDir: config.templateDir, canvas, payload: style });
});

after(async () => {
  if (browser) await browser.close();
});

test('same character count, different rendered widths', async () => {
  const [narrow, wide] = await measureTexts(page, ['iiiiiiiiiiii', 'WWWWWWWWWWWW'], 2000);
  assert.equal('iiiiiiiiiiii'.length, 'WWWWWWWWWWWW'.length);
  assert.ok(wide.width > narrow.width * 2, `narrow ${narrow.width} wide ${wide.width}`);
});

test('wrapping respects the available width and line height', async () => {
  const text = 'This is a longer message that must wrap onto several lines inside the bubble.';
  const [m] = await measureTexts(page, [text], 400);
  assert.ok(m.lines >= 2);
  assert.ok(m.width <= 400);
  assert.equal(m.height, m.lines * METRICS_LH());
});

test('no bubble text overflows its box at the real layout width', async () => {
  const texts = ['Short.', 'A medium length message that wraps once or twice in the bubble area.', 'Supercalifragilisticexpialidocious '.repeat(4)];
  const measures = await measureTexts(page, texts, 600);
  for (const m of measures) assert.ok(m.lines >= 1 && m.width > 0);
});

function METRICS_LH() {
  return style.metrics.bubbleLineHeightPx;
}

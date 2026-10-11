import fs from 'node:fs';
import path from 'node:path';
import { chatPageUrl } from './browser.js';

/**
 * Open the chat template in a page sized to the output canvas and configure it.
 * `payload` = { metrics, theme, frame, viewportH, conversations }.
 */
export async function openChatPage(browser, { templateDir, canvas, payload }) {
  const page = await browser.newPage();
  await page.setViewport({ width: canvas.width, height: canvas.height, deviceScaleFactor: 1 });
  await page.goto(chatPageUrl(templateDir), { waitUntil: 'load' });
  await configurePage(page, payload);
  return page;
}

export async function configurePage(page, payload) {
  const ok = await page.evaluate((p) => window.ChatShorts.configure(p).then((r) => r.ok), payload);
  if (!ok) throw new Error('chat page failed to configure');
}

/**
 * Render one PNG per distinct visual state and verify each state in the DOM.
 * Identical states reuse one PNG. `sequence` lists files in timeline order,
 * which is what the FFmpeg concat list needs.
 * @returns {{ sequence: {file:string, frames:number}[], stills: number, issues: object[] }}
 */
export async function renderStates({ page, timeline, framesDir, transparent }) {
  fs.mkdirSync(framesDir, { recursive: true });
  const fileByKey = new Map();
  const sequence = [];
  const issues = [];
  for (const run of timeline.runs) {
    let file = fileByKey.get(run.key);
    if (!file) {
      file = path.join(framesDir, `still-${String(fileByKey.size + 1).padStart(4, '0')}.png`);
      await page.evaluate((state) => window.ChatShorts.setState(state), run.state);
      const check = await page.evaluate((state) => window.ChatShorts.verify(state), run.state);
      if (!check.ok) issues.push({ startFrame: run.startFrame, state: run.state, issues: check.issues });
      await page.screenshot({ path: file, type: 'png', omitBackground: transparent });
      fileByKey.set(run.key, file);
    }
    const last = sequence[sequence.length - 1];
    if (last && last.file === file) last.frames += run.frames;
    else sequence.push({ file, frames: run.frames });
  }
  return { sequence, stills: fileByKey.size, issues };
}

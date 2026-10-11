import { test } from 'node:test';
import assert from 'node:assert/strict';
import { METRICS } from '../templates/imessage/theme.js';
import { bubbleBox } from '../src/layout/bubbles.js';

test('bubble box is derived from measured lines, not character counts', () => {
  const box = bubbleBox({ width: 320, height: 116, lines: 2 }, METRICS);
  assert.equal(box.textHeight, 2 * METRICS.bubbleLineHeightPx);
  assert.equal(box.height, box.textHeight + METRICS.bubblePadY * 2);
  assert.equal(box.width, 320 + METRICS.bubblePadX * 2);
});

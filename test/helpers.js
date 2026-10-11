import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

export const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
export const EXAMPLE = path.join(ROOT, 'stories/examples/someone-using-my-number.json');

export function readExample() {
  return JSON.parse(fs.readFileSync(EXAMPLE, 'utf8'));
}

/** A small, self-contained story used by unit tests. */
export function miniStory(overrides = {}) {
  return {
    title: 'Mini',
    durationSeconds: 20,
    contacts: [
      { id: 'ann', displayName: 'Ann' },
      { id: 'ben', displayName: 'Ben' },
    ],
    conversations: [
      { id: 'dm', type: 'direct', participants: ['ann'], title: 'Ann' },
      { id: 'group', type: 'group', participants: ['ann', 'ben'], title: 'Friends' },
    ],
    messages: [
      { id: 'a1', conversationId: 'dm', senderId: 'ann', text: 'Hi', revealAtMs: 1000 },
      { id: 'a2', conversationId: 'dm', senderId: 'me', text: 'Hello there', revealAtMs: 2000 },
      { id: 'g1', conversationId: 'group', senderId: 'ben', text: 'One', revealAtMs: 3000 },
      { id: 'g2', conversationId: 'group', senderId: 'ben', text: 'Two', revealAtMs: 3300 },
      { id: 'g3', conversationId: 'group', senderId: 'ann', text: 'Three', revealAtMs: 3600, timestamp: 'Later' },
      { id: 'g4', conversationId: 'group', senderId: 'me', text: 'Four', revealAtMs: 4200 },
    ],
    ...overrides,
  };
}

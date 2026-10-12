import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateStory } from '../src/stories/validate.js';
import { miniStory, readExample, ROOT } from './helpers.js';

const dir = ROOT;

test('example story is valid with no warnings', () => {
  const r = validateStory(readExample(), { storyDir: `${ROOT}/stories/examples` });
  assert.equal(r.ok, true, r.errors.join('\n'));
  assert.deepEqual(r.warnings, []);
  assert.equal(r.story.localUser.id, 'me');
  assert.equal(r.story.audio.sfx, true);
});

test('mini story is valid', () => {
  const r = validateStory(miniStory(), { storyDir: dir });
  assert.equal(r.ok, true, r.errors.join('\n'));
});

test('unknown sender is rejected', () => {
  const s = miniStory();
  s.messages[0].senderId = 'zed';
  const r = validateStory(s, { storyDir: dir });
  assert.equal(r.ok, false);
  assert.match(r.errors.join('\n'), /unknown sender "zed"/);
});

test('sender who is not a participant of the conversation is rejected', () => {
  const s = miniStory();
  s.messages[0].senderId = 'ben'; // ben is not in the direct thread
  const r = validateStory(s, { storyDir: dir });
  assert.match(r.errors.join('\n'), /"ben" is not a participant/);
});

test('unknown conversation is rejected', () => {
  const s = miniStory();
  s.messages[1].conversationId = 'nope';
  const r = validateStory(s, { storyDir: dir });
  assert.match(r.errors.join('\n'), /unknown conversation "nope"/);
});

test('out-of-order reveal times are rejected', () => {
  const s = miniStory();
  s.messages[2].revealAtMs = 1500;
  const r = validateStory(s, { storyDir: dir });
  assert.match(r.errors.join('\n'), /reveal order/);
});

test('duplicate message ids are rejected', () => {
  const s = miniStory();
  s.messages[1].id = 'a1';
  const r = validateStory(s, { storyDir: dir });
  assert.match(r.errors.join('\n'), /duplicate message id "a1"/);
});

test('last message must leave time to read before the video ends', () => {
  const s = miniStory({ durationSeconds: 10 });
  s.messages[5].revealAtMs = 9000;
  const r = validateStory(s, { storyDir: dir });
  assert.match(r.errors.join('\n'), /leaving less than 1500ms/);
});

test('direct conversations need exactly one other participant', () => {
  const s = miniStory();
  s.conversations[0].participants = ['ann', 'ben'];
  const r = validateStory(s, { storyDir: dir });
  assert.match(r.errors.join('\n'), /must have exactly one other participant/);
});

test('missing avatar file is reported as a missing asset', () => {
  const s = miniStory();
  s.contacts[0].avatar = 'assets/avatars/nobody.png';
  const r = validateStory(s, { storyDir: dir });
  assert.match(r.errors.join('\n'), /avatar not found/);
});

test('schema violations are reported with the offending path', () => {
  const s = miniStory();
  s.messages[0].mood = 'happy';
  const r = validateStory(s, { storyDir: dir });
  assert.equal(r.ok, false);
  assert.match(r.errors.join('\n'), /additionalProperties|mood/);
});

test('named sound cues are accepted; unknown or prototype names are rejected', () => {
  const ok = miniStory();
  ok.messages[0].sound = 'boom';
  assert.equal(validateStory(ok, { storyDir: dir }).ok, true);
  const bad = miniStory();
  bad.messages[0].sound = 'airhorn';
  assert.match(validateStory(bad, { storyDir: dir }).errors.join('\n'), /unknown sound "airhorn"/);
  const proto = miniStory();
  proto.messages[0].sound = 'toString';
  assert.match(validateStory(proto, { storyDir: dir }).errors.join('\n'), /unknown sound "toString"/);
});

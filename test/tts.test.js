import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { retimeForNarration, planNarration, NARRATION_TIMING } from '../src/tts/retime.js';
import { ENGLISH_VOICES, voiceAccent } from '../src/tts/voices.js';
import { tidyClip } from '../src/tts/clips.js';
import { buildAudioPlan } from '../src/audio/mix.js';
import { KokoroEngine } from '../src/tts/engine.js';
import { validateStory } from '../src/stories/validate.js';

const base = () => ({
  title: 'T', durationSeconds: 20,
  localUser: { id: 'me', displayName: 'Me', voice: 'af_sky' },
  contacts: [{ id: 'leo', displayName: 'Leo', voice: 'am_liam' }],
  conversations: [{ id: 'c1', type: 'direct', participants: ['leo'], title: 'Leo' }],
  messages: [
    { id: 'm1', conversationId: 'c1', senderId: 'leo', text: 'Hi there.', revealAtMs: 600 },
    { id: 'm2', conversationId: 'c1', senderId: 'me', text: 'Hello.', revealAtMs: 2400 },
    { id: 'm3', conversationId: 'c1', senderId: 'leo', text: 'Silent one.', revealAtMs: 4200, narration: false },
  ],
});

describe('retimeForNarration', () => {
  test('voiced lines set the next reveal: start lead, clip, pause', () => {
    const story = base();
    const { story: timed, timeline } = retimeForNarration(story, new Map([['m1', 2000], ['m2', 1000]]), NARRATION_TIMING);
    const { leadMs, pauseMs } = NARRATION_TIMING;
    assert.equal(timeline[0].revealMs, 600);
    assert.equal(timeline[0].startMs, 600 + leadMs);
    assert.equal(timeline[0].endMs, 600 + leadMs + 2000);
    assert.equal(timeline[1].revealMs, 600 + leadMs + 2000 + pauseMs);
    assert.equal(timed.messages[1].revealAtMs, timeline[1].revealMs);
  });

  test('never reveals two bubbles closer than the minimum gap', () => {
    const { timeline } = retimeForNarration(base(), new Map([['m1', 100], ['m2', 100]]));
    assert.ok(timeline[1].revealMs - timeline[0].revealMs >= NARRATION_TIMING.minGapMs);
  });

  test('silent message keeps its authored gap as the reading time', () => {
    const { timeline } = retimeForNarration(base(), new Map([['m1', 500], ['m2', 500]]));
    // m2 is at index 1 and has a voice line; m3 (silent) follows it.
    assert.equal(timeline[2].durationMs, 0);
    assert.equal(timeline[2].startMs, null);
  });

  test('duration grows to hold the last line, rounded to 100 ms', () => {
    const story = base();
    story.durationSeconds = 10;
    const { story: timed, timeline } = retimeForNarration(story, new Map([['m1', 9000]]));
    const lastEnd = timeline.reduce((m, r) => Math.max(m, r.endMs ?? r.revealMs), 0);
    assert.equal(timed.durationSeconds * 1000 % 100, 0);
    assert.ok(timed.durationSeconds * 1000 >= lastEnd + NARRATION_TIMING.tailHoldMs);
  });

  test('retimed story still passes the validator', () => {
    const { story: timed } = retimeForNarration(base(), new Map([['m1', 1500], ['m2', 1500]]));
    const result = validateStory(timed, { storyDir: process.cwd() });
    assert.equal(result.ok, true, result.errors.join('; '));
  });

  test('rejects stories that would exceed the length limit', () => {
    assert.throws(() => retimeForNarration(base(), new Map([['m1', 200000]])), /over the 180 s limit/);
  });
});

describe('planNarration', () => {
  test('uses the sender voice, falls back to the story voice, and skips narration:false', () => {
    const story = base();
    const plan = planNarration(story, { defaultVoice: 'af_heart', defaultSpeed: 1 });
    assert.equal(plan[0].voice, 'am_liam');
    assert.equal(plan[1].voice, 'af_sky');
    assert.equal(plan[2].text, null);
    assert.equal(plan[0].text, 'Hi there.');
  });

  test('narration string overrides the spoken text', () => {
    const story = base();
    story.messages[0].narration = 'Hi, it is me.';
    const plan = planNarration(story, { defaultVoice: 'af_heart', defaultSpeed: 1 });
    assert.equal(plan[0].text, 'Hi, it is me.');
  });
});

describe('voices and audio helpers', () => {
  test('all voices are English and accents resolve from the first letter', () => {
    assert.equal(ENGLISH_VOICES.length, 28);
    assert.equal(voiceAccent('af_heart'), 'a');
    assert.equal(voiceAccent('bm_george'), 'b');
  });

  test('tidyClip peak-normalizes and trims silence', () => {
    const sr = 24000;
    const samples = new Float32Array(sr); // one second of silence with a 0.1 s burst
    for (let i = 10000; i < 12400; i++) samples[i] = 0.2 * Math.sin(i / 5);
    const out = tidyClip(samples, sr);
    const peak = Math.max(...out.map(Math.abs));
    assert.ok(Math.abs(peak - 0.7) < 0.01, `peak ${peak}`);
    assert.ok(out.length < sr * 0.5, `length ${out.length}`);
  });

  test('buildAudioPlan adds one delayed input per narration clip', () => {
    const story = base();
    story.audio = { sfx: false, music: null, musicVolumeDb: -24 };
    const plan = buildAudioPlan({
      story, storyDir: '.', cues: {}, firstInput: 1, durationMs: 10000,
      narration: [{ file: '/a.wav', startMs: 750 }, { file: '/b.wav', startMs: 3000 }],
    });
    assert.equal(plan.events, 2);
    assert.equal(plan.inputs.filter((x) => x.endsWith('.wav')).length, 2);
    assert.ok(plan.parts.some((p) => p.includes('adelay=750|750')));
  });
});

const MODEL_DIR = path.resolve('assets/models/kokoro');
const modelReady = fs.existsSync(path.join(MODEL_DIR, 'model_quantized.onnx'));

describe('KokoroEngine', { skip: modelReady ? false : 'run `node src/cli.js tts-assets` to enable' }, () => {
  test('synthesizes speech-length audio at 24 kHz', async () => {
    const engine = await KokoroEngine.load({ modelDir: MODEL_DIR });
    const { samples, sampleRate } = await engine.synthesize('It is one in the morning.', { voice: 'am_adam', speed: 1 });
    assert.equal(sampleRate, 24000);
    const seconds = samples.length / sampleRate;
    assert.ok(seconds > 1 && seconds < 6, `duration ${seconds}`);
    assert.ok(samples.some((v) => Math.abs(v) > 0.01), 'not silent');
  });
});

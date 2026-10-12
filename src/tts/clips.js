import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { writeWav, wavDurationMs } from './wav.js';

export const MODEL_ID = 'kokoro-82m-q8';
const PEAK_TARGET = 0.7; // about -3 dBFS, so the voice sits well above the music bed
const TRIM_THRESHOLD = 0.02; // about -34 dBFS: silence to trim from each end
const PAD_MS = 60; // breathing room kept at each end after trimming
const FADE_MS = 12;

/** Peak-normalize, trim silence at both ends, and apply short fades (returns a new array). */
export function tidyClip(samples, sampleRate) {
  let peak = 0;
  for (const v of samples) peak = Math.max(peak, Math.abs(v));
  if (peak === 0) return new Float32Array(0);
  const gain = PEAK_TARGET / peak;
  let start = 0;
  let end = samples.length;
  while (start < end && Math.abs(samples[start]) * gain < TRIM_THRESHOLD) start++;
  while (end > start && Math.abs(samples[end - 1]) * gain < TRIM_THRESHOLD) end--;
  const pad = Math.round((PAD_MS / 1000) * sampleRate);
  start = Math.max(0, start - pad);
  end = Math.min(samples.length, end + pad);
  const out = new Float32Array(end - start);
  for (let i = start; i < end; i++) out[i - start] = samples[i] * gain;
  const fade = Math.round((FADE_MS / 1000) * sampleRate);
  for (let i = 0; i < Math.min(fade, out.length); i++) out[i] *= i / fade;
  for (let i = 0; i < Math.min(fade, out.length); i++) out[out.length - 1 - i] *= i / fade;
  return out;
}

export function clipKey({ voice, speed, text }) {
  return crypto.createHash('sha256').update(`${MODEL_ID}|${voice}|${speed}|${text}`).digest('hex').slice(0, 24);
}

/**
 * Synthesize one WAV per spoken line, reusing cached clips when the voice,
 * speed, and text are unchanged.
 * @param {object} args
 * @param {import('./engine.js').KokoroEngine} args.engine
 * @param {{ id: string, voice: string, speed: number, text: string }[]} args.lines
 * @param {string} args.cacheDir
 * @returns {Promise<Map<string, { file: string, durationMs: number, cached: boolean, dropped: string[] }>>}
 */
export async function renderClips({ engine, lines, cacheDir, log }) {
  fs.mkdirSync(cacheDir, { recursive: true });
  const result = new Map();
  for (const line of lines) {
    const file = path.join(cacheDir, `${clipKey(line)}.wav`);
    if (fs.existsSync(file)) {
      result.set(line.id, { file, durationMs: wavDurationMs(file), cached: true, dropped: [] });
      continue;
    }
    const { samples, sampleRate, dropped } = await engine.synthesize(line.text, line);
    const tidy = tidyClip(samples, sampleRate);
    if (tidy.length === 0) throw new Error(`message ${line.id} produced silence`);
    const tmp = `${file}.tmp`;
    writeWav(tmp, tidy, sampleRate);
    fs.renameSync(tmp, file);
    if (dropped.length) log?.warn(`message ${line.id}: skipped ${dropped.length} unsupported symbol(s): ${[...new Set(dropped)].join(' ')}`);
    result.set(line.id, { file, durationMs: wavDurationMs(file), cached: false, dropped });
  }
  return result;
}

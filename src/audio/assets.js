import fs from 'node:fs';
import path from 'node:path';
import { run } from '../renderer/ffmpeg.js';
import { CUES } from './cues.js';

// Sound cues are generated (or trimmed from committed voice sources) with FFmpeg,
// so the project ships no third-party audio. Generated files are written to
// assets/generated/sfx (gitignored) and rebuilt on demand.

/** Expression for the generated background pad (two slightly detuned channels). */
export const MUSIC_PAD_EXPR = [
  '0.16*sin(2*PI*110*t)+0.10*sin(2*PI*165*t)+0.07*sin(2*PI*220*t)*(0.55+0.45*sin(2*PI*0.18*t))',
  '0.16*sin(2*PI*111*t)+0.10*sin(2*PI*166*t)+0.07*sin(2*PI*221*t)*(0.55+0.45*sin(2*PI*0.18*t+0.9))',
].join('|');

const TARGET_PEAK_DB = -4;

/** Peak level in dBFS of an audio file, from FFmpeg volumedetect. */
export async function peakDb(ffmpeg, file) {
  const { stderr } = await run(ffmpeg, ['-hide_banner', '-i', file, '-af', 'volumedetect', '-f', 'null', '-']);
  const m = stderr.match(/max_volume:\s*(-?[\d.]+) dB/);
  if (!m) throw new Error(`could not measure peak of ${file}`);
  return Number(m[1]);
}

/** Write `input` to `output` as 44.1 kHz stereo WAV with its peak set to TARGET_PEAK_DB. */
async function normalizeTo(ffmpeg, args, output) {
  const tmp = `${output}.tmp.wav`;
  await run(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', ...args, '-ac', '2', '-ar', '44100', tmp]);
  const gain = TARGET_PEAK_DB - (await peakDb(ffmpeg, tmp));
  await run(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', tmp, '-af', `volume=${gain.toFixed(2)}dB`, '-ac', '2', '-ar', '44100', output]);
  fs.rmSync(tmp, { force: true });
}

/**
 * Build every cue in CUES into `dir` (skips files that already exist).
 * @param {string} ffmpeg   FFmpeg binary path
 * @param {string} dir      output directory for generated cue WAVs
 * @param {string} sourceDir directory holding voice source files (assets/sfx)
 * @returns {Promise<Record<string,string>>} cue name -> absolute WAV path
 */
export async function ensureCues(ffmpeg, dir, sourceDir) {
  fs.mkdirSync(dir, { recursive: true });
  const out = {};
  for (const [name, cue] of Object.entries(CUES)) {
    const file = path.join(dir, `${name}.wav`);
    out[name] = file;
    if (fs.existsSync(file)) continue;
    if (cue.kind === 'synth') {
      await normalizeTo(ffmpeg, ['-f', 'lavfi', '-i', cue.graph], file);
    } else if (cue.kind === 'voice') {
      const src = path.join(sourceDir, cue.source);
      if (!fs.existsSync(src)) throw new Error(`voice source missing: ${src}`);
      const trim = 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02,areverse,' +
        'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02,areverse';
      await normalizeTo(ffmpeg, ['-i', src, '-af', trim], file);
    }
  }
  return out;
}

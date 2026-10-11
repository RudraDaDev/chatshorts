import fs from 'node:fs';
import path from 'node:path';
import { run } from '../renderer/ffmpeg.js';

// Default sound effects and music are generated locally with FFmpeg, so the
// project ships no third-party audio and there is no licensing question for
// them. To use your own licensed audio, set story.audio.music, or replace the
// generated files in assets/generated/sfx (see assets/LICENSES.md).

const SFX = {
  // "receive": short descending pop for messages from other people
  receive: "aevalsrc=exprs='0.6*sin(2*PI*(1250-700*t/0.16)*t)*exp(-t*26)|0.6*sin(2*PI*(1250-700*t/0.16)*t)*exp(-t*26)':s=44100:d=0.2,afade=t=out:st=0.14:d=0.06",
  // "send": soft band-limited noise whoosh for the local user's messages
  send: 'anoisesrc=d=0.26:c=white:r=44100:a=1,highpass=f=900,lowpass=f=4500,afade=t=in:d=0.05,afade=t=out:st=0.12:d=0.14,volume=0.45',
};

/** Expression for the generated background pad (two slightly detuned channels). */
export const MUSIC_PAD_EXPR = [
  '0.16*sin(2*PI*110*t)+0.10*sin(2*PI*165*t)+0.07*sin(2*PI*220*t)*(0.55+0.45*sin(2*PI*0.18*t))',
  '0.16*sin(2*PI*111*t)+0.10*sin(2*PI*166*t)+0.07*sin(2*PI*221*t)*(0.55+0.45*sin(2*PI*0.18*t+0.9))',
].join('|');

/** Generate missing default SFX into dir. Returns {receive, send} absolute paths. */
export async function ensureSfx(ffmpeg, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const out = {};
  for (const [name, source] of Object.entries(SFX)) {
    const file = path.join(dir, `${name}.wav`);
    if (!fs.existsSync(file)) {
      const isStereoSource = source.startsWith('aevalsrc');
      const args = ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', source, '-ac', '2', '-ar', '44100'];
      if (!isStereoSource) args.push('-af', 'aformat=channel_layouts=stereo');
      args.push(file);
      await run(ffmpeg, args);
    }
    out[name] = file;
  }
  return out;
}

import path from 'node:path';
import { MUSIC_PAD_EXPR } from './assets.js';

const SFX_DB = -6;
const MERGE_GROUP = 16; // channels per amerge stage stay well under FFmpeg's channel limit

/**
 * Build the FFmpeg audio graph: music bed + one sound effect per revealed
 * message (delayed to its reveal time), summed, trimmed to the story length,
 * limited, and loudness-normalized.
 *
 * Summing uses amerge+pan rather than amix: amix's gain behaviour changed
 * between FFmpeg versions (normalize option), while amerge+pan is an exact sum.
 *
 * @param {object} args
 * @param {object} args.story        normalized story
 * @param {string} args.storyDir     directory used to resolve audio.music
 * @param {{receive:string,send:string}} args.sfx  absolute SFX file paths
 * @param {number} args.firstInput   index of the first input this plan adds
 * @param {number} args.durationMs
 * @param {'full'|'none'} args.mode  'none' produces silence (--no-audio)
 * @returns {{ inputs: string[], parts: string[], outLabel: string, events: number, music: string }}
 */
export function buildAudioPlan({ story, storyDir, sfx, firstInput, durationMs, mode = 'full' }) {
  const dur = (durationMs / 1000).toFixed(3);
  const inputs = [];
  let idx = firstInput;

  if (mode === 'none') {
    inputs.push('-f', 'lavfi', '-t', dur, '-i', 'anullsrc=r=48000:cl=stereo');
    return { inputs, parts: [], outLabel: `${idx}:a`, events: 0, music: 'silence' };
  }

  const parts = [];
  let music;
  if (story.audio.music) {
    music = path.resolve(storyDir, story.audio.music);
    inputs.push('-stream_loop', '-1', '-i', music);
  } else {
    music = 'generated pad';
    inputs.push('-f', 'lavfi', '-i', `aevalsrc=exprs=${MUSIC_PAD_EXPR}:s=48000:d=${dur}`);
  }
  const fadeOutAt = Math.max(0, Number(dur) - 2).toFixed(3);
  parts.push(
    `[${idx}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,` +
      `volume=${story.audio.musicVolumeDb}dB,afade=t=in:st=0:d=1,afade=t=out:st=${fadeOutAt}:d=2[m]`,
  );
  idx += 1;

  const labels = ['[m]'];
  let events = 0;
  if (story.audio.sfx) {
    const localId = story.localUser.id;
    for (const m of story.messages) {
      if (m.sound === 'none') continue;
      const cue = m.senderId === localId ? sfx.send : sfx.receive;
      const ms = Math.round(m.revealAtMs);
      inputs.push('-i', cue);
      parts.push(
        `[${idx}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,` +
          `adelay=${ms}|${ms},apad,volume=${SFX_DB}dB[s${events}]`,
      );
      labels.push(`[s${events}]`);
      idx += 1;
      events += 1;
    }
  }

  const sum = sumTree(labels, parts);
  parts.push(`${sum}atrim=0:${dur},asetpts=PTS-STARTPTS,alimiter=limit=0.9:attack=5:release=50,` +
    'loudnorm=I=-14:TP=-1.5:LRA=11[a]');
  return { inputs, parts, outLabel: '[a]', events, music };
}

/** Sum stereo streams exactly, in groups of MERGE_GROUP, then sum the group results. */
function sumTree(labels, parts) {
  let counter = 0;
  let current = labels;
  while (current.length > 1) {
    const next = [];
    for (let i = 0; i < current.length; i += MERGE_GROUP) {
      const group = current.slice(i, i + MERGE_GROUP);
      if (group.length === 1) {
        next.push(group[0]);
        continue;
      }
      const out = `[sum${counter++}]`;
      const left = group.map((_, k) => `c${2 * k}`).join('+');
      const right = group.map((_, k) => `c${2 * k + 1}`).join('+');
      parts.push(`${group.join('')}amerge=inputs=${group.length},pan=stereo|c0=${left}|c1=${right}${out}`);
      next.push(out);
    }
    current = next;
  }
  return current[0];
}

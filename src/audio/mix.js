import path from 'node:path';
import { MUSIC_PAD_EXPR } from './assets.js';
import { CUES } from './cues.js';

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
 * @param {Record<string,string>} args.cues  cue name -> absolute WAV path (see ensureCues)
 * @param {number} args.firstInput   index of the first input this plan adds
 * @param {{ file: string, startMs: number }[]} [args.narration]  spoken clips (see src/tts)
 * @param {number} args.durationMs
 * @param {'full'|'none'} args.mode  'none' produces silence (--no-audio)
 * @returns {{ inputs: string[], parts: string[], outLabel: string, events: number, music: string }}
 */
export function buildAudioPlan({ story, storyDir, cues, narration = [], firstInput, durationMs, mode = 'full' }) {
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
      // "auto" = pop for received messages, whoosh for sent ones; anything else is a named cue.
      const name = m.sound === 'auto' ? (m.senderId === localId ? 'send' : 'receive') : m.sound;
      const cue = CUES[name];
      const file = cues[name];
      if (!cue || !file) throw new Error(`unknown sound cue "${name}" on message ${m.id}`);
      const ms = Math.round(m.revealAtMs);
      inputs.push('-i', file);
      parts.push(
        `[${idx}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,` +
          `adelay=${ms}|${ms},apad,volume=${cue.gainDb}dB[s${events}]`,
      );
      labels.push(`[s${events}]`);
      idx += 1;
      events += 1;
    }
  }

  // Spoken lines: already peak-normalized in src/tts/clips.js, so no extra gain here.
  for (const clip of narration) {
    const ms = Math.round(clip.startMs);
    inputs.push('-i', clip.file);
    parts.push(
      `[${idx}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,` +
        `adelay=${ms}|${ms},apad[v${events}]`,
    );
    labels.push(`[v${events}]`);
    idx += 1;
    events += 1;
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

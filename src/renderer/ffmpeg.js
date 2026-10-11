import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);

/** FFmpeg/ffprobe binaries: FFMPEG_PATH/FFPROBE_PATH env, else the npm-bundled builds. */
export function resolveBinaries(config = {}) {
  const ffmpeg = config.ffmpegPath || require('@ffmpeg-installer/ffmpeg').path;
  const ffprobe = config.ffprobePath || require('@ffprobe-installer/ffprobe').path;
  for (const p of [ffmpeg, ffprobe]) {
    if (!fs.existsSync(p)) throw new Error(`binary not found: ${p}`);
  }
  return { ffmpeg, ffprobe };
}

/** Run a process, resolve with its stdout/stderr, reject with the stderr tail on failure. */
export function run(bin, args, { cwd, input } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${bin} exited with ${code}: ${stderr.split('\n').slice(-12).join('\n')}`));
    });
    if (input !== undefined) child.stdin.end(input);
    else child.stdin.end();
  });
}

export function ffprobeJson(ffprobe, file) {
  return run(ffprobe, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file])
    .then(({ stdout }) => JSON.parse(stdout));
}

/** Quote a path for the ffmpeg concat demuxer file list. */
export function concatQuote(p) {
  return `'${p.replace(/'/g, "'\\''")}'`;
}

/**
 * Assemble the final MP4 from rendered stills (concat demuxer with exact
 * per-still durations), an optional looping background video, and an audio plan.
 */
export async function encodeVideo({
  ffmpeg, concatFile, width, height, fps, durationMs, out, background, audioPlan, cwd,
}) {
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', concatFile];
  let videoGraph;
  if (background) {
    args.push('-stream_loop', '-1', '-i', background.file);
    const dim = background.dim ?? 0.35;
    videoGraph = [
      `[1:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,` +
        `eq=brightness=${(-dim).toFixed(3)}:saturation=0.85,fps=${fps},format=rgba[bg]`,
      `[0:v]fps=${fps},format=rgba[fg]`,
      '[bg][fg]overlay=0:0:format=auto,format=yuv420p[v]',
    ].join(';');
  } else {
    videoGraph = `[0:v]fps=${fps},setsar=1,format=yuv420p[v]`;
  }
  args.push(...audioPlan.inputs);
  const graph = [videoGraph, ...audioPlan.parts].join(';');
  args.push(
    '-filter_complex', graph,
    '-map', '[v]',
    '-map', audioPlan.outLabel,
    '-t', (durationMs / 1000).toFixed(3),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-profile:v', 'high', '-level', '4.2',
    '-pix_fmt', 'yuv420p', '-r', String(fps),
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
    '-movflags', '+faststart',
    out,
  );
  await run(ffmpeg, args, { cwd });
  return out;
}

/** Concat-demuxer list: one entry per still, with its duration; last file repeated. */
export function concatList(sequence, fps) {
  const lines = [];
  for (const { file, frames } of sequence) {
    lines.push(`file ${concatQuote(file)}`);
    lines.push(`duration ${(frames / fps).toFixed(6)}`);
  }
  lines.push(`file ${concatQuote(sequence[sequence.length - 1].file)}`);
  return lines.join('\n') + '\n';
}

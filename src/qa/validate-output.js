import { run, ffprobeJson } from '../renderer/ffmpeg.js';

// Output QA: media metadata (ffprobe), full decode (FFmpeg), audio levels
// (volumedetect), and the render-time DOM checks recorded by the render stage.

const LIMITS = { minSeconds: 10, maxSeconds: 180 };

function check(name, ok, detail, severity = 'error') {
  return { name, ok, severity: ok ? 'info' : severity, detail };
}

export async function probeChecks({ ffprobe, file, expected }) {
  const info = await ffprobeJson(ffprobe, file);
  const v = info.streams.find((s) => s.codec_type === 'video');
  const a = info.streams.find((s) => s.codec_type === 'audio');
  const checks = [];
  checks.push(check('video stream present', Boolean(v), v ? v.codec_name : 'missing'));
  checks.push(check('audio stream present', Boolean(a), a ? a.codec_name : 'missing'));
  if (v) {
    checks.push(check('video codec h264', v.codec_name === 'h264', v.codec_name));
    checks.push(check('dimensions', v.width === expected.width && v.height === expected.height, `${v.width}x${v.height}`));
    const [num, den] = v.avg_frame_rate.split('/').map(Number);
    const fps = den ? num / den : num;
    checks.push(check('frame rate', Math.abs(fps - expected.fps) < 0.01, `${fps.toFixed(3)} fps`));
    checks.push(check('pixel format yuv420p', v.pix_fmt === 'yuv420p', v.pix_fmt));
  }
  if (a) {
    checks.push(check('audio codec aac', a.codec_name === 'aac', a.codec_name));
    checks.push(check('audio sample rate 48 kHz', Number(a.sample_rate) === 48000, a.sample_rate));
  }
  const duration = Number(info.format.duration);
  const expectedSec = expected.durationMs / 1000;
  checks.push(check('duration matches story', Math.abs(duration - expectedSec) <= 0.1, `${duration.toFixed(3)}s (expected ${expectedSec.toFixed(3)}s)`));
  checks.push(check('duration within limits', duration >= LIMITS.minSeconds && duration <= LIMITS.maxSeconds, `${duration.toFixed(1)}s`));
  checks.push(check('container mp4', /mp4/.test(info.format.format_name), info.format.format_name));
  return { checks, info };
}

/** Decode every video and audio frame. Any decoder error fails the check. */
export async function decodeCheck({ ffmpeg, file }) {
  const checks = [];
  for (const map of ['0:v:0', '0:a:0']) {
    try {
      const { stderr } = await run(ffmpeg, ['-v', 'error', '-xerror', '-i', file, '-map', map, '-f', 'null', '-']);
      checks.push(check(`full decode ${map.split(':')[1] === 'v' ? 'video' : 'audio'}`, stderr.trim() === '', stderr.trim() || 'clean'));
    } catch (err) {
      checks.push(check(`full decode ${map.split(':')[1] === 'v' ? 'video' : 'audio'}`, false, err.message.split('\n')[0]));
    }
  }
  return checks;
}

/** Audio levels via volumedetect: clipping (peak near 0 dBFS) and silence checks. */
export async function audioLevelChecks({ ffmpeg, file, expectAudio }) {
  const { stderr } = await run(ffmpeg, ['-hide_banner', '-i', file, '-map', '0:a:0', '-af', 'volumedetect', '-f', 'null', '-']);
  const max = Number((stderr.match(/max_volume:\s*(-?[\d.]+) dB/) || [])[1]);
  const mean = Number((stderr.match(/mean_volume:\s*(-?[\d.]+) dB/) || [])[1]);
  if (Number.isNaN(max) || Number.isNaN(mean)) {
    return [check('audio levels measurable', false, 'volumedetect produced no levels')];
  }
  const checks = [
    check('no clipping (peak below -1 dBFS)', max <= -1, `peak ${max.toFixed(1)} dBFS`),
    check('loudness not excessive (mean below -8 dBFS)', mean <= -8, `mean ${mean.toFixed(1)} dBFS`),
  ];
  if (expectAudio) {
    checks.push(check('audio present (not silent)', mean > -45, `mean ${mean.toFixed(1)} dBFS`, 'warning'));
  }
  return checks;
}

/**
 * Full QA for a finished MP4.
 * @param {object} args
 * @param {object} [args.renderIssues] visual-state issues from the render stage (empty when clean)
 */
export async function qaOutput({ ffmpeg, ffprobe, file, expected, expectAudio = true, renderIssues = [] }) {
  const { checks: probe } = await probeChecks({ ffprobe, file, expected });
  const decode = await decodeCheck({ ffmpeg, file });
  const levels = await audioLevelChecks({ ffmpeg, file, expectAudio });
  const visual = [
    check('visual states verified', renderIssues.length === 0,
      renderIssues.length === 0 ? 'all rendered states match the timeline' : `${renderIssues.length} state(s) failed`),
  ];
  const all = [...probe, ...decode, ...levels, ...visual];
  const failed = all.filter((c) => !c.ok && c.severity === 'error');
  return { ok: failed.length === 0, checks: all, failed: failed.map((c) => c.name) };
}

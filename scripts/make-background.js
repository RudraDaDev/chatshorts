#!/usr/bin/env node
// Generates an original, copyright-free looping background (animated colour plasma)
// with no third-party footage. Frames are computed here at 180x320 and FFmpeg
// scales them to 720x1280 (720p portrait, 30 fps). The loop is seamless: every
// animated term completes a whole number of cycles over the duration.
//
//   node scripts/make-background.js [--seconds 120] [--out assets/backgrounds/plasma-720p30.mp4]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { resolveBinaries } from '../src/renderer/ffmpeg.js';
import { loadConfig } from '../src/config.js';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const seconds = Number(opt('seconds', 120));
const out = path.resolve(opt('out', 'assets/backgrounds/plasma-720p30.mp4'));
const FPS = 30;
const SRC_W = 180;
const SRC_H = 320;
const OUT_W = 720;
const OUT_H = 1280;
const frames = seconds * FPS;

const config = loadConfig();
const { ffmpeg } = resolveBinaries(config);
fs.mkdirSync(path.dirname(out), { recursive: true });

const ff = spawn(ffmpeg, [
  '-v', 'error', '-y',
  '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${SRC_W}x${SRC_H}`, '-r', String(FPS), '-i', 'pipe:0',
  '-vf', `scale=${OUT_W}:${OUT_H}:flags=bicubic,format=yuv420p`,
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '26', '-pix_fmt', 'yuv420p', '-r', String(FPS),
  '-movflags', '+faststart', out,
], { stdio: ['pipe', 'inherit', 'inherit'] });

const done = new Promise((resolve, reject) => {
  ff.on('error', reject);
  ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
});

const TAU = Math.PI * 2;
const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
const buf = Buffer.alloc(SRC_W * SRC_H * 3);
// Precompute the static distance term once.
const dist = new Float32Array(SRC_W * SRC_H);
for (let y = 0; y < SRC_H; y++) {
  for (let x = 0; x < SRC_W; x++) {
    dist[y * SRC_W + x] = Math.hypot(x - SRC_W / 2, y - SRC_H * 0.5) / 25;
  }
}

for (let f = 0; f < frames; f++) {
  const phase = (TAU * f) / frames; // one full cycle per loop
  let o = 0;
  for (let y = 0; y < SRC_H; y++) {
    for (let x = 0; x < SRC_W; x++) {
      const v = (
        Math.sin(x / 18 + phase) +
        Math.sin(y / 21 - 2 * phase) +
        Math.sin((x + y) / 30 + 3 * phase) +
        Math.sin(dist[y * SRC_W + x] - 4 * phase)
      ) / 4;
      const p = Math.PI * v;
      buf[o++] = clamp(70 + 60 * Math.sin(p));
      buf[o++] = clamp(40 + 50 * Math.sin(p + 2.1));
      buf[o++] = clamp(110 + 70 * Math.sin(p + 4.2));
    }
  }
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
}
ff.stdin.end();
await done;
console.log(`wrote ${out} (${seconds} s, ${OUT_W}x${OUT_H}, ${FPS} fps, ${(fs.statSync(out).size / 1e6).toFixed(1)} MB)`);

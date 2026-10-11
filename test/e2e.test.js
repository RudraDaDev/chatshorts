// End-to-end: real Chromium + FFmpeg. Slower (about 1 minute); run with npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../src/config.js';
import { JobStore } from '../src/jobs/job-store.js';
import { createJob, runJob } from '../src/jobs/pipeline.js';
import { resolveBinaries, run } from '../src/renderer/ffmpeg.js';
import { qaOutput } from '../src/qa/validate-output.js';
import { EXAMPLE } from './helpers.js';

const silentLog = { info() {}, warn() {}, stage() {} };

function testConfig(name) {
  const base = mkdtemp(name);
  return { ...loadConfig(), tempDir: path.join(base, 'temp'), outputDir: path.join(base, 'out'), dbPath: path.join(base, 'jobs.sqlite') };
}

function mkdtemp(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `chatshorts-${name}-`));
}

test('example story renders to a valid MP4 and passes QA', async () => {
  const config = testConfig('example');
  const store = await JobStore.open(config.dbPath);
  try {
    const { jobId } = await createJob({ config, store, source: EXAMPLE, options: { keepTemp: false } });
    const { outputPath } = await runJob({ config, store, jobId, log: silentLog });
    assert.ok(fs.existsSync(outputPath));
    assert.ok(fs.existsSync(outputPath.replace(/\.mp4$/, '.report.json')));
    const job = store.getJob(jobId);
    assert.equal(job.status, 'completed');
    const stages = store.stages(jobId).map((s) => `${s.name}:${s.status}`);
    assert.deepEqual(stages.sort(), ['encode:done', 'finalize:done', 'layout:done', 'qa:done', 'render:done', 'validate:done']);
    // The job's frames are cleaned up after success (keepTemp false).
    assert.equal(fs.existsSync(path.join(config.tempDir, jobId, 'frames')), false);
  } finally {
    store.close();
  }
});

test('resume reuses finished stages and does not re-render', async () => {
  const config = testConfig('resume');
  const store = await JobStore.open(config.dbPath);
  try {
    const { jobId, workDir } = await createJob({ config, store, source: EXAMPLE, options: { keepTemp: true } });
    // Simulate a failure during encoding: run through render, then break encode.
    await runJob({ config, store, jobId, log: silentLog }).catch(() => {});
    // Remove the output and the encoded file so encode must run again, but keep frames.
    fs.rmSync(path.join(workDir, 'encoded.mp4'), { force: true });
    store.updateJob(jobId, { status: 'failed', error: 'simulated' });
    const reused = [];
    const log = { ...silentLog, stage: (name, status) => status === 'reused' && reused.push(name) };
    const { outputPath } = await runJob({ config, store, jobId, log });
    assert.ok(reused.includes('render'), 'render should be reused');
    assert.ok(reused.includes('validate'));
    assert.ok(!reused.includes('encode'));
    assert.ok(fs.existsSync(outputPath));
  } finally {
    store.close();
  }
});

test('background video + no audio path renders and passes QA', async () => {
  const config = testConfig('bg');
  const storyDir = mkdtemp('bgstory');
  const bg = path.join(storyDir, 'bg.mp4');
  const { ffmpeg } = resolveBinaries(config);
  await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=540x960:rate=30:duration=12', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', bg]);
  const story = JSON.parse(fs.readFileSync(EXAMPLE, 'utf8'));
  story.durationSeconds = 12;
  story.messages = story.messages.filter((m) => m.revealAtMs < 9000);
  story.messages.forEach((m) => { m.revealAtMs = Math.min(m.revealAtMs, 9000); });
  story.background = { video: 'bg.mp4', dim: 0.4 };
  story.audio = { sfx: false, music: null };
  const storyPath = path.join(storyDir, 'story.json');
  fs.writeFileSync(storyPath, JSON.stringify(story, null, 2));
  // Keep the reveal order valid after truncation.
  const store = await JobStore.open(config.dbPath);
  try {
    const { jobId } = await createJob({ config, store, source: storyPath, options: { noAudio: true, output: path.join(config.outputDir, 'bg.mp4') } });
    const { outputPath } = await runJob({ config, store, jobId, log: silentLog });
    const result = await qaOutput({
      ffmpeg,
      ffprobe: resolveBinaries(config).ffprobe,
      file: outputPath,
      expected: { width: config.width, height: config.height, fps: config.fps, durationMs: 12000 },
      expectAudio: false,
    });
    assert.equal(result.ok, true, result.failed.join('; '));
  } finally {
    store.close();
  }
});

test('a broken story fails validation and records a failed job', async () => {
  const config = testConfig('invalid');
  const dir = mkdtemp('invalid-story');
  const storyPath = path.join(dir, 'bad.json');
  const story = JSON.parse(fs.readFileSync(EXAMPLE, 'utf8'));
  story.messages[0].senderId = 'nobody';
  fs.writeFileSync(storyPath, JSON.stringify(story));
  const store = await JobStore.open(config.dbPath);
  try {
    const { jobId } = await createJob({ config, store, source: storyPath, options: {} });
    await assert.rejects(runJob({ config, store, jobId, log: silentLog }), /unknown sender "nobody"/);
    assert.equal(store.getJob(jobId).status, 'failed');
    assert.equal(store.getJob(jobId).stage, 'validate');
  } finally {
    store.close();
  }
});


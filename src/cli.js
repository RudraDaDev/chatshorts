#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './config.js';
import { readStoryScript } from './stories/load.js';
import { validateStory } from './stories/validate.js';
import { createStoryProvider } from './providers/llm.js';
import { JobStore } from './jobs/job-store.js';
import { createJob, runJob } from './jobs/pipeline.js';
import { resolveBinaries, ffprobeJson } from './renderer/ffmpeg.js';
import { ensureSfx } from './audio/assets.js';
import { qaOutput } from './qa/validate-output.js';

const USAGE = `ChatShorts: render fictional iMessage-style Shorts from a JSON story script.

Usage:
  node src/cli.js validate <story.json|->          Check a story script (no rendering)
  node src/cli.js generate --story <story.json|->  Render a Short (validate, layout, render, encode, QA)
        [--output output/name.mp4] [--keep-temp] [--no-audio]
  node src/cli.js resume <jobId>                   Continue a failed/interrupted job from its failed stage
  node src/cli.js jobs [--limit 20]                List recent jobs
  node src/cli.js qa <video.mp4>                   Media QA on any MP4 (ffprobe, decode, audio levels)
  node src/cli.js assets                           Generate the default sound effects (assets/generated/sfx)

Pass "-" as the story path to read the JSON from stdin.
`;

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const flags = {};
  const positional = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = rest[i + 1];
      if (next === undefined || next.startsWith('--')) flags[key] = true;
      else {
        flags[key] = next;
        i++;
      }
    } else if (a === '-') {
      positional.push('-');
    } else {
      positional.push(a);
    }
  }
  return { command, flags, positional };
}

const ms = (n) => (n === null || n === undefined ? '' : n < 1000 ? `${n} ms` : `${(n / 1000).toFixed(1)} s`);

function makeLogger() {
  return {
    info: (msg) => console.log(msg),
    warn: (msg) => console.log(`  ! ${msg}`),
    stage(name, status, durationMs, detail) {
      const extra = detail ? Object.entries(detail).filter(([k]) => k !== 'error').map(([k, v]) => `${k}=${v}`).join(' ') : '';
      const err = detail && detail.error ? ` — ${detail.error}` : '';
      const icon = { running: '…', done: '✓', reused: '↺', failed: '✗' }[status] || '·';
      const time = durationMs != null ? ` (${ms(durationMs)})` : '';
      console.log(`${icon} ${name.padEnd(9)} ${status}${time}${extra ? '  ' + extra : ''}${err}`);
    },
  };
}

function printApiUsage(store, jobId) {
  const usage = store.usage(jobId);
  if (!usage.length) return;
  const calls = usage.reduce((s, u) => s + (u.calls || 0), 0);
  const cost = usage.reduce((s, u) => s + (u.cost_usd || 0), 0);
  console.log(`API usage: ${calls} call(s), estimated cost $${cost.toFixed(4)} (story supplied manually, no LLM calls)`);
}

async function cmdValidate(config, { positional }) {
  const source = positional[0];
  if (!source) throw usageError('validate needs a story path or "-"');
  const { raw, storyDir } = readStoryScript(source);
  const result = validateStory(raw, { storyDir });
  for (const w of result.warnings) console.log(`warning: ${w}`);
  for (const e of result.errors) console.log(`error:   ${e}`);
  if (result.ok) {
    const s = result.story;
    console.log(`OK: "${s.title}" — ${s.messages.length} messages, ${s.conversations.length} conversation(s), ${s.durationSeconds}s`);
    return 0;
  }
  console.log(`INVALID: ${result.errors.length} error(s)`);
  return 1;
}

async function cmdGenerate(config, { flags }) {
  if (!flags.story) throw usageError('generate needs --story <file|->');
  const store = await JobStore.open(config.dbPath);
  const log = makeLogger();
  try {
    const provider = createStoryProvider(config.storyProvider);
    const started = Date.now();
    const { jobId } = await createJob({
      config,
      store,
      source: flags.story,
      providerName: provider.name,
      options: {
        output: typeof flags.output === 'string' ? flags.output : undefined,
        keepTemp: Boolean(flags['keep-temp']),
        noAudio: Boolean(flags['no-audio']),
      },
    });
    console.log(`job ${jobId} (story provider: ${provider.name})`);
    try {
      const { outputPath } = await runJob({ config, store, jobId, log });
      const total = Date.now() - started;
      console.log(`\nDONE in ${ms(total)}: ${outputPath}`);
      console.log(`report: ${outputPath.replace(/\.mp4$/i, '')}.report.json`);
      printApiUsage(store, jobId);
      return 0;
    } catch (err) {
      console.error(`\nFAILED ${jobId}: ${err.message}`);
      console.error(`resume with: node src/cli.js resume ${jobId}`);
      return 1;
    }
  } finally {
    store.close();
  }
}

async function cmdResume(config, { positional }) {
  const jobId = positional[0];
  if (!jobId) throw usageError('resume needs a job id (see `jobs`)');
  const store = await JobStore.open(config.dbPath);
  try {
    if (!store.getJob(jobId)) {
      console.error(`no such job: ${jobId}`);
      return 1;
    }
    console.log(`resuming job ${jobId}`);
    try {
      const { outputPath } = await runJob({ config, store, jobId, log: makeLogger() });
      console.log(`\nDONE: ${outputPath}`);
      printApiUsage(store, jobId);
      return 0;
    } catch (err) {
      console.error(`\nFAILED ${jobId}: ${err.message}`);
      return 1;
    }
  } finally {
    store.close();
  }
}

async function cmdJobs(config, { flags }) {
  const store = await JobStore.open(config.dbPath);
  try {
    const rows = store.listJobs(Number(flags.limit) || 20);
    if (!rows.length) {
      console.log('no jobs yet');
      return 0;
    }
    for (const r of rows) {
      console.log(`${r.id}  ${r.status.padEnd(11)} ${String(r.stage || '-').padEnd(9)} ${r.title}`);
      if (r.output_path) console.log(`    ${r.output_path}`);
    }
    return 0;
  } finally {
    store.close();
  }
}

async function cmdQa(config, { positional }) {
  const file = positional[0];
  if (!file) throw usageError('qa needs a video path');
  const bin = resolveBinaries(config);
  const abs = path.resolve(file);
  const info = await ffprobeJson(bin.ffprobe, abs);
  const duration = Number(info.format.duration);
  const v = info.streams.find((s) => s.codec_type === 'video');
  const expected = { width: v ? v.width : 0, height: v ? v.height : 0, fps: config.fps, durationMs: Math.round(duration * 1000) };
  const result = await qaOutput({ ffmpeg: bin.ffmpeg, ffprobe: bin.ffprobe, file: abs, expected, expectAudio: true, renderIssues: [] });
  for (const c of result.checks) console.log(`${c.ok ? 'PASS' : c.severity === 'warning' ? 'WARN' : 'FAIL'}  ${c.name}: ${c.detail}`);
  console.log(result.ok ? 'QA passed' : `QA failed: ${result.failed.join('; ')}`);
  return result.ok ? 0 : 1;
}

async function cmdAssets(config) {
  const bin = resolveBinaries(config);
  const files = await ensureSfx(bin.ffmpeg, config.sfxDir);
  console.log(`sound effects: ${files.receive}, ${files.send}`);
  return 0;
}

function usageError(msg) {
  const e = new Error(msg);
  e.usage = true;
  return e;
}

export async function main(argv = process.argv.slice(2)) {
  const { command, flags, positional } = parseArgs(argv);
  if (!command || command === 'help' || command === '--help' || flags.help) {
    console.log(USAGE);
    return 0;
  }
  const config = loadConfig();
  fs.mkdirSync(config.tempDir, { recursive: true });
  fs.mkdirSync(config.outputDir, { recursive: true });
  const commands = {
    validate: cmdValidate,
    generate: cmdGenerate,
    resume: cmdResume,
    jobs: cmdJobs,
    qa: cmdQa,
    assets: cmdAssets,
  };
  const handler = commands[command];
  if (!handler) {
    console.error(`unknown command: ${command}\n`);
    console.error(USAGE);
    return 2;
  }
  try {
    return await handler(config, { flags, positional });
  } catch (err) {
    if (err.usage) {
      console.error(`${err.message}\n`);
      console.error(USAGE);
      return 2;
    }
    console.error(`error: ${err.message}`);
    return 1;
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (isMain) {
  main().then((code) => process.exit(code));
}

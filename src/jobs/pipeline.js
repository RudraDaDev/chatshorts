import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createStoryProvider } from '../providers/llm.js';
import { validateStory } from '../stories/validate.js';
import { resolveContacts, resolveConversations } from '../contacts/model.js';
import { buildStoryLayout, browserPayload, styleFor } from '../layout/build.js';
import { buildTimeline } from '../layout/viewport.js';
import { launchBrowser } from '../renderer/browser.js';
import { openChatPage, renderStates } from '../renderer/scenes.js';
import { resolveBinaries, encodeVideo, concatList } from '../renderer/ffmpeg.js';
import { ensureCues } from '../audio/assets.js';
import { KokoroEngine } from '../tts/engine.js';
import { renderClips } from '../tts/clips.js';
import { planNarration, retimeForNarration, NARRATION_TIMING } from '../tts/retime.js';
import { DEFAULT_VOICE } from '../tts/voices.js';
import { validateStory as revalidate } from '../stories/validate.js';
import { buildAudioPlan } from '../audio/mix.js';
import { qaOutput } from '../qa/validate-output.js';

// Stages run in order. Each stage writes its artifact into the job's work dir,
// so a failed job resumes at the first unfinished stage without regenerating
// the story or re-rendering finished frames.
export const STAGES = ['validate', 'narrate', 'layout', 'render', 'encode', 'qa', 'finalize'];

const STATUS_FOR_STAGE = {
  validate: 'validating',
  narrate: 'validating',
  layout: 'validating',
  render: 'rendering',
  encode: 'encoding',
  qa: 'encoding',
  finalize: 'encoding',
};

const ARTIFACTS = {
  validate: ['story.json', 'validation.json'],
  narrate: ['story.timed.json', 'narration.json'],
  layout: ['layout.json'],
  render: ['render-manifest.json', 'timeline.json'],
  encode: ['encoded.mp4'],
  qa: ['qa.json'],
  finalize: [],
};

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');

export function newJobId(now = new Date()) {
  const stamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  return `job-${stamp}-${crypto.randomBytes(3).toString('hex')}`;
}

export function slugify(s) {
  return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'short';
}

/** Load the story script through the provider, persist a copy, and create the job row. */
export async function createJob({ config, store, source, providerName = config.storyProvider, options = {} }) {
  const provider = createStoryProvider(providerName);
  const { raw, storyDir, usage } = await provider.load({ source });
  const jobId = newJobId();
  const workDir = path.join(config.tempDir, jobId);
  fs.mkdirSync(workDir, { recursive: true });
  const text = JSON.stringify(raw, null, 2);
  fs.writeFileSync(path.join(workDir, 'source-story.json'), text + '\n');
  const sha = crypto.createHash('sha256').update(text).digest('hex');
  const title = typeof raw.title === 'string' ? raw.title : 'untitled';
  const outputPath = options.output
    ? path.resolve(options.output)
    : path.join(config.outputDir, `${slugify(title)}-${jobId.slice(-6)}.mp4`);
  store.createJob({ id: jobId, title, storySource: source, storyDir, storySha256: sha, outputPath, workDir, options });
  store.recordUsage(jobId, usage);
  return { jobId, workDir };
}

function artifactsExist(workDir, stage, job) {
  if (stage === 'finalize') return Boolean(job.outputPath) && fs.existsSync(job.outputPath);
  return ARTIFACTS[stage].every((f) => fs.existsSync(path.join(workDir, f)));
}

/** Run (or resume) a job. Resolves with the output path; throws after recording the failure. */
export async function runJob({ config, store, jobId, log }) {
  const job = store.getJob(jobId);
  if (!job) throw new Error(`no such job: ${jobId}`);
  if (job.status === 'completed') {
    log.info(`job ${jobId} is already completed: ${job.outputPath}`);
    return { outputPath: job.outputPath, reused: true };
  }
  const ctx = { config, store, job, workDir: job.workDir, log, browser: null, options: job.options };
  const bin = resolveBinaries(config);
  ctx.ffmpeg = bin.ffmpeg;
  ctx.ffprobe = bin.ffprobe;
  fs.mkdirSync(ctx.workDir, { recursive: true });
  try {
    for (const stage of STAGES) {
      if (store.stageDone(jobId, stage) && artifactsExist(ctx.workDir, stage, job)) {
        log.stage(stage, 'reused', null);
        continue;
      }
      store.updateJob(jobId, { status: STATUS_FOR_STAGE[stage], stage });
      store.stageStart(jobId, stage);
      const started = Date.now();
      log.stage(stage, 'running', null);
      let detail;
      try {
        detail = await STAGE_FNS[stage](ctx);
      } catch (err) {
        const durationMs = Date.now() - started;
        store.stageFinish(jobId, stage, { status: 'failed', durationMs, error: err.message });
        store.updateJob(jobId, { status: 'failed', stage, error: `${stage}: ${err.message}` });
        log.stage(stage, 'failed', durationMs, { error: err.message.split('\n')[0] });
        throw err;
      }
      const durationMs = Date.now() - started;
      store.stageFinish(jobId, stage, { status: 'done', durationMs, detail });
      log.stage(stage, 'done', durationMs, detail);
    }
    const finishedJob = store.getJob(jobId);
    return { outputPath: finishedJob.outputPath, reused: false };
  } finally {
    if (ctx.browser) await ctx.browser.close().catch(() => {});
  }
}

async function ensureBrowser(ctx) {
  if (!ctx.browser) ctx.browser = await launchBrowser(ctx.config);
  return ctx.browser;
}

const STAGE_FNS = {
  async validate(ctx) {
    const { workDir, job } = ctx;
    const raw = readJson(path.join(workDir, 'source-story.json'));
    const result = validateStory(raw, { storyDir: job.storyDir });
    writeJson(path.join(workDir, 'validation.json'), { ok: result.ok, errors: result.errors, warnings: result.warnings });
    for (const w of result.warnings) ctx.log.warn(w);
    if (!result.ok) {
      throw new Error(`story validation failed:\n  - ${result.errors.join('\n  - ')}`);
    }
    writeJson(path.join(workDir, 'story.json'), result.story);
    return {
      messages: result.story.messages.length,
      conversations: result.story.conversations.length,
      contacts: result.story.contacts.length,
      warnings: result.warnings.length,
    };
  },

  // Narration: speak each line with Kokoro, then retime the story so each bubble
  // appears when its voice line starts. Without narration, the timed story is a copy.
  async narrate(ctx) {
    const { config, workDir, job } = ctx;
    const story = readJson(path.join(workDir, 'story.json'));
    // --no-audio means a silent render with the authored timing, so narration is skipped too.
    const enabled = !ctx.options.noAudio && (ctx.options.narrate ?? story.narration?.enabled ?? false);
    if (!enabled) {
      writeJson(path.join(workDir, 'story.timed.json'), story);
      writeJson(path.join(workDir, 'narration.json'), { enabled: false, clips: [] });
      return { narration: 'off' };
    }
    const lines = planNarration(story, { defaultVoice: DEFAULT_VOICE, defaultSpeed: 1 }).filter((l) => l.text !== null);
    ctx.tts ??= await KokoroEngine.load({ modelDir: config.ttsModelDir });
    const clips = await renderClips({ engine: ctx.tts, lines, cacheDir: config.ttsCacheDir, log: ctx.log });
    const clipMs = new Map([...clips].map(([id, c]) => [id, c.durationMs]));
    const { story: timed, timeline } = retimeForNarration(story, clipMs, NARRATION_TIMING);
    const check = revalidate(timed, { storyDir: job.storyDir });
    if (!check.ok) throw new Error(`narrated timing failed validation:\n  - ${check.errors.join('\n  - ')}`);
    const rows = timeline.map((row) => {
      const c = clips.get(row.messageId);
      return { ...row, voice: lines.find((l) => l.id === row.messageId).voice, file: c ? c.file : null, cached: c ? c.cached : null };
    });
    writeJson(path.join(workDir, 'story.timed.json'), timed);
    writeJson(path.join(workDir, 'narration.json'), { enabled: true, clips: rows });
    return {
      lines: clips.size,
      cached: [...clips.values()].filter((c) => c.cached).length,
      voices: [...new Set(rows.map((r) => r.voice).filter(Boolean))].length,
      durationSeconds: timed.durationSeconds,
    };
  },

  async layout(ctx) {
    const { config, workDir, job } = ctx;
    const story = readJson(path.join(workDir, 'story.timed.json'));
    const contacts = resolveContacts(story, job.storyDir);
    const conversations = resolveConversations(story, contacts);
    const canvas = { width: config.width, height: config.height };
    const hasBackground = Boolean(story.background);
    const style = styleFor({ story, canvas, hasBackground });
    const browser = await ensureBrowser(ctx);
    const page = await openChatPage(browser, { templateDir: config.templateDir, canvas, payload: style });
    try {
      const layout = await buildStoryLayout({ story, contacts, conversations, page, canvas, hasBackground });
      writeJson(path.join(workDir, 'layout.json'), layout);
      return { conversations: layout.conversations.length, measuredMessages: layout.measurements.length, viewportHeight: layout.viewportH };
    } finally {
      await page.close();
    }
  },

  async render(ctx) {
    const { config, workDir } = ctx;
    const story = readJson(path.join(workDir, 'story.timed.json'));
    const layout = readJson(path.join(workDir, 'layout.json'));
    const durationMs = Math.round(story.durationSeconds * 1000);
    const timeline = buildTimeline(layout.index, { fps: config.fps, durationMs });
    writeJson(path.join(workDir, 'timeline.json'), timeline);

    const browser = await ensureBrowser(ctx);
    const page = await openChatPage(browser, { templateDir: config.templateDir, canvas: layout.canvas, payload: browserPayload(layout) });
    let result;
    try {
      result = await renderStates({
        page,
        timeline,
        framesDir: path.join(workDir, 'frames'),
        transparent: Boolean(story.background),
      });
    } finally {
      await page.close();
    }
    writeJson(path.join(workDir, 'render-manifest.json'), {
      fps: config.fps,
      durationMs,
      totalFrames: timeline.totalFrames,
      runs: timeline.runs.length,
      stills: result.stills,
      sequence: result.sequence,
      issues: result.issues,
    });
    if (result.issues.length) {
      throw new Error(`${result.issues.length} rendered state(s) failed visual verification (see render-manifest.json)`);
    }
    return { stills: result.stills, runs: timeline.runs.length, frames: timeline.totalFrames };
  },

  async encode(ctx) {
    const { config, workDir, job, options } = ctx;
    const story = readJson(path.join(workDir, 'story.timed.json'));
    const narration = readJson(path.join(workDir, 'narration.json'));
    const manifest = readJson(path.join(workDir, 'render-manifest.json'));
    const durationMs = manifest.durationMs;
    const listFile = path.join(workDir, 'frames.txt');
    fs.writeFileSync(listFile, concatList(manifest.sequence, config.fps));

    const noAudio = Boolean(options.noAudio);
    const cues = !noAudio && story.audio.sfx
      ? await ensureCues(ctx.ffmpeg, config.sfxDir, path.join(config.root, 'assets', 'sfx'))
      : {};
    const background = story.background
      ? { file: path.resolve(job.storyDir, story.background.video), dim: story.background.dim }
      : null;
    const spoken = narration.enabled && !noAudio
      ? narration.clips.filter((r) => r.file).map((r) => ({ file: r.file, startMs: r.startMs }))
      : [];
    const audioPlan = buildAudioPlan({
      story,
      storyDir: job.storyDir,
      cues,
      narration: spoken,
      firstInput: background ? 2 : 1,
      durationMs,
      mode: noAudio ? 'none' : 'full',
    });
    const out = path.join(workDir, 'encoded.mp4');
    await encodeVideo({
      ffmpeg: ctx.ffmpeg,
      concatFile: listFile,
      width: config.width,
      height: config.height,
      fps: config.fps,
      durationMs,
      out,
      background,
      audioPlan,
      cwd: workDir,
    });
    return { bytes: fs.statSync(out).size, soundEffects: audioPlan.events - spoken.length, narrationClips: spoken.length, music: audioPlan.music };
  },

  async qa(ctx) {
    const { config, workDir, options } = ctx;
    const manifest = readJson(path.join(workDir, 'render-manifest.json'));
    const result = await qaOutput({
      ffmpeg: ctx.ffmpeg,
      ffprobe: ctx.ffprobe,
      file: path.join(workDir, 'encoded.mp4'),
      expected: { width: config.width, height: config.height, fps: config.fps, durationMs: manifest.durationMs },
      expectAudio: !options.noAudio,
      renderIssues: manifest.issues,
    });
    writeJson(path.join(workDir, 'qa.json'), result);
    if (!result.ok) throw new Error(`QA failed: ${result.failed.join('; ')}`);
    return { checks: result.checks.length, passed: result.checks.filter((c) => c.ok).length };
  },

  async finalize(ctx) {
    const { config, workDir, store, job } = ctx;
    const story = readJson(path.join(workDir, 'story.timed.json'));
    const validation = readJson(path.join(workDir, 'validation.json'));
    const qa = readJson(path.join(workDir, 'qa.json'));
    const manifest = readJson(path.join(workDir, 'render-manifest.json'));
    fs.mkdirSync(path.dirname(job.outputPath), { recursive: true });
    fs.copyFileSync(path.join(workDir, 'encoded.mp4'), job.outputPath);

    // finalize is still running while this report is written, so it is not listed.
    const stages = store.stages(job.id).filter((s) => s.name !== 'finalize');
    const usage = store.usage(job.id);
    const reportPath = job.outputPath.replace(/\.mp4$/i, '') + '.report.json';
    const report = {
      jobId: job.id,
      title: story.title,
      output: job.outputPath,
      durationSeconds: story.durationSeconds,
      resolution: `${config.width}x${config.height}`,
      fps: config.fps,
      stages: stages.map((s) => ({ name: s.name, status: s.status, durationMs: s.durationMs })),
      totalStageMs: stages.reduce((sum, s) => sum + (s.durationMs || 0), 0),
      renderedStills: manifest.stills,
      frames: manifest.totalFrames,
      validation: { warnings: validation.warnings },
      qa: { ok: qa.ok, checks: qa.checks.length },
      api: usage.length
        ? usage.map((u) => ({ provider: u.provider, model: u.model, calls: u.calls, inputTokens: u.input_tokens, outputTokens: u.output_tokens, costUsd: u.cost_usd }))
        : [{ provider: 'manual', model: null, calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 }],
      completedAt: new Date().toISOString(),
    };
    writeJson(reportPath, report);

    if (!job.options.keepTemp) {
      fs.rmSync(path.join(workDir, 'frames'), { recursive: true, force: true });
      fs.rmSync(path.join(workDir, 'encoded.mp4'), { force: true });
    }
    store.updateJob(job.id, { status: 'completed', stage: 'finalize', error: null });
    return { output: job.outputPath, report: reportPath, totalStageMs: report.totalStageMs };
  },
};


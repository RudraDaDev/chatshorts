import fs from 'node:fs';
import path from 'node:path';

// SQLite job persistence using Node's built-in node:sqlite (no native build).
let DatabaseSync;
async function loadSqlite() {
  if (DatabaseSync) return DatabaseSync;
  const origEmit = process.emitWarning;
  // node:sqlite is experimental in Node 22; silence only its experimental banner.
  process.emitWarning = (warning, ...rest) => {
    const text = typeof warning === 'string' ? warning : warning?.message;
    if (text && /SQLite is an experimental/.test(text)) return;
    return origEmit.call(process, warning, ...rest);
  };
  try {
    ({ DatabaseSync } = await import('node:sqlite'));
  } finally {
    process.emitWarning = origEmit;
  }
  return DatabaseSync;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  status TEXT NOT NULL,
  stage TEXT,
  title TEXT,
  story_source TEXT,
  story_dir TEXT,
  story_sha256 TEXT,
  output_path TEXT,
  work_dir TEXT,
  options_json TEXT,
  error TEXT
);
CREATE TABLE IF NOT EXISTS stages (
  job_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  duration_ms INTEGER,
  detail_json TEXT,
  PRIMARY KEY (job_id, name)
);
CREATE TABLE IF NOT EXISTS usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT,
  calls INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0
);
`;

const now = () => new Date().toISOString();

export class JobStore {
  constructor(db) {
    this.db = db;
  }

  static async open(dbPath) {
    const Database = await loadSqlite();
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const db = new Database(dbPath);
    db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    db.exec(SCHEMA);
    return new JobStore(db);
  }

  close() {
    this.db.close();
  }

  createJob(job) {
    const ts = now();
    this.db.prepare(
      `INSERT INTO jobs (id, created_at, updated_at, status, stage, title, story_source, story_dir, story_sha256, output_path, work_dir, options_json)
       VALUES (?, ?, ?, 'queued', NULL, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(job.id, ts, ts, job.title, job.storySource, job.storyDir, job.storySha256, job.outputPath, job.workDir, JSON.stringify(job.options || {}));
    return this.getJob(job.id);
  }

  updateJob(id, patch) {
    const map = { status: 'status', stage: 'stage', title: 'title', outputPath: 'output_path', error: 'error' };
    const sets = ['updated_at = ?'];
    const vals = [now()];
    for (const [k, col] of Object.entries(map)) {
      if (k in patch) {
        sets.push(`${col} = ?`);
        vals.push(patch[k] ?? null);
      }
    }
    this.db.prepare(`UPDATE jobs SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
  }

  getJob(id) {
    const row = this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
    if (!row) return null;
    return {
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      status: row.status,
      stage: row.stage,
      title: row.title,
      storySource: row.story_source,
      storyDir: row.story_dir,
      storySha256: row.story_sha256,
      outputPath: row.output_path,
      workDir: row.work_dir,
      options: JSON.parse(row.options_json || '{}'),
      error: row.error,
    };
  }

  listJobs(limit = 20) {
    return this.db.prepare('SELECT id, created_at, status, stage, title, output_path FROM jobs ORDER BY created_at DESC LIMIT ?')
      .all(limit);
  }

  stageStart(jobId, name) {
    this.db.prepare(
      `INSERT INTO stages (job_id, name, status, started_at) VALUES (?, ?, 'running', ?)
       ON CONFLICT(job_id, name) DO UPDATE SET status = 'running', started_at = excluded.started_at, finished_at = NULL, duration_ms = NULL, detail_json = NULL`,
    ).run(jobId, name, now());
  }

  stageFinish(jobId, name, { status, durationMs, detail, error }) {
    const detailJson = JSON.stringify({ ...(detail || {}), ...(error ? { error } : {}) });
    this.db.prepare(
      'UPDATE stages SET status = ?, finished_at = ?, duration_ms = ?, detail_json = ? WHERE job_id = ? AND name = ?',
    ).run(status, now(), durationMs ?? null, detailJson, jobId, name);
  }

  stages(jobId) {
    return this.db.prepare('SELECT name, status, duration_ms, detail_json FROM stages WHERE job_id = ?').all(jobId)
      .map((r) => ({ name: r.name, status: r.status, durationMs: r.duration_ms, detail: JSON.parse(r.detail_json || '{}') }));
  }

  stageDone(jobId, name) {
    const row = this.db.prepare('SELECT status FROM stages WHERE job_id = ? AND name = ?').get(jobId, name);
    return Boolean(row && row.status === 'done');
  }

  recordUsage(jobId, u) {
    this.db.prepare(
      `INSERT INTO usage (job_id, created_at, provider, model, calls, input_tokens, output_tokens, cost_usd)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(jobId, now(), u.provider, u.model ?? null, u.calls ?? 0, u.inputTokens ?? 0, u.outputTokens ?? 0, u.costUsd ?? 0);
  }

  usage(jobId) {
    return this.db.prepare(
      `SELECT provider, model, SUM(calls) AS calls, SUM(input_tokens) AS input_tokens,
              SUM(output_tokens) AS output_tokens, SUM(cost_usd) AS cost_usd
       FROM usage WHERE job_id = ? GROUP BY provider, model`,
    ).all(jobId);
  }
}

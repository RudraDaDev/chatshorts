import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

export const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');

/** Minimal .env loader (KEY=VALUE lines). Real environment variables win. */
function loadDotEnv(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function loadConfig(env = process.env) {
  const merged = { ...loadDotEnv(path.join(ROOT, '.env')), ...env };
  const num = (key, fallback) => {
    const v = merged[key];
    if (v === undefined || v === '') return fallback;
    const n = Number(v);
    if (Number.isNaN(n)) throw new Error(`${key} must be a number, got "${v}"`);
    return n;
  };
  const tempDir = path.resolve(ROOT, merged.CHATSHORTS_TEMP_DIR || 'temp');
  const outputDir = path.resolve(ROOT, merged.CHATSHORTS_OUTPUT_DIR || 'output');
  return {
    root: ROOT,
    width: num('CHATSHORTS_WIDTH', 1080),
    height: num('CHATSHORTS_HEIGHT', 1920),
    fps: num('CHATSHORTS_FPS', 30),
    tempDir,
    outputDir,
    dbPath: path.resolve(ROOT, merged.CHATSHORTS_DB || path.join(tempDir, 'chatshorts.sqlite')),
    templateDir: path.join(ROOT, 'templates', 'imessage'),
    sfxDir: path.resolve(ROOT, merged.CHATSHORTS_SFX_DIR || path.join('assets', 'generated', 'sfx')),
    chromePath: merged.CHROME_PATH || null,
    ffmpegPath: merged.FFMPEG_PATH || null,
    ffprobePath: merged.FFPROBE_PATH || null,
    storyProvider: merged.STORY_PROVIDER || 'manual',
  };
}

// Downloads the Kokoro-82M weights and voice files into assets/models/kokoro.
// Sources are npm packages (reachable from most networks, no Hugging Face needed):
//   - kokoro-q8-shards@1.0.0: the q8 model_quantized.onnx from
//     onnx-community/Kokoro-82M-v1.0-ONNX, split in six parts (Apache-2.0).
//     The joined file is checked against the SHA-256 the package publishes.
//   - kokoro-js@1.2.1: voices/*.bin (Apache-2.0), one float32 style table per voice.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ENGLISH_VOICES } from './voices.js';

export const MODEL_SHA256 = 'fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478';
const SHARDS_TGZ = 'https://registry.npmjs.org/kokoro-q8-shards/-/kokoro-q8-shards-1.0.0.tgz';
const VOICES_TGZ = 'https://registry.npmjs.org/kokoro-js/-/kokoro-js-1.2.1.tgz';
const PARTS = 6;

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed (${res.status}): ${url}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

function extract(tgz, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const r = spawnSync('tar', ['xzf', tgz, '-C', dest], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`tar failed for ${tgz}: ${r.stderr}`);
}

const sha256File = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/** @returns {Promise<{ model: string, voices: number }>} */
export async function fetchKokoroAssets({ dir, log }) {
  fs.mkdirSync(path.join(dir, 'voices'), { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kokoro-'));
  try {
    const modelFile = path.join(dir, 'model_quantized.onnx');
    if (fs.existsSync(modelFile) && sha256File(modelFile) === MODEL_SHA256) {
      log?.info('model already present and verified');
    } else {
      log?.info('downloading model weights (about 92 MB)');
      const tgz = path.join(tmp, 'shards.tgz');
      await download(SHARDS_TGZ, tgz);
      const shardDir = path.join(tmp, 'shards');
      extract(tgz, shardDir);
      const parts = Array.from({ length: PARTS }, (_, i) => path.join(shardDir, 'package', `kokoro-q8.part${i}.bin`));
      const joined = path.join(tmp, 'model_quantized.onnx');
      fs.writeFileSync(joined, Buffer.alloc(0));
      for (const p of parts) fs.appendFileSync(joined, fs.readFileSync(p));
      const sha = sha256File(joined);
      if (sha !== MODEL_SHA256) throw new Error(`model checksum mismatch: got ${sha}, expected ${MODEL_SHA256}`);
      fs.renameSync(joined, modelFile);
    }

    log?.info('downloading voice files');
    const vtgz = path.join(tmp, 'voices.tgz');
    await download(VOICES_TGZ, vtgz);
    const vdir = path.join(tmp, 'voices-pkg');
    extract(vtgz, vdir);
    let count = 0;
    for (const voice of ENGLISH_VOICES) {
      const src = path.join(vdir, 'package', 'voices', `${voice}.bin`);
      if (!fs.existsSync(src)) throw new Error(`voice missing from package: ${voice}`);
      fs.copyFileSync(src, path.join(dir, 'voices', `${voice}.bin`));
      count++;
    }
    return { model: modelFile, voices: count };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

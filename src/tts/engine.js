// Kokoro-82M text-to-speech on CPU via onnxruntime-node. No network access
// at synthesis time: the model and voice files come from assets/models/kokoro
// (see fetch-model.js).
import fs from 'node:fs';
import path from 'node:path';
import * as ort from 'onnxruntime-node';
import { phonemize } from './phonemize.js';
import { voiceAccent } from './voices.js';

export const SAMPLE_RATE = 24000;
const STYLE_DIM = 256;
const MAX_TOKENS = 510; // Kokoro's context limit, excluding the BOS/EOS pad tokens
const VOCAB = JSON.parse(fs.readFileSync(new URL('./kokoro-vocab.json', import.meta.url), 'utf8')).vocab;

export class KokoroEngine {
  /** @param {{ modelDir: string }} opts  directory from fetch-model.js */
  static async load({ modelDir }) {
    const modelFile = path.join(modelDir, 'model_quantized.onnx');
    if (!fs.existsSync(modelFile)) {
      throw new Error(`Kokoro model not found at ${modelFile}. Run: node src/cli.js tts-assets`);
    }
    const session = await ort.InferenceSession.create(modelFile, { executionProviders: ['cpu'] });
    return new KokoroEngine(session, path.join(modelDir, 'voices'));
  }

  constructor(session, voiceDir) {
    this.session = session;
    this.voiceDir = voiceDir;
    this.voices = new Map();
  }

  loadVoice(voice) {
    if (!this.voices.has(voice)) {
      const file = path.join(this.voiceDir, `${voice}.bin`);
      if (!fs.existsSync(file)) throw new Error(`voice file not found: ${file}. Run: node src/cli.js tts-assets`);
      const buf = fs.readFileSync(file);
      // Little-endian float32 table of shape [510, 256]; row n is the style for n phoneme tokens.
      this.voices.set(voice, new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4));
    }
    return this.voices.get(voice);
  }

  /**
   * Speak `text` in `voice`. Returns mono float samples at 24 kHz.
   * @returns {Promise<{ samples: Float32Array, sampleRate: number, phonemes: string, dropped: string[] }>}
   */
  async synthesize(text, { voice, speed = 1 }) {
    const phonemes = await phonemize(text, voiceAccent(voice));
    const ids = [];
    const dropped = [];
    for (const ch of Array.from(phonemes)) {
      if (ch in VOCAB) ids.push(VOCAB[ch]);
      else if (ch.trim()) dropped.push(ch);
    }
    if (ids.length === 0) throw new Error(`no speakable phonemes for "${text.slice(0, 40)}"`);
    if (ids.length > MAX_TOKENS) {
      throw new Error(`narration too long for one clip (${ids.length} phoneme tokens, max ${MAX_TOKENS}): shorten "${text.slice(0, 40)}..."`);
    }
    const style = this.loadVoice(voice).slice(ids.length * STYLE_DIM, ids.length * STYLE_DIM + STYLE_DIM);
    const inputIds = [0, ...ids, 0];
    const feeds = {
      input_ids: new ort.Tensor('int64', BigInt64Array.from(inputIds, (v) => BigInt(v)), [1, inputIds.length]),
      style: new ort.Tensor('float32', style, [1, STYLE_DIM]),
      speed: new ort.Tensor('float32', Float32Array.of(speed), [1]),
    };
    const out = await this.session.run(feeds);
    const samples = Float32Array.from(out.waveform.data);
    return { samples, sampleRate: SAMPLE_RATE, phonemes, dropped };
  }
}

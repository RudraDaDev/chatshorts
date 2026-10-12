// Kokoro-82M English voices. Ids follow Kokoro's naming: first letter = accent
// (a = American, b = British), second = gender (f/m). Other-language voices are
// not listed: they need a different phonemizer than the English path here.
export const ENGLISH_VOICES = Object.freeze([
  'af_alloy', 'af_aoede', 'af_bella', 'af_heart', 'af_jessica', 'af_kore', 'af_nicole',
  'af_nova', 'af_river', 'af_sarah', 'af_sky',
  'am_adam', 'am_echo', 'am_eric', 'am_fenrir', 'am_liam', 'am_michael', 'am_onyx', 'am_puck', 'am_santa',
  'bf_alice', 'bf_emma', 'bf_isabella', 'bf_lily',
  'bm_daniel', 'bm_fable', 'bm_george', 'bm_lewis',
]);

export const DEFAULT_VOICE = 'af_heart';

/** Kokoro's phonemizer language: 'a' = en-us, 'b' = en-gb. */
export function voiceAccent(voice) {
  return voice.charAt(0) === 'b' ? 'b' : 'a';
}

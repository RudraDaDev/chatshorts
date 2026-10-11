import { readStoryScript } from '../stories/load.js';

/**
 * Story providers turn "a source of story JSON" into a raw story object.
 *
 * The product currently runs with the "manual" provider: the story script is
 * written outside this tool (by you, or by any AI tool you use) and passed in
 * as JSON. No LLM API key is used, so there is no per-video API cost.
 *
 * An API-backed provider can be added later behind the same `load` contract
 * without changing validation, layout, rendering, or QA.
 */
export const PROVIDERS = Object.freeze({
  manual: {
    name: 'manual',
    description: 'Story JSON supplied by the user (file or stdin). No API calls.',
    async load({ source }) {
      const { raw, storyDir } = readStoryScript(source);
      return { raw, storyDir, usage: { provider: 'manual', model: null, calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 } };
    },
  },
});

export function createStoryProvider(name = 'manual') {
  const provider = PROVIDERS[name];
  if (!provider) {
    throw new Error(`unknown story provider "${name}". Available: ${Object.keys(PROVIDERS).join(', ')}`);
  }
  return provider;
}

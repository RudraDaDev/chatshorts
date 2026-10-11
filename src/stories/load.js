import fs from 'node:fs';
import path from 'node:path';

/**
 * Read a story script from a file path, or from stdin when source is "-".
 * Returns the parsed JSON plus the directory used to resolve relative assets.
 */
export function readStoryScript(source) {
  let text;
  let storyDir;
  if (source === '-') {
    text = fs.readFileSync(0, 'utf8');
    storyDir = process.cwd();
  } else {
    const abs = path.resolve(source);
    if (!fs.existsSync(abs)) throw new Error(`story file not found: ${source}`);
    text = fs.readFileSync(abs, 'utf8');
    storyDir = path.dirname(abs);
  }
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new Error(`story is not valid JSON: ${err.message}`);
  }
  return { raw, storyDir };
}

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import puppeteer from 'puppeteer-core';

// Launches Chromium used as a layout/rendering engine (not screen recording).
// Resolution order: CHROME_PATH env -> common desktop installs -> bundled
// @sparticuz/chromium (Linux x64). The bundled build may need its shared
// libraries extracted; that is handled here.

const DESKTOP_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

export async function resolveChromium({ chromePath, cacheDir }) {
  if (chromePath) return { executablePath: chromePath, args: [], env: {} };
  for (const p of DESKTOP_PATHS) {
    if (fs.existsSync(p)) return { executablePath: p, args: [], env: {} };
  }
  if (process.platform === 'linux' && process.arch === 'x64') {
    const { default: chromium } = await import('@sparticuz/chromium');
    const executablePath = await chromium.executablePath();
    const libDir = await extractBundledLibs(cacheDir);
    return {
      executablePath,
      args: chromium.args,
      env: libDir ? { LD_LIBRARY_PATH: `${libDir}:${process.env.LD_LIBRARY_PATH || ''}` } : {},
    };
  }
  throw new Error('No Chromium found. Install Chrome/Chromium or set CHROME_PATH in .env.');
}

function findPackageRoot(file) {
  let dir = path.dirname(file);
  while (!fs.existsSync(path.join(dir, 'package.json'))) {
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`no package.json above ${file}`);
    dir = parent;
  }
  return dir;
}

// The bundled Chromium needs NSS/NSPR libraries that are not always on the system.
async function extractBundledLibs(cacheDir) {
  const pkgDir = findPackageRoot(url.fileURLToPath(import.meta.resolve('@sparticuz/chromium')));
  const archive = path.join(pkgDir, 'bin', 'al2023.tar.br');
  if (!fs.existsSync(archive)) return null;
  const libDir = path.join(cacheDir, 'chromium-libs', 'lib');
  if (fs.existsSync(path.join(libDir, 'libnspr4.so'))) return libDir;
  const zlib = await import('node:zlib');
  const { execFileSync } = await import('node:child_process');
  const dest = path.join(cacheDir, 'chromium-libs');
  fs.mkdirSync(dest, { recursive: true });
  const tar = path.join(dest, 'al2023.tar');
  fs.writeFileSync(tar, zlib.brotliDecompressSync(fs.readFileSync(archive)));
  execFileSync('tar', ['-xf', tar, '-C', dest]);
  fs.rmSync(tar, { force: true });
  return libDir;
}

export async function launchBrowser(config) {
  const chromium = await resolveChromium({ chromePath: config.chromePath, cacheDir: config.tempDir });
  const browser = await puppeteer.launch({
    executablePath: chromium.executablePath,
    headless: true,
    args: [...chromium.args, '--font-render-hinting=none', '--disable-gpu', '--hide-scrollbars'],
    env: { ...process.env, ...chromium.env },
    defaultViewport: null,
  });
  return browser;
}

export function chatPageUrl(templateDir) {
  return url.pathToFileURL(path.join(templateDir, 'chat.html')).href;
}

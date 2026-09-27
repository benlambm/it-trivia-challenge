// Shared helpers: load an offline page into happy-dom (from web/node_modules) with scripts enabled.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Browser } from '../../web/node_modules/happy-dom/lib/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const PAGES = ['index.html', 'index-sound.html'];

export function readPage(name = 'index.html') {
  return fs.readFileSync(path.join(here, '..', name), 'utf8');
}
export const readIndex = () => readPage('index.html');

// page: which offline file to load. headScript: JS injected before the page's own scripts (test stubs).
export async function loadPage({ page: pageName = 'index.html', headScript = '' } = {}) {
  const browser = new Browser({
    settings: {
      // The page under test is our own file, not untrusted content.
      enableJavaScriptEvaluation: true,
      suppressInsecureJavaScriptEnvironmentWarning: true,
      disableCSSFileLoading: true,
      disableJavaScriptFileLoading: true,
    },
  });
  const page = browser.newPage();
  const html = readPage(pageName);
  page.content = headScript ? html.replace('<head>', `<head><script>${headScript}</script>`) : html;
  await page.waitUntilComplete();
  const window = page.mainFrame.window;
  const document = page.mainFrame.document;
  const TRIVIA = window.TRIVIA;
  if (!TRIVIA) throw new Error('window.TRIVIA is missing: the inline script did not run');
  return {
    browser,
    page,
    window,
    document,
    TRIVIA,
    errors: () => page.virtualConsolePrinter.readAsString(),
    click: (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })),
    key: (key) => document.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true })),
    close: () => browser.close(),
  };
}

// Copies a value out of the page's VM realm so assert.deepStrictEqual can compare prototypes.
export const plain = (value) => JSON.parse(JSON.stringify(value));

// Real-time pause so the page's own (window) timers can fire.
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Small deterministic PRNG for reproducible geometry/selection tests.
export function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

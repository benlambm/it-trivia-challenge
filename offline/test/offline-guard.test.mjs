import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readIndex } from './helpers.mjs';

const html = readIndex();

test('index.html references no external resources', () => {
  const external = html.match(/(?:src|href)\s*=\s*["']\s*(?:https?:)?\/\//gi) || [];
  assert.deepEqual(external, []);
  assert.doesNotMatch(html, /url\(\s*["']?\s*(?:https?:)?\/\//i);
  assert.doesNotMatch(html, /@import/i);
  assert.doesNotMatch(html, /<link[^>]+rel=["']stylesheet/i);
});

test('index.html uses no fetch, modules or imports (file:// safe)', () => {
  assert.doesNotMatch(html, /\bfetch\s*\(/);
  assert.doesNotMatch(html, /type\s*=\s*["']module["']/i);
  assert.doesNotMatch(html, /^\s*import\s/m);
  assert.doesNotMatch(html, /XMLHttpRequest|localStorage|sessionStorage|indexedDB/);
});

test('index.html embeds a non-empty question bank and stays under 200 KB', () => {
  const block = html.match(/<script type="application\/json" id="question-sets">\s*([\s\S]*?)\s*<\/script>/);
  assert.ok(block, 'question-sets block missing');
  const sets = JSON.parse(block[1]);
  assert.ok(Array.isArray(sets) && sets.length >= 1, 'bank is empty: run node offline/build-bank.mjs');
  assert.ok(Buffer.byteLength(html, 'utf8') < 200 * 1024);
  assert.doesNotMatch(block[1], /<\/script/i);
});

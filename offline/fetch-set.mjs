#!/usr/bin/env node
// Fetches one 25-question set from the live API and saves it under offline/sets/.
// Usage: node offline/fetch-set.mjs [--difficulty easier] [--base https://trivia.benlamb.net]
// Never touches index.html; run build-bank.mjs afterwards to embed the new set.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AREAS, DIFFICULTIES, validateSet } from './lib/bank.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};
const difficulty = option('--difficulty', 'easier');
const base = option('--base', 'https://trivia.benlamb.net').replace(/\/$/, '');

if (!DIFFICULTIES.includes(difficulty)) {
  console.error(`--difficulty must be one of: ${DIFFICULTIES.join(', ')}`);
  process.exit(2);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const setsDir = path.join(here, 'sets');
fs.mkdirSync(setsDir, { recursive: true });

let n = 1;
const idFor = (k) => `${difficulty}-${String(k).padStart(3, '0')}`;
while (fs.existsSync(path.join(setsDir, `${idFor(n)}.json`))) n += 1;
const id = idFor(n);

console.log(`Fetching a "${difficulty}" set from ${base} as ${id} (generation takes 10-60 s)...`);

let model = 'unknown';
try {
  const health = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(15_000) });
  const body = await health.json();
  if (body && body.model) model = body.model;
} catch (err) {
  console.warn(`health check failed (${err.message}); model will be recorded as "unknown"`);
}

const started = Date.now();
let response;
let text;
try {
  // nginx allows 180 s for /api/; Node's fetch sends no Origin header, so the API's origin guard passes.
  response = await fetch(`${base}/api/questions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ difficulty }),
    signal: AbortSignal.timeout(185_000),
  });
  text = await response.text();
} catch (err) {
  console.error(`request failed: ${err.message}`);
  process.exit(1);
}
if (!response.ok) {
  console.error(`API ${response.status}: ${text.slice(0, 500)}`);
  process.exit(1);
}

let payload;
try {
  payload = JSON.parse(text);
} catch {
  console.error('API returned a non-JSON body');
  process.exit(1);
}

const str = (v) => String(v ?? '').trim();
const questions = (Array.isArray(payload.questions) ? payload.questions : []).map((q) => ({
  category: str(q.category),
  text: str(q.text),
  options: (Array.isArray(q.options) ? q.options : []).map(str),
  correctAnswer: str(q.correctAnswer),
}));

const set = {
  id,
  difficulty,
  model,
  generatedAt: new Date().toISOString(),
  source: `${base}/api/questions`,
  questions,
};

const { errors, warnings } = validateSet(set, { fileName: `${id}.json` });
warnings.forEach((w) => console.warn(`warning: ${w}`));
if (errors.length) {
  const dump = path.join(os.tmpdir(), `trivia-rejected-${Date.now()}.json`);
  fs.writeFileSync(dump, text);
  errors.forEach((e) => console.error(`error: ${e}`));
  console.error(`Rejected the set (${errors.length} error(s)); raw response saved to ${dump}`);
  process.exit(1);
}

const outPath = path.join(setsDir, `${id}.json`);
fs.writeFileSync(outPath, `${JSON.stringify(set, null, 2)}\n`);
console.log(`Saved ${path.relative(process.cwd(), outPath)} in ${((Date.now() - started) / 1000).toFixed(1)} s (model ${model}).`);
for (const area of AREAS) {
  console.log(`  ${area}: ${questions.filter((q) => q.category === area).length}`);
}
console.log('Next: node offline/build-bank.mjs');

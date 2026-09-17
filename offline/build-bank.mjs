#!/usr/bin/env node
// Validates every offline/sets/*.json and embeds them into offline/index.html.
// Usage: node offline/build-bank.mjs          (rewrite the block in index.html)
//        node offline/build-bank.mjs --check  (exit 1 if index.html is stale or a set is invalid)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { AREAS, extractBlock, replaceBlock, serializeSets, validateBank, validateSet } from './lib/bank.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const setsDir = path.join(here, 'sets');
const indexPath = path.join(here, 'index.html');
const checkOnly = process.argv.includes('--check');
const rel = (p) => path.relative(process.cwd(), p) || p;

const files = fs.existsSync(setsDir)
  ? fs.readdirSync(setsDir).filter((f) => f.endsWith('.json')).sort()
  : [];
if (!files.length) {
  console.error(`No question sets found in ${rel(setsDir)}. Run: node offline/fetch-set.mjs`);
  process.exit(1);
}

const sets = [];
const errors = [];
const warnings = [];
for (const file of files) {
  let set;
  try {
    set = JSON.parse(fs.readFileSync(path.join(setsDir, file), 'utf8'));
  } catch (err) {
    errors.push(`${file}: invalid JSON (${err.message})`);
    continue;
  }
  const result = validateSet(set, { fileName: file });
  errors.push(...result.errors);
  warnings.push(...result.warnings);
  if (!result.errors.length) sets.push(set);
}
const bank = validateBank(sets);
errors.push(...bank.errors);
warnings.push(...bank.warnings);

warnings.forEach((w) => console.warn(`warning: ${w}`));
if (errors.length) {
  errors.forEach((e) => console.error(`error: ${e}`));
  console.error(`${errors.length} error(s); ${rel(indexPath)} not modified.`);
  process.exit(1);
}

if (!fs.existsSync(indexPath)) {
  console.error(`${rel(indexPath)} does not exist`);
  process.exit(1);
}
const body = serializeSets(sets);
const html = fs.readFileSync(indexPath, 'utf8');

if (checkOnly) {
  if (extractBlock(html) === body) {
    console.log(`${rel(indexPath)} bank is up to date (${sets.length} set(s), ${files.length} file(s)).`);
    process.exit(0);
  }
  console.error(`${rel(indexPath)} bank is stale: run node offline/build-bank.mjs`);
  process.exit(1);
}

fs.writeFileSync(indexPath, replaceBlock(html, body));
const roundTrip = JSON.parse(extractBlock(fs.readFileSync(indexPath, 'utf8')));
if (!isDeepStrictEqual(roundTrip, sets)) {
  console.error('round-trip mismatch after writing index.html; inspect the file');
  process.exit(1);
}

for (const set of sets) {
  const counts = AREAS.map((a) => set.questions.filter((q) => q.category === a).length).join('/');
  console.log(`${set.id}  ${set.model}  ${set.generatedAt}  per-area ${counts}`);
}
const total = sets.reduce((sum, s) => sum + s.questions.length, 0);
console.log(`Embedded ${sets.length} set(s), ${total} questions into ${rel(indexPath)}.`);

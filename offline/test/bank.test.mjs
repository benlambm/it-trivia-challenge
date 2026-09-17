import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AREAS, BLOCK_OPEN, BLOCK_CLOSE, extractBlock, normalizeText, replaceBlock, serializeSets, validateBank, validateSet,
} from '../lib/bank.mjs';

function makeSet(id = 'easier-001') {
  const questions = [];
  AREAS.forEach((category, a) => {
    for (let i = 0; i < 5; i++) {
      const n = a * 5 + i + 1;
      questions.push({
        category,
        text: `Question ${n} about ${category}?`,
        options: [`Right ${n}`, `Wrong ${n}a`, `Wrong ${n}b`, `Wrong ${n}c`],
        correctAnswer: `Right ${n}`,
      });
    }
  });
  return { id, difficulty: 'easier', model: 'test-model', generatedAt: '2026-09-17T00:00:00.000Z', source: 'test', questions };
}

test('a well-formed set passes with no errors', () => {
  const { errors, warnings } = validateSet(makeSet(), { fileName: 'easier-001.json' });
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
});

test('id must match the file name', () => {
  const { errors } = validateSet(makeSet('easier-002'), { fileName: 'easier-001.json' });
  assert.ok(errors.some((e) => e.includes('must equal the file name')));
});

test('rejects wrong question count, unknown category and uneven areas', () => {
  const set = makeSet();
  set.questions[0].category = 'Cooking';
  const { errors } = validateSet(set);
  assert.ok(errors.some((e) => e.includes('unknown category "Cooking"')));
  assert.ok(errors.some((e) => e.startsWith(`${AREAS[0]}: expected 5 questions, found 4`)));
  const short = makeSet();
  short.questions.pop();
  assert.ok(validateSet(short).errors.some((e) => e.includes('expected 25 questions, found 24')));
});

test('rejects bad options and a correctAnswer that is not exactly an option', () => {
  const set = makeSet();
  set.questions[3].correctAnswer = 'right 4'; // case differs: the quiz compares strictly
  set.questions[4].options = ['a', 'b', 'c'];
  set.questions[5].options = ['x', 'x ', 'y', 'z'];
  set.questions[5].correctAnswer = 'x';
  set.questions[6].options = ['', 'b', 'c', 'd'];
  const { errors } = validateSet(set);
  assert.ok(errors.some((e) => e.includes('question 4') && e.includes('not exactly one of the options')));
  assert.ok(errors.some((e) => e.includes('question 5') && e.includes('expected exactly 4 options')));
  assert.ok(errors.some((e) => e.includes('question 6') && e.includes('duplicate option')));
  assert.ok(errors.some((e) => e.includes('question 7') && e.includes('option 1 is empty')));
});

test('rejects duplicate question text within a set and across sets', () => {
  const set = makeSet();
  set.questions[1].text = `${set.questions[0].text} `;
  assert.ok(validateSet(set).errors.some((e) => e.includes('question 2: duplicate of question 1')));
  const a = makeSet('easier-001');
  const b = makeSet('easier-002');
  b.questions = b.questions.map((q, i) => ({ ...q, text: i === 0 ? q.text : `${q.text} (B)` }));
  const bank = validateBank([a, b]);
  assert.ok(bank.errors.some((e) => e.includes('easier-002 question 1 duplicates easier-001 question 1')));
  assert.ok(validateBank([a, makeSet('easier-001')]).errors.some((e) => e.includes('duplicate set id')));
});

test('warnings for long text, repeated answers and non-canonical order', () => {
  const set = makeSet();
  set.questions[0].text = 'x'.repeat(181) + '?';
  set.questions[0].options[1] = 'y'.repeat(61);
  set.questions[1].correctAnswer = set.questions[1].options[1] = 'Right 1';
  const tmp = set.questions[0];
  set.questions[0] = set.questions[24];
  set.questions[24] = tmp;
  const { errors, warnings } = validateSet(set);
  assert.deepEqual(errors, []);
  assert.ok(warnings.some((w) => w.includes('long for phones')));
  assert.ok(warnings.some((w) => w.includes('also the answer to question')));
  assert.ok(warnings.some((w) => w.includes('canonical order')));
});

test('normalizeText folds case, whitespace and trailing punctuation', () => {
  assert.equal(normalizeText('  What is  DNS? '), 'what is dns');
  assert.equal(normalizeText(null), '');
});

test('serializeSets escapes script-breaking characters and round-trips through JSON.parse', () => {
  const set = makeSet();
  set.questions[0].text = 'Is 1 < 2 && "</script>" safe?' + String.fromCharCode(0x2028);
  const body = serializeSets([set]);
  assert.ok(!body.includes('</script'));
  assert.ok(!body.includes('<'));
  assert.ok(!body.includes('&'));
  assert.ok(!body.includes(String.fromCharCode(0x2028)));
  assert.deepEqual(JSON.parse(body), [set]);
  assert.equal(body.split('\n').length, 1 + 1 + 25 + 1 + 1); // [ header 25×question ]} ]
});

test('extractBlock/replaceBlock round-trip and reject missing or duplicate blocks', () => {
  const html = `<html><body>\n${BLOCK_OPEN}\n[]\n${BLOCK_CLOSE}\n<script>app()</script></body></html>`;
  assert.equal(extractBlock(html), '[]');
  const body = serializeSets([makeSet()]);
  const next = replaceBlock(html, body);
  assert.equal(extractBlock(next), body);
  assert.ok(next.endsWith('<script>app()</script></body></html>'));
  assert.throws(() => extractBlock('<html></html>'), /not found/);
  assert.throws(() => extractBlock(`${BLOCK_OPEN}[]${BLOCK_CLOSE}${BLOCK_OPEN}[]${BLOCK_CLOSE}`), /more than once/);
  assert.throws(() => extractBlock(`${BLOCK_OPEN}[]`), /not closed/);
});

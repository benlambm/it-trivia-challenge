import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage, plain, seeded } from './helpers.mjs';

let ctx;
before(async () => { ctx = await loadPage(); });
after(async () => { await ctx.close(); });

test('polar conventions: 0° is 12 o\'clock, 90° is 3 o\'clock', () => {
  const { polarToXY } = ctx.TRIVIA.geom;
  const top = polarToXY(200, 200, 190, 0);
  assert.equal(Math.round(top.x), 200);
  assert.equal(Math.round(top.y), 10);
  const right = polarToXY(200, 200, 190, 90);
  assert.equal(Math.round(right.x), 390);
  assert.equal(Math.round(right.y), 200);
});

test('wedge 0 path starts at the top and sweeps clockwise', () => {
  const { wedgePath, wedgeMid, wedgeStart } = ctx.TRIVIA.geom;
  assert.ok(wedgePath(200, 200, 190, 0).startsWith('M 200 200 L 200 10 A 190 190 0 0 1 '));
  assert.equal(wedgeStart(1), 72);
  assert.equal(wedgeMid(0), 36);
  assert.equal(wedgeMid(4), 324);
});

test('rest rotation puts wedge 0 under the pointer', () => {
  const { areaIndexAtPointer } = ctx.TRIVIA.geom;
  assert.equal(areaIndexAtPointer(ctx.TRIVIA.WHEEL.restRotation), 0);
  assert.equal(areaIndexAtPointer(-36 - 72), 1);
  assert.equal(areaIndexAtPointer(-36 - 72 * 4), 4);
  assert.equal(areaIndexAtPointer(-36 - 72 * 5), 0);
});

test('targetRotation always lands on the chosen winner after at least 4 turns (1000 seeded spins)', () => {
  const { targetRotation, areaIndexAtPointer } = ctx.TRIVIA.geom;
  const rand = seeded(42);
  let current = ctx.TRIVIA.WHEEL.restRotation;
  const landed = [0, 0, 0, 0, 0];
  for (let i = 0; i < 1000; i++) {
    const winner = Math.floor(rand() * 5);
    const next = targetRotation(current, winner, { rand });
    assert.equal(areaIndexAtPointer(next), winner, `spin ${i}: expected ${winner} at rotation ${next}`);
    assert.ok(next - current >= 360 * 4, `spin ${i}: only ${next - current} degrees`);
    assert.ok(next - current < 360 * 7, `spin ${i}: too far, ${next - current} degrees`);
    landed[winner] += 1;
    current = next;
  }
  assert.ok(landed.every((n) => n > 150), `winners look biased: ${landed}`);
});

test('reduced-motion spin (0 turns) still lands on the winner', () => {
  const { targetRotation, areaIndexAtPointer } = ctx.TRIVIA.geom;
  const rand = seeded(7);
  for (let i = 0; i < 200; i++) {
    const winner = Math.floor(rand() * 5);
    const current = rand() * 3600 - 1800;
    const next = targetRotation(current, winner, { rand, turnsMin: 0, turnsMax: 0 });
    assert.equal(areaIndexAtPointer(next), winner);
    assert.ok(next >= current && next - current < 360);
  }
});

test('shuffle returns a permutation and leaves the input untouched', () => {
  const { shuffle } = ctx.TRIVIA.select;
  const input = ['a', 'b', 'c', 'd'];
  const out = shuffle(input, seeded(3));
  assert.deepEqual([...out].sort(), input);
  assert.deepEqual(input, ['a', 'b', 'c', 'd']);
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(shuffle(input, seeded(i)).join(''));
  assert.ok(seen.size > 10, 'shuffle is not producing varied orders');
});

test('deal: a 5-question pool yields all 5 every time, in varying order, never duplicated', () => {
  const { newDeck, deal } = ctx.TRIVIA.select;
  const pool = [1, 2, 3, 4, 5].map((n) => ({ id: `q${n}`, text: `t${n}` }));
  let deck = newDeck(pool, seeded(1));
  const orders = new Set();
  for (let round = 0; round < 6; round++) {
    const result = deal(deck, 5, seeded(round + 10));
    deck = result.deck;
    assert.deepEqual(plain(result.dealt.map((q) => q.id)).sort(), ['q1', 'q2', 'q3', 'q4', 'q5']);
    orders.add(result.dealt.map((q) => q.id).join(''));
  }
  assert.ok(orders.size > 1, 'the same order was dealt every time');
});

test('deal: a larger pool serves every question before repeating any', () => {
  const { newDeck, deal } = ctx.TRIVIA.select;
  const pool = Array.from({ length: 12 }, (_, i) => ({ id: `q${i}` }));
  let deck = newDeck(pool, seeded(5));
  const served = [];
  for (let round = 0; round < 3; round++) {
    const result = deal(deck, 5, seeded(round));
    deck = result.deck;
    assert.equal(new Set(result.dealt.map((q) => q.id)).size, 5, 'duplicate inside one deal');
    served.push(...result.dealt.map((q) => q.id));
  }
  assert.equal(new Set(served.slice(0, 12)).size, 12, 'a question repeated before all 12 were seen');
});

test('prepareQuestion shuffles options but keeps correctAnswer text intact', () => {
  const { prepareQuestion, isCorrect } = ctx.TRIVIA.select;
  const q = { id: 'x', category: 'c', text: 't', options: ['A', 'B', 'C', 'D'], correctAnswer: 'C' };
  const p = prepareQuestion(q, seeded(9));
  assert.deepEqual([...p.options].sort(), ['A', 'B', 'C', 'D']);
  assert.equal(p.correctAnswer, 'C');
  assert.ok(isCorrect(p, 'C'));
  assert.ok(!isCorrect(p, 'A'));
});

test('embedded bank feeds five pools of at least 5 questions each', () => {
  const { pools, AREAS, QUESTION_SETS } = ctx.TRIVIA;
  assert.ok(QUESTION_SETS.length >= 1);
  for (const area of AREAS) {
    assert.ok(pools[area.name].length >= 5, `${area.name} has ${pools[area.name].length} questions`);
    for (const q of pools[area.name]) {
      assert.equal(q.options.length, 4);
      assert.ok(q.options.includes(q.correctAnswer));
    }
  }
});

test('scoreBand copy and celebrate threshold', () => {
  const { scoreBand, percent } = ctx.TRIVIA;
  assert.deepEqual(plain(scoreBand(5, 5)), { title: 'Perfect score!', message: 'You crushed it. Future IT pro spotted.', celebrate: true });
  assert.equal(scoreBand(4, 5).title, 'Excellent!');
  assert.equal(scoreBand(3, 5).title, 'Nice work!');
  assert.equal(scoreBand(3, 5).celebrate, true);
  assert.equal(scoreBand(2, 5).title, 'Good try!');
  assert.equal(scoreBand(2, 5).celebrate, false);
  assert.equal(scoreBand(1, 5).title, 'Thanks for playing!');
  assert.equal(scoreBand(0, 5).title, 'Thanks for playing!');
  assert.equal(percent(4, 5), 80);
  assert.equal(percent(0, 0), 0);
});

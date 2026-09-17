import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage, plain, sleep } from './helpers.mjs';

const visible = (document, id) => !document.getElementById(id).hidden;
const options = (document) => [...document.querySelectorAll('#options .option')];

test('page boots on the launch screen with five wedges and no console errors', async () => {
  const ctx = await loadPage();
  try {
    const { document } = ctx;
    assert.equal(document.querySelectorAll('#wheel .wedge').length, 5);
    assert.equal(document.querySelectorAll('#wheel .wedge[role="button"][tabindex="0"]').length, 5);
    assert.ok(visible(document, 'screen-launch'));
    assert.ok(!visible(document, 'screen-quiz'));
    assert.ok(!visible(document, 'screen-results'));
    assert.equal(document.getElementById('wheel').style.transform, 'rotate(-36deg)');
    assert.match(document.getElementById('foot').textContent, /25 questions in 1 set/);
    assert.equal(ctx.errors(), '');
  } finally {
    await ctx.close();
  }
});

test('tapping a wedge plays a full 5-question quiz to a perfect score, then returns to the wheel', async () => {
  const ctx = await loadPage();
  try {
    const { document, TRIVIA, click } = ctx;
    TRIVIA.TIMING.revealMs = 0;
    click(document.querySelector('#wheel .wedge[data-area-index="2"]'));
    assert.ok(visible(document, 'screen-quiz'));
    assert.equal(document.getElementById('quiz-area').textContent, 'Program and Database Development');
    assert.equal(document.getElementById('quiz-progress').textContent, 'Question 1 of 5');
    assert.equal(document.getElementById('quiz-score').textContent, '0 pts');
    assert.equal(TRIVIA.state.quiz.questions.length, 5);
    assert.ok(TRIVIA.state.quiz.questions.every((q) => q.category === 'Program and Database Development'));

    for (let i = 0; i < 5; i++) {
      const q = TRIVIA.state.quiz.questions[i];
      assert.equal(document.getElementById('q-text').textContent, q.text);
      const buttons = options(document);
      assert.equal(buttons.length, 4);
      const right = buttons.find((b) => b.querySelector('.option-text').textContent === q.correctAnswer);
      assert.ok(right, 'correct answer button not rendered');
      click(right);
      assert.ok(right.classList.contains('correct'));
      assert.ok(buttons.every((b) => b.disabled));
      // A second click while locked must not double-count.
      click(right);
      assert.equal(document.getElementById('quiz-score').textContent, `${i + 1} pt${i + 1 === 1 ? '' : 's'}`);
      await sleep(15); // revealMs is 0; let the window timer fire
    }

    assert.ok(visible(document, 'screen-results'));
    assert.ok(!visible(document, 'screen-quiz'));
    assert.equal(document.getElementById('frac').textContent, '5 / 5 correct');
    assert.equal(document.getElementById('pct').textContent, '100%');
    assert.equal(document.getElementById('band-title').textContent, 'Perfect score!');
    assert.match(document.getElementById('results-area').textContent, /Congrats! You finished Program and Database Development/);
    assert.match(document.getElementById('auto-return').textContent, /Back to the wheel in \d+s/);

    click(document.getElementById('again'));
    assert.ok(visible(document, 'screen-launch'));
    assert.equal(TRIVIA.state.screen, 'launch');
    assert.equal(TRIVIA.state.quiz, null);
    assert.equal(document.getElementById('wheel').style.transform, 'rotate(-36deg)');
    assert.equal(ctx.errors(), '');
  } finally {
    await ctx.close();
  }
});

test('a wrong answer is marked red, the right one green, and the score stays put', async () => {
  const ctx = await loadPage();
  try {
    const { document, TRIVIA, click } = ctx;
    click(document.querySelector('#wheel .wedge[data-area-index="3"]'));
    const q = TRIVIA.state.quiz.questions[0];
    const buttons = options(document);
    const wrong = buttons.find((b) => b.querySelector('.option-text').textContent !== q.correctAnswer);
    const right = buttons.find((b) => b.querySelector('.option-text').textContent === q.correctAnswer);
    click(wrong);
    assert.ok(wrong.classList.contains('wrong'));
    assert.ok(right.classList.contains('correct'));
    assert.equal(buttons.filter((b) => b.classList.contains('faded')).length, 2);
    assert.equal(document.getElementById('quiz-score').textContent, '0 pts');
    assert.equal(TRIVIA.state.quiz.score, 0);
    // Still on question 1 while the reveal timer (1500 ms) runs.
    assert.equal(document.getElementById('quiz-progress').textContent, 'Question 1 of 5');
    assert.equal(ctx.errors(), '');
  } finally {
    await ctx.close();
  }
});

test('keyboard: 1-4 answers, Escape leaves the quiz, Enter on a wedge starts it', async () => {
  const ctx = await loadPage();
  try {
    const { document, window, TRIVIA, key } = ctx;
    const wedge = document.querySelector('#wheel .wedge[data-area-index="0"]');
    wedge.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    assert.ok(visible(document, 'screen-quiz'));
    assert.equal(document.getElementById('quiz-area').textContent, 'Networking & Internet');
    key('3');
    assert.ok(TRIVIA.state.quiz.answered);
    assert.equal(options(document).filter((b) => b.disabled).length, 4);
    key('Escape');
    assert.ok(visible(document, 'screen-launch'));
    assert.equal(TRIVIA.state.quiz, null);
    assert.equal(ctx.errors(), '');
  } finally {
    await ctx.close();
  }
});

test('SPIN lands on a wedge and starts that area; the second tap during a spin is ignored', async () => {
  const ctx = await loadPage();
  try {
    const { document, TRIVIA, click } = ctx;
    TRIVIA.TIMING.spinMs = 0;
    TRIVIA.TIMING.settleMs = 0;
    const spin = document.getElementById('spin');
    click(spin);
    assert.ok(TRIVIA.state.spinning);
    assert.ok(spin.disabled);
    assert.ok(document.getElementById('wheel').classList.contains('spinning'));
    const rotation = TRIVIA.state.wheelRotation;
    assert.ok(rotation - TRIVIA.WHEEL.restRotation >= 360 * 4);
    click(spin); // ignored
    click(document.querySelector('#wheel .wedge[data-area-index="1"]')); // ignored while spinning
    assert.ok(visible(document, 'screen-launch'));
    await sleep(15);
    assert.ok(visible(document, 'screen-quiz'));
    const expected = TRIVIA.AREAS[TRIVIA.geom.areaIndexAtPointer(rotation)].name;
    assert.equal(document.getElementById('quiz-area').textContent, expected);
    assert.equal(TRIVIA.state.spinning, false);
    assert.equal(ctx.errors(), '');
  } finally {
    await ctx.close();
  }
});

test('playing the same area twice reuses the whole 5-question pool', async () => {
  const ctx = await loadPage();
  try {
    const { document, TRIVIA, click, key } = ctx;
    click(document.querySelector('#wheel .wedge[data-area-index="4"]'));
    const first = plain(TRIVIA.state.quiz.questions.map((q) => q.text)).sort();
    key('Escape');
    click(document.querySelector('#wheel .wedge[data-area-index="4"]'));
    const second = plain(TRIVIA.state.quiz.questions.map((q) => q.text)).sort();
    assert.deepEqual(first, second);
    assert.equal(new Set(first).size, 5);
  } finally {
    await ctx.close();
  }
});

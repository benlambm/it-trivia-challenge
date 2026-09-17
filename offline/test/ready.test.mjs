import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage, sleep } from './helpers.mjs';

const visible = (document, id) => !document.getElementById(id).hidden;
const wedge = (document, i) => document.querySelector(`#wheel .wedge[data-area-index="${i}"]`);

test('choosing an area shows Get Ready with the area, tagline and count, then the first question', async () => {
  const ctx = await loadPage();
  try {
    const { document, TRIVIA, click } = ctx;
    assert.equal(TRIVIA.TIMING.readyMs, 5000, 'ships with a 5-second countdown');
    TRIVIA.TIMING.readyMs = 1500; // short enough to test in real time: shows 2, then 1, then the quiz
    click(wedge(document, 1));
    assert.ok(visible(document, 'screen-ready'));
    assert.ok(!visible(document, 'screen-quiz'));
    assert.ok(!visible(document, 'screen-launch'));
    assert.equal(TRIVIA.state.screen, 'ready');
    assert.equal(document.getElementById('ready-area').textContent, 'Artificial Intelligence');
    assert.equal(document.getElementById('ready-tagline').textContent, TRIVIA.AREAS[1].tagline);
    assert.equal(document.getElementById('ready-emoji').textContent, TRIVIA.AREAS[1].emoji);
    assert.equal(document.getElementById('ready-num').textContent, '2');
    assert.ok(document.getElementById('ready-num').classList.contains('pop'));
    assert.equal(document.getElementById('ready-ring').getAttribute('stroke-dashoffset'), '0', 'ring starts full');
    assert.equal(TRIVIA.state.quiz.questions.length, 5, 'questions are dealt before the countdown');
    assert.ok(TRIVIA.state.timers.ready, 'countdown timer is running');

    await sleep(700);
    assert.equal(document.getElementById('ready-num').textContent, '1');
    assert.ok(visible(document, 'screen-ready'));
    assert.ok(Number(document.getElementById('ready-ring').getAttribute('stroke-dashoffset')) > 0, 'ring is draining');

    await sleep(1000);
    assert.ok(visible(document, 'screen-quiz'));
    assert.ok(!visible(document, 'screen-ready'));
    assert.equal(TRIVIA.state.screen, 'quiz');
    assert.equal(document.getElementById('quiz-area').textContent, 'Artificial Intelligence');
    assert.equal(document.getElementById('quiz-progress').textContent, 'Question 1 of 5');
    assert.equal(TRIVIA.state.timers.ready, null);
    assert.equal(ctx.errors(), '');
  } finally {
    await ctx.close();
  }
});

test('the number never shows 0: a 5-second countdown starts at 5', async () => {
  const ctx = await loadPage();
  try {
    const { document, click } = ctx;
    click(wedge(document, 3));
    assert.equal(document.getElementById('ready-num').textContent, '5');
    assert.equal(document.getElementById('ready-area').textContent, 'Cybersecurity');
    assert.equal(ctx.errors(), '');
  } finally {
    await ctx.close();
  }
});

test('nothing cuts the countdown short: no Skip button, and Enter, Space, S or a click are ignored', async () => {
  const ctx = await loadPage();
  try {
    const { document, window, TRIVIA, click, key } = ctx;
    assert.equal(document.getElementById('ready-skip'), null);
    assert.equal(document.querySelector('#screen-ready button'), null, 'the Get Ready screen has no buttons');
    wedge(document, 0).dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    assert.ok(visible(document, 'screen-ready'));
    key('Enter');
    key(' ');
    key('s');
    click(document.getElementById('ready-num'));
    assert.ok(visible(document, 'screen-ready'));
    assert.ok(!visible(document, 'screen-quiz'));
    assert.equal(TRIVIA.state.screen, 'ready');
    assert.ok(TRIVIA.state.timers.ready, 'countdown still running');
    assert.equal(ctx.errors(), '');
  } finally {
    await ctx.close();
  }
});

test('during the countdown, number keys do nothing and Escape returns to the wheel', async () => {
  const ctx = await loadPage();
  try {
    const { document, TRIVIA, click, key } = ctx;
    click(wedge(document, 4));
    key('1');
    assert.ok(visible(document, 'screen-ready'));
    assert.equal(TRIVIA.state.quiz.answered, false);
    assert.equal(TRIVIA.state.quiz.index, 0);
    key('Escape');
    assert.ok(visible(document, 'screen-launch'));
    assert.equal(TRIVIA.state.quiz, null);
    assert.equal(TRIVIA.state.timers.ready, null);
    await sleep(150);
    assert.ok(visible(document, 'screen-launch'), 'a cancelled countdown must not start a quiz later');
    assert.equal(ctx.errors(), '');
  } finally {
    await ctx.close();
  }
});

test('readyMs of 0 goes straight to the first question', async () => {
  const ctx = await loadPage();
  try {
    const { document, TRIVIA, click } = ctx;
    TRIVIA.TIMING.readyMs = 0;
    click(wedge(document, 2));
    assert.ok(visible(document, 'screen-quiz'));
    assert.ok(!visible(document, 'screen-ready'));
    assert.equal(document.getElementById('quiz-progress').textContent, 'Question 1 of 5');
    assert.equal(ctx.errors(), '');
  } finally {
    await ctx.close();
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage, plain, sleep } from './helpers.mjs';

// happy-dom has no Web Audio or speech. This stub records what the page does and throws where real
// browsers throw (exponential ramps to 0, starting a node twice, non-finite params), and it simulates
// the wheel's CSS rotate transition so the per-peg tick tracker sees intermediate angles.
const STUBS = `
(function () {
  var log = window.__audio = { contexts: 0, started: 0 };
  function check(v, t) { if (!isFinite(v) || !isFinite(t) || t < 0) throw new RangeError('bad param ' + v + ' at ' + t); }
  function Param(v) { this.value = v; }
  Param.prototype.setValueAtTime = function (v, t) { check(v, t); this.value = v; };
  Param.prototype.exponentialRampToValueAtTime = function (v, t) { if (!(v > 0)) throw new RangeError('exponential ramp to ' + v); check(v, t); this.value = v; };
  Param.prototype.setTargetAtTime = function (v, t, c) { check(v, t); if (!(c > 0)) throw new RangeError('bad time constant'); };
  function Node() {}
  Node.prototype.connect = function (n) { if (!n) throw new TypeError('connect to nothing'); return n; };
  function Source() {}
  Source.prototype = Object.create(Node.prototype);
  Source.prototype.start = function () { if (this.started) throw new Error('started twice'); this.started = true; log.started++; };
  Source.prototype.stop = function () { if (!this.started) throw new Error('stop before start'); };
  function Ctx() { log.contexts++; this.currentTime = 0; this.sampleRate = 48000; this.state = 'running'; this.destination = new Node(); }
  Ctx.prototype.createGain = function () { var n = new Node(); n.gain = new Param(1); return n; };
  Ctx.prototype.createDynamicsCompressor = function () { var n = new Node(); ['threshold', 'knee', 'ratio', 'attack', 'release'].forEach(function (k) { n[k] = new Param(0); }); return n; };
  Ctx.prototype.createBiquadFilter = function () { var n = new Node(); n.frequency = new Param(350); n.Q = new Param(1); return n; };
  Ctx.prototype.createOscillator = function () { var n = new Source(); n.frequency = new Param(440); n.detune = new Param(0); return n; };
  Ctx.prototype.createBufferSource = function () { return new Source(); };
  Ctx.prototype.createBuffer = function (c, len) { var d = new Float32Array(len); return { getChannelData: function () { return d; } }; };
  Ctx.prototype.resume = function () { this.state = 'running'; return Promise.resolve(); };
  window.AudioContext = Ctx;

  var spoken = window.__spoken = [];
  window.SpeechSynthesisUtterance = function (text) { this.text = text; };
  window.speechSynthesis = { speak: function (u) { spoken.push(u.text); }, cancel: function () {} };

  var realStyle = window.getComputedStyle.bind(window);
  var anim = { from: -36, to: -36, t0: 0, ms: 0 };
  function current(now) { var k = anim.ms ? Math.min(1, (now - anim.t0) / anim.ms) : 1; return anim.from + (anim.to - anim.from) * k; }
  window.getComputedStyle = function (node) {
    if (!node || node.id !== 'wheel') return realStyle(node);
    var now = Date.now();
    var m = /rotate\\(([-\\d.e]+)deg\\)/.exec(node.style.transform || '');
    var target = m ? parseFloat(m[1]) : 0;
    if (target !== anim.to) anim = { from: current(now), to: target, t0: now, ms: parseFloat(node.style.transitionDuration) || 0 };
    var rad = current(now) * Math.PI / 180, c = Math.cos(rad), s = Math.sin(rad);
    return { transform: 'matrix(' + c + ', ' + s + ', ' + (-s) + ', ' + c + ', 0, 0)' };
  };
})();
`;

const EFFECTS = ['tick', 'spinStart', 'land', 'pick', 'count', 'go', 'question', 'correct', 'wrong', 'fanfare', 'jingle', 'tada', 'sadTrombone', 'whoosh', 'whoop'];
const visible = (document, id) => !document.getElementById(id).hidden;
const options = (document) => [...document.querySelectorAll('#options .option')];

async function loadSoundPage() {
  const ctx = await loadPage({ page: 'index-sound.html', headScript: STUBS });
  const calls = {};
  for (const name of EFFECTS) {
    const original = ctx.TRIVIA.sound[name];
    ctx.TRIVIA.sound[name] = () => { calls[name] = (calls[name] || 0) + 1; original(); };
  }
  ctx.calls = calls;
  ctx.gesture = () => ctx.document.dispatchEvent(new ctx.window.Event('pointerup', { bubbles: true }));
  return ctx;
}

async function playQuiz(ctx, areaIndex, answerRight) {
  const { document, TRIVIA, click } = ctx;
  click(document.querySelector(`#wheel .wedge[data-area-index="${areaIndex}"]`));
  for (let i = 0; i < 5; i++) {
    const q = TRIVIA.state.quiz.questions[i];
    const pick = options(document).find((b) => (b.querySelector('.option-text').textContent === q.correctAnswer) === answerRight);
    click(pick);
    await sleep(15);
  }
}

test('sound edition boots with Sound and Announcer toggles on, and audio waits for a gesture', async () => {
  const ctx = await loadSoundPage();
  try {
    const { document, window } = ctx;
    assert.equal(document.querySelectorAll('#wheel .peg').length, 20);
    assert.equal(document.getElementById('sound-toggle').getAttribute('aria-pressed'), 'true');
    assert.equal(document.getElementById('voice-toggle').getAttribute('aria-pressed'), 'true');
    assert.ok(!document.getElementById('sound-toggle').hidden);
    assert.equal(window.__audio.contexts, 0, 'no AudioContext before a user gesture');
    ctx.gesture();
    assert.equal(window.__audio.contexts, 1);
    ctx.gesture();
    assert.equal(window.__audio.contexts, 1, 'one context is reused');
    assert.equal(ctx.errors(), '');
  } finally {
    await ctx.close();
  }
});

test('every effect builds a valid audio graph', async () => {
  const ctx = await loadSoundPage();
  try {
    ctx.gesture();
    for (const name of EFFECTS) {
      const before = ctx.window.__audio.started;
      ctx.TRIVIA.sound[name]();
      assert.ok(ctx.window.__audio.started > before, `${name} started no audio nodes`);
    }
    assert.equal(ctx.errors(), '');
  } finally {
    await ctx.close();
  }
});

test('SPIN revs up, ticks as pegs pass the pointer, chimes on landing, then announces the area', async () => {
  const ctx = await loadSoundPage();
  try {
    const { document, window, TRIVIA, click, calls } = ctx;
    TRIVIA.TIMING.spinMs = 600;
    TRIVIA.TIMING.settleMs = 100;
    ctx.gesture();
    click(document.getElementById('spin'));
    assert.equal(calls.spinStart, 1);
    await sleep(900);
    assert.ok(calls.tick > 5, `expected many ticks, got ${calls.tick}`);
    assert.equal(calls.land, 1);
    assert.equal(TRIVIA.state.spinTrack, null, 'tracker stopped');
    assert.ok(visible(document, 'screen-ready'));
    const area = TRIVIA.AREAS[TRIVIA.state.quiz.areaIndex].name;
    assert.deepEqual(plain(window.__spoken), [area.replace(/&/g, 'and') + '!']);
    assert.ok(calls.count >= 1, 'countdown beeped');
    assert.equal(ctx.errors(), '');
  } finally {
    await ctx.close();
  }
});

test('a perfect quiz: pick, GO, chimes, fanfare, then the announcer reads the score', async () => {
  const ctx = await loadSoundPage();
  try {
    const { window, TRIVIA, calls } = ctx;
    TRIVIA.TIMING.readyMs = 0;
    TRIVIA.TIMING.revealMs = 0;
    TRIVIA.SOUND.voiceDelayMs = 0;
    ctx.gesture();
    await playQuiz(ctx, 2, true);
    assert.equal(calls.pick, 1);
    assert.equal(calls.go, 1);
    assert.equal(calls.correct, 5);
    assert.equal(calls.wrong, undefined);
    assert.equal(calls.question, 4, 'a bloop for questions 2 to 5');
    assert.equal(calls.fanfare, 1);
    await sleep(15);
    assert.equal(window.__spoken.at(-1), 'Perfect score! 5 out of 5.');
    ctx.click(ctx.document.getElementById('again'));
    assert.equal(calls.whoop, 1);
    assert.equal(ctx.errors(), '');
  } finally {
    await ctx.close();
  }
});

test('an all-wrong quiz buzzes every answer and ends with the sad trombone', async () => {
  const ctx = await loadSoundPage();
  try {
    const { TRIVIA, calls, key } = ctx;
    TRIVIA.TIMING.readyMs = 0;
    TRIVIA.TIMING.revealMs = 0;
    ctx.gesture();
    await playQuiz(ctx, 3, false);
    assert.equal(calls.wrong, 5);
    assert.equal(calls.sadTrombone, 1);
    assert.equal(calls.fanfare, undefined);
    key('Escape');
    assert.equal(calls.whoosh, 1);
    assert.equal(ctx.errors(), '');
  } finally {
    await ctx.close();
  }
});

test('M mutes effects and V mutes the announcer, from the keyboard or the buttons', async () => {
  const ctx = await loadSoundPage();
  try {
    const { document, window, TRIVIA, click, key } = ctx;
    ctx.gesture();
    key('m');
    assert.equal(document.getElementById('sound-toggle').getAttribute('aria-pressed'), 'false');
    assert.equal(document.getElementById('sound-icon').textContent, '🔇');
    const before = window.__audio.started;
    TRIVIA.sound.correct();
    TRIVIA.sound.whir().set(1000);
    assert.equal(window.__audio.started, before, 'muted effects start nothing');
    click(document.getElementById('sound-toggle'));
    assert.equal(document.getElementById('sound-toggle').getAttribute('aria-pressed'), 'true');
    assert.ok(window.__audio.started > before, 'unmuting plays a confirmation');

    key('V');
    assert.equal(document.getElementById('voice-toggle').getAttribute('aria-pressed'), 'false');
    const spoken = window.__spoken.length;
    TRIVIA.sound.say('hello');
    assert.equal(window.__spoken.length, spoken, 'muted announcer says nothing');
    click(document.getElementById('voice-toggle'));
    assert.equal(window.__spoken.at(-1), 'Announcer on');
    assert.equal(TRIVIA.state.screen, 'launch', 'M and V do not change screens');
    assert.equal(ctx.errors(), '');
  } finally {
    await ctx.close();
  }
});

test('without Web Audio or speech the sound edition still plays, and hides the toggles', async () => {
  const ctx = await loadPage({ page: 'index-sound.html' });
  try {
    const { document, TRIVIA, click } = ctx;
    TRIVIA.TIMING.readyMs = 0;
    TRIVIA.TIMING.revealMs = 0;
    assert.ok(document.getElementById('sound-toggle').hidden);
    assert.ok(document.getElementById('voice-toggle').hidden);
    click(document.getElementById('sound-toggle'));
    await playQuiz(ctx, 0, true);
    assert.ok(visible(document, 'screen-results'));
    assert.equal(document.getElementById('pct').textContent, '100%');
    assert.equal(ctx.errors(), '');
  } finally {
    await ctx.close();
  }
});

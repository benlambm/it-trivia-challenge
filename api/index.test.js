import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

// These run the real server and the real Genkit stack against a scripted Google
// (testing/fake-gemini.js), because the behaviour under test depends on how
// Genkit reports failures. A Genkit upgrade that changes that should fail here.

const apiDir = path.dirname(fileURLToPath(import.meta.url));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'trivia-api-test-'));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

const question = (i) => ({
  category: 'Networking',
  text: `Question ${i}`,
  options: ['a', 'b', 'c', 'd'],
  correctAnswer: 'a',
});
const quiz = (count) => JSON.stringify({ questions: Array.from({ length: count }, (_, i) => question(i)) });

const GOOD_QUIZ = { text: quiz(25) };
const SHORT_QUIZ = { text: quiz(24) };
const NOT_JSON = { text: 'Sorry, I cannot help with that.' };
const CUT_OFF = { text: '{"questions":[{"category":"Netw' };
const GOOD_RESULTS = { text: JSON.stringify({ title: 'Hero', evaluation: 'Nice', motivation: 'Go' }) };
const BUSY = { http: 503, statusText: 'Service Unavailable', message: 'The model is overloaded' };
const BAD_KEY = { http: 400, statusText: 'Bad Request', message: 'API key not valid' };

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

const readJsonLines = (file) =>
  fs.existsSync(file)
    ? fs.readFileSync(file, 'utf8').trim().split('\n').map((line) => JSON.parse(line))
    : [];

// Starts a server that will get these Google replies, runs one POST against it,
// and returns the response with the events it logged and what it sent to Google.
async function post(route, body, replies, env = {}) {
  const port = await freePort();
  const eventsFile = path.join(scratch, `${port}.jsonl`);
  const requestsFile = path.join(scratch, `${port}-requests.jsonl`);
  const server = spawn(process.execPath, ['--import', './testing/fake-gemini.js', 'index.js'], {
    cwd: apiDir,
    stdio: 'ignore',
    env: {
      PATH: process.env.PATH,
      GOOGLE_GENAI_API_KEY: 'test-key',
      TRIVIA_PORT: String(port),
      TRIVIA_EVENTS_FILE: eventsFile,
      FAKE_GEMINI_REPLIES: JSON.stringify(replies),
      FAKE_GEMINI_REQUESTS: requestsFile,
      ...env,
    },
  });
  const base = `http://127.0.0.1:${port}`;
  try {
    for (let tries = 0; ; tries++) {
      try {
        await fetch(`${base}/api/health`);
        break;
      } catch (err) {
        if (tries > 150) throw err;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    const res = await fetch(`${base}${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const events = readJsonLines(eventsFile);
    return {
      status: res.status,
      body: await res.json(),
      calls: events.filter((event) => event.type === 'gemini_call'),
      event: (type) => events.find((event) => event.type === type),
      prompts: readJsonLines(requestsFile).map((request) => request.input[0].content[0].text),
    };
  } finally {
    server.kill();
  }
}

describe('Gemini failure handling', () => {
  it('serves a good first reply with one priced call', async () => {
    const r = await post('/api/questions', {}, [GOOD_QUIZ]);
    assert.equal(r.status, 200);
    assert.equal(r.body.questions.length, 25);
    assert.equal(r.calls.length, 1);
    assert.equal(r.calls[0].ok, true);
    assert.ok(r.calls[0].usd > 0);
  });

  for (const [name, badReply] of [
    ['too few questions', SHORT_QUIZ],
    ['a reply cut off midway', CUT_OFF],
    ['a reply that is not JSON', NOT_JSON],
    ['a blocked reply', { blocked: true }],
  ]) {
    it(`retries after ${name} and bills both attempts`, async () => {
      const r = await post('/api/questions', {}, [badReply, GOOD_QUIZ]);
      assert.equal(r.status, 200);
      assert.equal(r.body.questions.length, 25);
      assert.equal(r.event('quiz_generated').attempts, 2);
      assert.equal(r.calls.length, 2);
      assert.equal(r.calls[0].ok, false);
      assert.equal(r.calls[0].status, 'bad_reply');
      assert.equal(r.calls[0].tokens.output, 1800);
      assert.ok(r.calls[0].usd > 0, 'the rejected attempt was still billed');
      assert.equal(r.calls[0].usd, r.calls[1].usd);
      assert.equal(r.calls[1].ok, true);
    });
  }

  it('gives up after one retry and does not blame the browser', async () => {
    const r = await post('/api/questions', {}, [SHORT_QUIZ, SHORT_QUIZ, GOOD_QUIZ]);
    assert.equal(r.status, 502);
    assert.deepEqual(r.body, { error: 'bad_model_reply' });
    assert.equal(r.calls.length, 2);
    assert.ok(r.calls.every((call) => call.usd > 0));
    assert.equal(r.event('quiz_failed').reason, 'bad_reply');
  });

  it('retries a bad reply on the results screen too', async () => {
    const r = await post('/api/results', { score: 20, total: 25 }, [NOT_JSON, GOOD_RESULTS]);
    assert.equal(r.status, 200);
    assert.equal(r.body.title, 'Hero');
    assert.equal(r.calls.length, 2);
  });

  it('still answers 400 for bad browser input, without calling Gemini', async () => {
    const r = await post('/api/questions', { difficulty: 'impossible' }, []);
    assert.equal(r.status, 400);
    assert.deepEqual(r.body, { error: 'invalid_request' });
    assert.equal(r.calls.length, 0);
  });

  it('does not retry or blame the browser when Google refuses the call', async () => {
    const r = await post('/api/questions', {}, [BAD_KEY, GOOD_QUIZ]);
    assert.equal(r.status, 500);
    assert.deepEqual(r.body, { error: 'internal_error' });
    assert.equal(r.calls.length, 1);
    assert.equal(r.calls[0].ok, false);
    assert.equal(r.calls[0].usd, 0, 'Google did no work, so nothing was billed');
    assert.equal(r.event('quiz_failed').reason, 'error');
  });

  it('still retries when Google is busy, and those attempts cost nothing', async () => {
    const r = await post('/api/questions', {}, [BUSY, GOOD_QUIZ]);
    assert.equal(r.status, 200);
    assert.equal(r.calls.length, 2);
    assert.equal(r.calls[0].usd, 0);
    assert.equal(r.calls[1].ok, true);
  });

  it('retries when Google reports overload inside a normal reply', async () => {
    const r = await post('/api/questions', {}, [{ failed: 'service_unavailable' }, GOOD_QUIZ]);
    assert.equal(r.status, 200);
    assert.equal(r.calls.length, 2);
    assert.equal(r.calls[0].status, 'UNAVAILABLE');
    assert.equal(r.calls[0].usd, 0);
    assert.equal(r.calls[1].ok, true);
  });

  it('answers busy when that overload outlasts the retry budget', async () => {
    const r = await post('/api/questions', {}, [{ failed: 'service_unavailable' }], {
      TRIVIA_RETRY_BUDGET_MS: '1',
    });
    assert.equal(r.status, 503);
    assert.deepEqual(r.body, { error: 'upstream_busy' });
    assert.equal(r.event('quiz_failed').reason, 'upstream_busy');
  });

  for (const code of ['model_not_found', 'something_google_adds_later']) {
    it(`does not retry a ${code} failure inside a normal reply`, async () => {
      const r = await post('/api/questions', {}, [{ failed: code }, GOOD_QUIZ]);
      assert.equal(r.status, 500);
      assert.deepEqual(r.body, { error: 'internal_error' });
      assert.equal(r.calls.length, 1);
    });
  }
});

// The default lives on the live path, so it's checked in the prompt Google would get.
describe('default difficulty', () => {
  it('uses and logs easier when a request sends no difficulty', async () => {
    const r = await post('/api/questions', {}, [GOOD_QUIZ]);
    assert.match(r.prompts[0], /Requested difficulty key: easier\b/);
    assert.equal(r.event('quiz_generated').difficulty, 'easier');
  });

  it('keeps a difficulty the request does send', async () => {
    const r = await post('/api/questions', { difficulty: 'harder' }, [GOOD_QUIZ]);
    assert.match(r.prompts[0], /Requested difficulty key: harder\b/);
    assert.equal(r.event('quiz_generated').difficulty, 'harder');
  });
});

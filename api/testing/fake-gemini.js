// Preloaded with `node --import` by index.test.js. Replaces fetch so the real
// server and the real Genkit stack run against scripted Google replies, with no
// network, API key or cost. FAKE_GEMINI_REPLIES is a JSON array, one per call:
//   { "text": "..." }                 a completed reply with that text
//   { "http": 400, "message": "..." } an HTTP error from Google
//   { "blocked": true }               a reply Google blocked for content
//   { "failed": "code" }              an HTTP 200 reply reporting that failure code
// Each request body is appended to the FAKE_GEMINI_REQUESTS file as a JSON line, so
// tests can see what would really have reached Google.
import fs from 'node:fs';

const replies = JSON.parse(process.env.FAKE_GEMINI_REPLIES ?? '[]');

const usage = {
  total_input_tokens: 300,
  total_output_tokens: 1800,
  total_thought_tokens: 1500,
  total_tokens: 3600,
};

const json = (body, init) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, ...init });

globalThis.fetch = async (_url, init) => {
  fs.appendFileSync(process.env.FAKE_GEMINI_REQUESTS, `${init.body}\n`);
  const reply = replies.shift();
  if (!reply) throw new Error('fake-gemini: more calls than scripted replies');
  if (reply.http) {
    return json(
      { error: { code: reply.http, message: reply.message } },
      { status: reply.http, statusText: reply.statusText ?? 'Error' },
    );
  }
  if (reply.failed) {
    return json({
      id: 'fake',
      status: 'failed',
      errors: [{ code: reply.failed, message: 'scripted failure' }],
    });
  }
  if (reply.blocked) {
    return json({
      id: 'fake',
      status: 'failed',
      usage,
      errors: [{ code: 'content_blocked', message: 'blocked' }],
    });
  }
  return json({
    id: 'fake',
    status: 'completed',
    usage,
    steps: [{ type: 'model_output', content: [{ type: 'text', text: reply.text }] }],
  });
};

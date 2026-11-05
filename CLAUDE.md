# CLAUDE.md

Agent/operator notes for `trivia-app` — full repo for [trivia.benlamb.net](https://trivia.benlamb.net).

## Workflow

Single maintainer: commit on **`main`**, push when asked. No branches, worktrees, or PRs unless the user explicitly wants them. CI/deploy trigger on push to `main`.

## Layout

| Path | Purpose |
|------|---------|
| `web/` | React 19 + Vite 8 + TS. Build → `web/dist/`. |
| `api/` | Genkit/Express Gemini proxy. Listens `127.0.0.1:3000`. |
| `ops/` | Hand-installed server pieces (systemd state dir + monthly report timer, nginx `/stats` route). Deploy does not touch them; see `ops/README.md`. |
| `offline/` | Single-file offline edition (`offline/index.html`, spin wheel, hardcoded question bank; `offline/index-sound.html` is the same game with Web Audio sound effects). Not built or deployed by CI; see `offline/README.md`. |
| `/var/www/trivia.benlamb.net/` | **Served artifacts only** (no source). Copied from `web/dist/` on deploy. |

**nginx:** `/` → static root; `/api/` → `proxy_pass http://127.0.0.1:3000/api/`. Deny `^~ /src/` (404).

**systemd:** `trivia-api.service` → `/opt/trivia-app/api/`. Logs: `journalctl -u trivia-api -f`.

## API contract (update `api/index.js` + `web/services/triviaApi.ts` together)

| Method | Path | Response |
|--------|------|----------|
| GET | `/api/health` | `{ "status": "ok", "model" }` |
| POST | `/api/questions` | body `{ difficulty?, previousQuestions?, deviceId? }` → `{ gameId, questions: [{ category, text, options[4], correctAnswer }] × 25 }` |
| POST | `/api/results` | body `{ score, total, gameId?, deviceId? }` → `{ title, evaluation, motivation }` |
| GET | `/api/stats` | public anonymous usage + estimated Gemini cost (any origin) |
| GET | `/api/stats/daily.csv` | daily usage + cost CSV (reimbursement backup) |

Errors from `/api/questions` and `/api/results`, as `{ "error": code }`: `400 invalid_request` (bad browser input, the only case that blames the client), `502 bad_model_reply` (Gemini's reply failed the schema check or was blocked, after one retry), `503 upstream_busy` (Google shedding load, retries ran out), `429 rate_limited`, `500 internal_error` (includes Google refusing the call, e.g. a bad API key). A rejected reply was still billed, so its `gemini_call` event has `ok: false`, `status: "bad_reply"` and real tokens and cost. `api/index.test.js` covers this by running the real server and Genkit against a scripted Google (`api/testing/fake-gemini.js`).

Frontend sends the previous quiz questions on replay so Gemini avoids repeats, then adds `id` and shuffles `options` (`web/lib/shuffleArray.ts`). API JSON body limit is `2mb` for replay payloads. Model: `googleai/gemini-3.8-flash` (`DEFAULT_MODEL` in `api/index.js`), overridden by `TRIVIA_MODEL` in `api/.env`; `gemini-3.6-flash` is the fallback.

## Usage and cost tracking
- Events: `api/analytics.js` → `/var/lib/trivia-api/events.jsonl` (JSONL, append-only; `STATE_DIRECTORY` from the systemd drop-in). Never IPs, names or user agents. Back it up before any manual edit; the API reads it once at start.
- **Tests:** send `X-Trivia-Test: 1` on every manual/scripted request to production so it isn't counted as a player (it still counts toward cost). Requests without the site's `Origin` (curl, `offline/fetch-set.mjs`) count as `script`.
- Prices: `api/pricing.js` (dated periods; Jan 1 2027 doubles 3.x Flash). Add a period when Google changes prices.
- Public dashboard: `/stats` (React, lazy chunk) needs the nginx location in `ops/nginx/`.
- Monthly email: `ops/trivia-monthly-report` + timer (1st, 13:00 UTC). Test: `sudo DRY_RUN=1 TRIVIA_REPORT_MONTH=current /usr/local/sbin/trivia-monthly-report`.

## CI/CD automated pipeline
- **Node:** `>=22.12.0` supported (`web/` and `api/` `engines`); develop, CI and VPS all run Node 24 (`.nvmrc`).
- **CI:** `.github/workflows/ci.yml` runs `api/` tests, `web/` coverage tests, and `web/` bundle verification.
- **Deploy:** `.github/workflows/deploy.yml` on push to `main`; backend restart only if `api/` changed in that push.
- **Bundled:** React in `dist/assets/*.js`. **CDN:** Tailwind (`cdn.tailwindcss.com`).
- Edit `web/index.html` + rebuild — never hand-edit deployed `/var/www/.../index.html`.

## Rollback
- restore `assets.prev` / `index.html.prev`; backend: `git checkout <sha> -- api/` + reinstall + restart.


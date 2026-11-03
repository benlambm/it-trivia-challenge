# CLAUDE.md

Agent/operator notes for `trivia-app` — full repo for [trivia.benlamb.net](https://trivia.benlamb.net).

## Workflow

Single maintainer: commit on **`main`**, push when asked. No branches, worktrees, or PRs unless the user explicitly wants them. CI/deploy trigger on push to `main`.

## Layout

| Path | Purpose |
|------|---------|
| `web/` | React 19 + Vite 8 + TS. Build → `web/dist/`. |
| `api/` | Genkit/Express Gemini proxy. Listens `127.0.0.1:3000`. |
| `offline/` | Single-file offline edition (`offline/index.html`, spin wheel, hardcoded question bank; `offline/index-sound.html` is the same game with Web Audio sound effects). Not built or deployed by CI; see `offline/README.md`. |
| `/var/www/trivia.benlamb.net/` | **Served artifacts only** (no source). Copied from `web/dist/` on deploy. |

**nginx:** `/` → static root; `/api/` → `proxy_pass http://127.0.0.1:3000/api/`. Deny `^~ /src/` (404).

**systemd:** `trivia-api.service` → `/opt/trivia-app/api/`. Logs: `journalctl -u trivia-api -f`.

## API contract (update `api/index.js` + `web/services/triviaApi.ts` together)

| Method | Path | Response |
|--------|------|----------|
| GET | `/api/health` | `{ "status": "ok" }` |
| POST | `/api/questions` | body `{ difficulty?, previousQuestions? }` → `{ questions: [{ category, text, options[4], correctAnswer }] × 25 }` |
| POST | `/api/results` | body `{ score, total }` → `{ title, evaluation, motivation }` |

Frontend sends the previous quiz questions on replay so Gemini avoids repeats, then adds `id` and shuffles `options` (`web/lib/shuffleArray.ts`). API JSON body limit is `2mb` for replay payloads. Model: `googleai/gemini-3.8-flash` (`DEFAULT_MODEL` in `api/index.js`), overridden by `TRIVIA_MODEL` in `api/.env`; `gemini-3.6-flash` is the fallback.

## CI/CD automated pipeline
- **Node:** `>=22.12.0` supported (`web/` and `api/` `engines`); develop, CI and VPS all run Node 24 (`.nvmrc`).
- **CI:** `.github/workflows/ci.yml` runs `api/` tests, `web/` coverage tests, and `web/` bundle verification.
- **Deploy:** `.github/workflows/deploy.yml` on push to `main`; backend restart only if `api/` changed in that push.
- **Bundled:** React in `dist/assets/*.js`. **CDN:** Tailwind (`cdn.tailwindcss.com`).
- Edit `web/index.html` + rebuild — never hand-edit deployed `/var/www/.../index.html`.

## Rollback
- restore `assets.prev` / `index.html.prev`; backend: `git checkout <sha> -- api/` + reinstall + restart.


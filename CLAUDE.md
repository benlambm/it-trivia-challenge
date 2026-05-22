# CLAUDE.md

Agent/operator notes for `trivia-app` — full repo for [trivia.benlamb.net](https://trivia.benlamb.net).

## Layout

| Path | Purpose |
|------|---------|
| `web/` | React 19 + Vite 8 + TS. Build → `web/dist/`. |
| `api/` | Genkit/Express Gemini proxy. Listens `127.0.0.1:3000`. |
| `/var/www/trivia.benlamb.net/` | **Served artifacts only** (no source). Copied from `web/dist/` on deploy. |

**nginx:** `/` → static root; `/api/` → `proxy_pass http://127.0.0.1:3000/api/`. Deny `^~ /src/` (404).

**systemd:** `trivia-api.service` → `/opt/trivia-app/api/`. Logs: `journalctl -u trivia-api -f`.

## API contract (update `api/index.js` + `web/services/triviaApi.ts` together)

| Method | Path | Response |
|--------|------|----------|
| GET | `/api/health` | `{ "status": "ok" }` |
| POST | `/api/questions` | `{ questions: [{ category, text, options[4], correctAnswer }] × 25 }` |
| POST | `/api/results` | body `{ score, total }` → `{ title, evaluation, motivation }` |

Frontend adds `id`, shuffles `options` (`web/lib/shuffleArray.ts`). Model: `googleai/gemini-flash-latest` in `api/index.js` (`MODEL` constant).

## CI/CD automated pipeline
- **CI:** `.github/workflows/ci.yml` — Node 22, `web/` test + verify.
- **Deploy:** `.github/workflows/deploy.yml` on push to `main`; backend restart only if `api/` changed in that push.
- **Bundled:** React in `dist/assets/*.js`. **CDN:** Tailwind (`cdn.tailwindcss.com`).
- Edit `web/index.html` + rebuild — never hand-edit deployed `/var/www/.../index.html`.

## Rollback
- restore `assets.prev` / `index.html.prev`; backend: `git checkout <sha> -- api/` + reinstall + restart.


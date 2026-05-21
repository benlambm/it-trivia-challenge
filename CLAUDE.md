# CLAUDE.md

Agent/operator notes for `/opt/trivia-app` — monorepo for [trivia.benlamb.net](https://trivia.benlamb.net).

## Layout

| Path | Purpose |
|------|---------|
| `web/` | React 19 + Vite 8 + TS. Build → `web/dist/`. |
| `api/` | Genkit/Express Gemini proxy. Listens `127.0.0.1:3000`. |
| `/var/www/trivia.benlamb.net/` | **Served artifacts only** (no source). Copied from `web/dist/` on deploy. |
| `api/.env` | `GOOGLE_GENAI_API_KEY` — **never commit**. Rotate → `systemctl restart trivia-api`. |

**nginx:** `/` → static root; `/api/` → `proxy_pass http://127.0.0.1:3000/api/`. Deny `^~ /src/` (404).

**systemd:** `trivia-api.service` → `/opt/trivia-app/api/`. Logs: `journalctl -u trivia-api -f`.

## API contract (update `api/index.js` + `web/services/geminiService.ts` together)

| Method | Path | Response |
|--------|------|----------|
| GET | `/api/health` | `{ "status": "ok" }` |
| POST | `/api/questions` | `{ questions: [{ category, text, options[4], correctAnswer }] × 25 }` |
| POST | `/api/results` | body `{ score, total }` → `{ title, evaluation, motivation }` |

Frontend adds `id`, shuffles `options` (`web/lib/shuffleArray.ts`). Model: `googleai/gemini-flash-latest` in `api/index.js` (`MODEL` constant).

## Security

- Keys only in `api/.env` (mode 0600, owner `trivia-api:trivia-api` on prod).
- After every deploy, client bundle must be clean:

```bash
grep -c '@google/genai' /var/www/trivia.benlamb.net/assets/*.js   # 0
grep -oE 'AIza[0-9A-Za-z_-]{35}' /var/www/trivia.benlamb.net/assets/*.js  # no matches
```

`npm run verify:bundle` in `web/` runs the same checks on `dist/`.

## Dev & CI

```bash
# API
cd api && npm ci && node index.js

# Web (Node ^20.19 || >=22.12)
cd web && npm ci && npm run dev    # :5173, /api → :3000 (vite.config.ts)
npm test && npm run verify:bundle
```

- **CI:** `.github/workflows/ci.yml` — Node 22, `web/` test + verify.
- **Deploy:** `.github/workflows/deploy.yml` on push to `main`; backend restart only if `api/` changed in that push.
- **Bundled:** React in `dist/assets/*.js`. **CDN:** Tailwind (`cdn.tailwindcss.com`).
- Edit `web/index.html` + rebuild — never hand-edit deployed `/var/www/.../index.html`.

## Manual deploy (if GH Actions is down)

```bash
cd /opt/trivia-app/web && npm ci && npm run build
cd /var/www/trivia.benlamb.net
rm -rf assets.prev; [ -d assets ] && mv assets assets.prev
cp -r /opt/trivia-app/web/dist/assets ./
[ -f index.html ] && mv index.html index.html.prev
cp /opt/trivia-app/web/dist/index.html ./

cd /opt/trivia-app/api && npm ci --omit=dev && systemctl restart trivia-api
curl -fsS https://trivia.benlamb.net/api/health
```

Rollback: restore `assets.prev` / `index.html.prev`; backend: `git checkout <sha> -- api/` + reinstall + restart.

## Do not

- Commit `api/.env`, `web/dist/`, or `node_modules/`.
- Put files in `/var/www/trivia.benlamb.net/` except via deploy rotation.
- Change `/api/` JSON shape in only one of `api/` or `web/`.

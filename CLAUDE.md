# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this directory is

The nginx document root for `trivia.benlamb.net` **and** the React frontend source tree for the app. The Gemini-calling backend lives elsewhere — under `/opt/trivia-api/` as a systemd-managed Node service. The frontend in here never talks to Gemini directly; it talks to `/api/*` over the same origin.

```
/var/www/trivia.benlamb.net/
├── index.html                  ← deployed (post-build) entrypoint
├── assets/index-<hash>.js      ← deployed bundle (no API key, no Gemini SDK)
├── assets.prev/                ← previous deploy, one-shot rollback target
├── index.html.prev             ← previous index.html
└── src/                        ← React source (NOT served — nginx returns 404)
    ├── index.html              ← Vite dev/build template referencing /index.tsx
    ├── App.tsx, index.tsx, types.ts
    ├── components/*.tsx
    ├── services/geminiService.ts   ← name is historical; now calls /api/*, not Gemini
    ├── package.json, vite.config.ts, tsconfig.json
    ├── .env.local              ← legacy placeholder; frontend no longer reads it
    └── dist/                   ← `vite build` output
```

App is "Brightpoint IT Trivia Challenge" — Vite 6 + React 19 + TypeScript, originally exported from Google AI Studio.

## Where the Gemini API key actually lives

**Only** in `/opt/trivia-api/.env` (`GOOGLE_GENAI_API_KEY=...`, mode 0600, owner `trivia-api:trivia-api`). The frontend bundle contains zero credentials. To rotate the key: edit that file, `systemctl restart trivia-api`, no rebuild needed. Verify the bundle stays clean after any frontend change:

```
grep -c '@google/genai' /var/www/trivia.benlamb.net/assets/*.js   # must be 0
grep -oE 'AIza[0-9A-Za-z_-]{35}' /var/www/trivia.benlamb.net/assets/*.js  # no matches
```

If either ever returns a hit, **something has gone wrong** — the SDK or a key has leaked back into the client. Don't deploy.

## The two services that make this site work

| Component | Where | Listens | Managed by |
|---|---|---|---|
| Static React SPA | `/var/www/trivia.benlamb.net/` (this dir) | served by nginx on :443 | nginx |
| `trivia-api` (Node/GenKit Gemini proxy) | `/opt/trivia-api/` | `127.0.0.1:3000` (loopback only) | `trivia-api.service` (systemd) |

nginx routes:
- `/` → static files in this dir
- `/api/` → `proxy_pass http://127.0.0.1:3000/api/`
- `/src/` → 404 (deny block; see "Critical invariant" below)

Backend logs: `journalctl -u trivia-api -f`. Restart after editing `/opt/trivia-api/index.js` or `.env`: `systemctl restart trivia-api`.

## The /api/ contract (load-bearing — frontend depends on shape)

The backend exposes exactly three endpoints:

- `GET /api/health` → `{ "status": "ok" }` — liveness only, no Gemini call
- `POST /api/questions` → `{ "questions": [{ category, text, options[4], correctAnswer }, ...25 items] }` — the frontend assigns `id` and re-shuffles `options` client-side after receiving this
- `POST /api/results` body `{ score: int, total: int }` → `{ title, evaluation, motivation }` — frontend wraps with `score`/`totalQuestions`

The shape is preserved across the frontend boundary by `src/services/geminiService.ts`, which exports `generateQuestions()` and `generateGameResults(score, total)` with the same signatures the original AI-Studio-generated code had. Changing the wire format means updating BOTH `/opt/trivia-api/index.js` (zod schemas + flows) AND `src/services/geminiService.ts` (TS interfaces + the consumer of the JSON).

Model used by the backend: **`gemini-flash-latest`** (auto-tracks Google's newest Flash). To pin a specific version (e.g. `gemini-2.5-flash`), edit the `MODEL` constant at the top of `/opt/trivia-api/index.js` and restart the service.

## Critical invariant: /src/ must never be web-accessible

`src/` contains the full source tree (which leaks app intent, dependency list, prompt text, system instructions). It's not load-bearing for *secrets* anymore — the secret lives in `/opt/trivia-api/.env` and nginx never serves `/opt/`. But defense-in-depth: keep the deny block.

```nginx
location ^~ /src/ {
    deny all;
    return 404;
}
```

`^~` ensures the prefix beats regex location blocks. Verify after any nginx edit:
```
curl -sI https://trivia.benlamb.net/src/.env.local   # must be 404
curl -sI https://trivia.benlamb.net/src/package.json # must be 404
curl -sI https://trivia.benlamb.net/                 # must be 200
curl -sI https://trivia.benlamb.net/api/health       # must be 200
```

## Build & deploy

Node and npm are installed system-wide (v24 LTS via NodeSource — see `/etc/apt/sources.list.d/nodesource.list`). From `src/`:

```
cd /var/www/trivia.benlamb.net/src
npm install
npm run build            # -> src/dist/index.html + src/dist/assets/index-<newhash>.js
```

Deploy by overwriting the served top-level files. Keep both the previous bundle and the previous HTML for one-shot rollback:

```
cd /var/www/trivia.benlamb.net
rm -rf assets.prev
mv assets assets.prev
cp -r src/dist/assets ./
mv index.html index.html.prev
cp src/dist/index.html ./index.html
```

No nginx reload, no service restart — nginx serves files directly. Rollback: swap `assets.prev` back into `assets/` and `index.html.prev` back into `index.html`.

The backend has its own independent deploy: edit `/opt/trivia-api/index.js`, `systemctl restart trivia-api`. The two services are versioned independently.

## Why `src/index.html` and the deployed `index.html` look different

`src/index.html` is the **Vite template** — it references `/index.tsx` (the source entry). Vite reads it during `vite build`, replaces the `/index.tsx` `<script>` tag with a hashed bundle reference, and writes the result to `dist/index.html`. That output becomes the deployed top-level `index.html`. **Never edit the top-level `index.html` by hand** — it will be overwritten on the next deploy. Edit `src/index.html` and rebuild.

## Browser-loaded dependencies (not bundled)

`src/index.html` and the deployed `index.html` both pull React from CDNs at runtime via an `importmap` pointing at `esm.sh`. Tailwind is loaded from `cdn.tailwindcss.com` (runtime JIT, no build step). That's why the bundle is only ~214 KB. If those CDNs go down, the site goes with them — there's no vendored fallback.

## Don't dump anything else into this directory

Every file under `/var/www/trivia.benlamb.net/` (outside `src/`) is served on the public web. Logs, backups, dumps, prompt-history exports — none of them belong here. Put working files under `/root/` or `/opt/`, matching the conventions documented in `/root/CLAUDE.md`. The original source zip lives at `/var/www/brightpoint-it-trivia-challenge.zip` (in `/var/www/`, which nginx does not serve for this subdomain) and can stay there as an offline reference.

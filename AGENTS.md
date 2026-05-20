# AGENTS.md

## Cursor Cloud specific instructions

### Services overview

| Service | Directory | Start command | Default port |
|---|---|---|---|
| API backend (Node/Express/Genkit) | `api/` | `node index.js` | `127.0.0.1:3000` |
| Frontend dev server (Vite/React) | `web/` | `npm run dev` | `0.0.0.0:5173` |

### Running locally

See `README.md` → "Run it yourself" for full setup. Key points for cloud agents:

- **API key required**: The backend needs `GOOGLE_GENAI_API_KEY` in `api/.env`. Without it, the health endpoint (`GET /api/health`) works but question generation and results endpoints return `internal_error`.
- **Vite proxy**: `web/vite.config.ts` includes a proxy that forwards `/api/*` requests to the backend on port 3000. The frontend uses relative paths (`/api/questions`, `/api/results`), so this proxy is required for local dev.
- **Origin check**: The backend allows requests without an `Origin` header (which the Vite proxy sends). Direct browser cross-origin requests to `127.0.0.1:3000` will be rejected unless `Origin` matches `https://trivia.benlamb.net`.
- **No tests or linter**: The repo currently has no automated test suite or enforced linter (see `CONTRIBUTING.md`). TypeScript type-checking can be run with `npx tsc --noEmit` in `web/`.
- **Build**: `npm run build` in `web/` produces `web/dist/`. The build is fast (~1s).
- **Backend restart**: The backend does not auto-reload. After editing `api/index.js`, stop and restart `node index.js`.

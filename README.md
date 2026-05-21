# Brightpoint IT Trivia Challenge

**Live:** [trivia.benlamb.net](https://trivia.benlamb.net)

25 IT trivia questions and personalized results — all generated on the fly by Gemini. No question bank, no static feedback. Small codebase (~500 lines of app logic); good for learning how a minimal AI-backed SPA is wired.

## Architecture

```
Browser ──HTTPS──▶ nginx (:443)
                    ├─ /      → static SPA (Vite build from web/)
                    └─ /api/* → Node/Genkit on 127.0.0.1:3000 → Gemini
```

| Part | Role |
|------|------|
| `web/` | React 19 + TypeScript + Vite 8. Calls `/api/*` only — **no API keys in the client**. |
| `api/` | Express + Genkit + zod. **Only** place `GOOGLE_GENAI_API_KEY` lives (`api/.env`, gitignored). |

Structured output (`output: { schema }` in Genkit) forces JSON-shaped questions and results — see `api/index.js` for prompts and schemas.

**Stack:** React 19, Vite 8, Tailwind (CDN), Node 24, Genkit, `gemini-flash-latest`. No DB, auth, or analytics.

## Local setup

**Requires:** Node `20.19+` or `22.12+`, [Gemini API key](https://aistudio.google.com/apikey).

```bash
git clone https://github.com/benlambm/it-trivia-challenge.git
cd it-trivia-challenge

# Terminal 1 — API
cd api && npm ci && cp .env.example .env   # add your key
node index.js                              # :3000

# Terminal 2 — frontend
cd web && npm ci && npm run dev            # :5173, proxies /api → :3000
```

```bash
cd web && npm test              # Vitest
npm run verify:bundle           # build + check bundle has no SDK/key leaks
```

Entry points: `web/App.tsx` (game flow), `api/index.js` (routes + Gemini).

## Deploy

Push to `main` → [deploy.yml](./.github/workflows/deploy.yml) SSHs to the VPS, builds `web/`, verifies the client bundle, rotates artifacts into nginx, restarts `trivia-api` only if `api/` changed. PRs run [ci.yml](./.github/workflows/ci.yml) (tests + bundle checks).

Ops detail: [CLAUDE.md](./CLAUDE.md). Contributing: [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[PolyForm Noncommercial 1.0.0](./LICENSE) — personal, educational, and nonprofit use OK; commercial use requires permission ([open an issue](https://github.com/benlambm/it-trivia-challenge/issues)).

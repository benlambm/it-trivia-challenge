# Contributing

First off — thanks for being curious enough to read this file. Whether you're fixing a typo, adding a category, or rewriting half the app, you're welcome here.

This guide assumes you've cloned the repo and skimmed [`README.md`](./README.md). If you haven't, start there.

---

## Who this is for

Anyone, but especially:

- **High school + early college students** learning IT, programming, or AI. This codebase is intentionally small and readable. Use it as a sandbox. Break things on a branch. Ask "why does it work that way" in an issue — that's a real question and we'll answer it.
- **Folks getting into LLM apps** who want to see prompt engineering + structured output + a real (if tiny) deployment pipeline in one place.

You don't need to be an "expert" to contribute. Most pull requests on most software are written by people who are figuring it out as they go. That's normal.

---

## Setup for development

```bash
git clone https://github.com/benlambm/it-trivia-challenge.git
cd it-trivia-challenge

# Backend
cd api
npm ci
cp .env.example .env
# edit .env, paste in your Gemini API key from https://aistudio.google.com/apikey
node index.js                 # http://127.0.0.1:3000

# Frontend (in a new terminal)
cd web
npm ci
npm run dev                   # http://localhost:5173 (proxies /api to the backend)
```

The Vite dev server proxies `/api` to the backend (see `web/vite.config.ts`). After that, edit code and Vite reloads instantly. The backend restart is manual — `Ctrl-C` and `node index.js` again — unless you wire up `node --watch`.

**Node version:** Vite 8 requires Node `^20.19.0 || >=22.12.0`. Run `npm test` and `npm run verify:bundle` in `web/` before opening a PR.

---

## Workflow

1. **Fork the repo** (or create a branch if you have push access).
2. **Branch from `main`**: `git checkout -b your-thing`. Branch names like `feature/share-card`, `fix/loading-flash`, or `prompt/better-cyber-questions` are fine — be descriptive.
3. **Make your change.** Small, focused changes get merged faster than sprawling ones. If you're tempted to do two unrelated things, that's two PRs.
4. **Run automated checks** in `web/`: `npm test` and `npm run verify:bundle`. **Test manually**: play through a full game (Welcome → Loading → Quiz → Results). If you touched `api/index.js`, hit `curl -fsS http://127.0.0.1:3000/api/health` and confirm questions/results still return valid JSON.
5. **Push and open a PR** against `main`. Describe what you did and why. Screenshots/GIFs help a lot for UI changes.
6. **CI runs automatically** on the PR ([`ci.yml`](./.github/workflows/ci.yml): unit tests + production build + bundle security checks). It doesn't auto-deploy from PRs — only `main` does.

After review and merge, the [deploy workflow](./.github/workflows/deploy.yml) ships your change to production within ~10 seconds. You'll see it live.

---

## The one hard rule: never commit secrets

The `GOOGLE_GENAI_API_KEY` belongs in `api/.env` and **only** in `api/.env`. That file is gitignored. Don't move the key into the code. Don't paste it in a PR description. Don't include it in a screenshot. If you ever accidentally commit it:

1. **Tell us immediately** in the PR — even if it's not merged yet, the commit is on a public branch and the key should be considered compromised.
2. Rotate the key at [aistudio.google.com](https://aistudio.google.com/apikey).
3. We'll force-rewrite the branch and revoke the old key.

This isn't a "you'll be in trouble" rule — it's a "we want to protect you from a real, easy-to-make mistake" rule. Everyone has nearly done this at some point.

To make accidentally committing it harder, the deploy workflow has a check that **refuses to ship** any build whose JavaScript bundle contains the string `AIza` followed by 35 base64-ish characters (the format of every Google API key). If you see that error in a deploy log, that's the safety net catching something.

---

## Code style

Honestly: nothing heavy. The repo has no enforced linter or formatter yet (PRs to add one are welcome). General guidelines:

- **Prefer clarity over cleverness.** This is a learning codebase.
- **Keep components small.** If a `.tsx` file is over ~150 lines, ask whether it should be split.
- **Use TypeScript types.** Don't `any` your way out of a problem.
- **Match what's around you.** Indentation, quote style, naming — follow the file you're editing.
- **No comments that just restate the code.** Comments should explain *why*, not *what*.

---

## Changing the `/api/*` contract

The frontend and backend talk through three endpoints with specific shapes:

| Endpoint | Request | Response |
|---|---|---|
| `GET /api/health` | (none) | `{ "status": "ok" }` |
| `POST /api/questions` | (none) | `{ "questions": [{ category, text, options[4], correctAnswer }, ...25 ] }` |
| `POST /api/results` | `{ score, total }` | `{ title, evaluation, motivation }` |

If you change a shape, you need to update **both sides** in the same PR:

- Backend: the relevant zod schema and prompt in [`api/index.js`](./api/index.js).
- Frontend: the matching TypeScript interfaces in [`web/types.ts`](./web/types.ts) and the consumer in [`web/services/triviaApi.ts`](./web/services/triviaApi.ts).

If you only update one side, the app will explode at runtime in interesting ways.

---

## Prompt changes

The prompts in `api/index.js` are the closest thing this repo has to a "product." Tweaks are welcome and easy to test — just edit the string, restart the Node process, hit `/api/questions` or `/api/results`, and see what changes.

Things to watch for when editing prompts:

- **Stay in the zod schema.** If you ask the model to add a new field, also add it to the schema, or Genkit will reject the response.
- **Keep the audience consistent.** This game targets high-schoolers and early-college students considering IT. Keep questions accessible — no enterprise jargon, no acronym soup.
- **Watch the answer distribution.** LLMs love putting the right answer at position B or C. The current prompt yells "CRITICAL: randomize" for a reason. If you rewrite that section, test with a few runs and count which positions the correct answer ends up at.

---

## Asking for help

- **Stuck on local setup?** Open an issue with the steps you tried and the error you got. Vague is fine — we'll ask follow-up questions.
- **Not sure if an idea is in scope?** Open an issue first to talk it through. Saves you building something we'd reject.
- **Found a security issue?** Don't open a public issue. Email the maintainer directly (address is on the GitHub profile).

---

Thanks again for being here. Have fun.

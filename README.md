# Brightpoint IT Trivia Challenge

> 25 questions. 5 IT categories. One powerful machine intelligence (Gemini) who decides if you're a Help Desk Hero or a Cyber Rookie by generating AI trivia on the spot!

**Live:** [trivia.benlamb.net](https://trivia.benlamb.net)

Every question and every results screen is **generated on the fly by Google Gemini**. There's no question bank. There's no hand-written feedback. You hit "Start," the backend asks Gemini for 25 fresh questions about Networking, AI, Programming, Cybersecurity, and IT Ops, and the game plays them. When you finish, Gemini reads your score and writes you a custom title + motivational message.

If you're learning IT or curious about how modern AI apps are wired up, this codebase is a good size to actually read end-to-end. It's about ~500 lines of real code total.

---

## How it works

```
       Your browser
            │
            │  https://
            ▼
   ┌────────────────────┐
   │  nginx (TLS, :443) │
   └────┬───────────┬───┘
        │           │
        │ /         │ /api/*
        ▼           ▼
  Static React    Node service ──HTTPS──▶ Google Gemini
  (web/, built    (api/, on              (the actual LLM)
  by Vite)        127.0.0.1:3000)
```

Two services, one repo:

- `**web/**` — A Vite + React + TypeScript single-page app. **No API keys live here.** It only ever talks to its own backend at `/api/*` (same origin, no CORS dance).
- `**api/`** — A tiny Node server (~150 lines) using [Genkit](https://genkit.dev/) to call Gemini. This is the *only* place the `GOOGLE_GENAI_API_KEY` exists. It's loaded from a `.env` file at runtime — never committed, never sent to the browser.

This split matters. If the API key were in the frontend code, anyone could open DevTools, grab it, and rack up bills on your Gemini account. Putting it server-side is the entire point.

---

## The AI bits, briefly

The cool part of this codebase is how it makes Gemini return *structured* data instead of free-form text. Look at `api/index.js`:

```js
const QuestionSchema = z.object({
  category: z.string(),
  text: z.string(),
  options: z.array(z.string()).length(4),
  correctAnswer: z.string(),
});

const { output } = await ai.generate({
  model: 'googleai/gemini-flash-latest',
  prompt: '...generate 25 IT trivia questions...',
  output: { schema: QuestionsOutputSchema },  // <-- this is the magic
});
```

That `output: { schema }` tells Genkit + Gemini: "Don't just write me a paragraph — give me JSON that matches this exact shape, with exactly 25 questions, each with exactly 4 options." The model does the work, and `output` comes back as a fully-typed JavaScript object you can iterate over. No regex. No string parsing.

There's a second flow that does the same trick for the results screen:

```js
const ResultsOutputSchema = z.object({
  title: z.string(),       // "Help Desk Hero"
  evaluation: z.string(),  // witty score-based message
  motivation: z.string(),  // "you should take IT classes at Brightpoint..."
});
```

Same pattern: define a schema, ask the model to fill it.

The prompts themselves are in `api/index.js` — go read them. They're a tour of practical prompt engineering: explicit category lists, "CRITICAL: randomize the position of the correct answer" (because LLMs love putting the answer at B/C), tone guidance ("cool, encouraging guidance counselor"), and audience hints ("high-school friendly").

---

## Tech stack


| Layer    | What                                                                                     |
| -------- | ---------------------------------------------------------------------------------------- |
| Frontend | React 19, TypeScript, Vite 8, Tailwind (via CDN)                                         |
| Backend  | Node 24, Express, [Genkit](https://genkit.dev/) + `@genkit-ai/googleai`, zod for schemas |
| Model    | `gemini-flash-latest` (auto-tracks Google's newest Flash)                                |
| Deploy   | GitHub Actions → SSH to a Linux VPS → nginx + systemd                                    |


No database. No auth. No analytics. It's intentionally simple.

---

## Run it yourself

You'll need:

- **Node 20.19+ or 22.12+** (24 LTS is what production runs on)
- A **Gemini API key** — free tier is plenty. Get one at [aistudio.google.com](https://aistudio.google.com/apikey).

```bash
# 1. Clone and enter the repo
git clone https://github.com/benlambm/it-trivia-challenge.git
cd it-trivia-challenge

# 2. Set up the backend
cd api
npm ci
cp .env.example .env       # then edit .env and paste in your key
node index.js              # backend now listening on 127.0.0.1:3000

# 3. In a second terminal, set up the frontend
cd web
npm ci
npm run dev                # http://localhost:5173 (proxies /api → backend :3000)
npm test                   # unit tests (Vitest)
npm run verify:bundle      # production build + client bundle security checks
```

`web/vite.config.ts` proxies `/api` to `http://127.0.0.1:3000`, so `fetch('/api/questions')` from the dev server hits your local Node backend, which calls Gemini. Open the Network tab and watch it happen — it's a satisfying loop.

---

## Project layout

```
.
├── .github/workflows/deploy.yml   # auto-deploy on push to main
├── api/                           # Node + Genkit backend
│   ├── index.js                   # all the routes + Gemini calls
│   ├── package.json
│   ├── .env.example               # template — copy to .env locally
│   └── .env                       # YOUR key (gitignored, never committed)
├── web/                           # React + Vite frontend
│   ├── App.tsx                    # main game state machine
│   ├── components/
│   │   ├── WelcomeScreen.tsx
│   │   ├── LoadingScreen.tsx
│   │   ├── QuizScreen.tsx
│   │   └── ResultsScreen.tsx
│   ├── services/geminiService.ts  # the /api/* client (historical name)
│   └── ...
└── CLAUDE.md                      # detailed architecture notes
```

If you only want to read code, start at `web/App.tsx` (it drives the whole UX) and `api/index.js` (it's the whole backend). That's ~350 lines between them.

---

## Deploy

Push to `main`. That's it.

A [GitHub Actions workflow](./.github/workflows/deploy.yml) picks up the push, SSHes into the VPS, runs `git pull` + `npm ci` + `npm run build`, rotates the built artifacts into nginx's web root, and — only if `api/` changed — reinstalls backend deps and restarts the systemd service. The workflow refuses to deploy if it ever finds a Gemini API key pattern in the built JavaScript bundle, as a last-line defense against accidentally leaking a key.

Full operational notes live in `[CLAUDE.md](./CLAUDE.md)`.

---

## Contributing

We'd love PRs — especially from students learning IT or AI development. See [CONTRIBUTING.md](./CONTRIBUTING.md) for how to get set up, what kinds of changes are welcome, and the one hard rule (never commit `.env`).

Ideas if you're looking for something to do:

- Add a sixth category (Cloud? DevOps? Math foundations?).
- Make the loading screen show one of Gemini's questions while the next batch is being generated.
- Add a "share your score" link with a generated image card.
- Expand test coverage (Vitest unit tests exist; E2E still open).
- Improve the prompts. The current ones are fine. Yours could be better.

---

## License

Released under the [PolyForm Noncommercial License 1.0.0](./LICENSE) — copy it, study it, modify it, redistribute it, build personal or educational projects on top of it. The one thing you can't do is use it commercially. Personal use, hobby projects, schoolwork, research, and non-profit / educational organizations are all explicitly permitted by the license text; for-profit use is not.

Heads up on terminology: a "no commercial use" clause technically makes this *source-available* software rather than OSI-approved "open source" (the OSI definition forbids use restrictions). PolyForm Noncommercial was specifically drafted by software-license lawyers for this exact case — preferred over Creative Commons NC, which Creative Commons themselves recommend against using for code.

If you have a commercial use in mind, [open an issue](https://github.com/benlambm/it-trivia-challenge/issues) — happy to talk.
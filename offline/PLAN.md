# PLAN: Offline single-file "Spin the Wheel" IT Trivia (5 mini-games)

## Context

trivia.benlamb.net generates 25 questions per game with Gemini and needs a server, an API key, and internet. Ben needs a version for a **high-school demo table** (Brightpoint outreach): many students in quick succession, possibly no Wi-Fi, zero setup. The game flow also changes: the five IT areas become **five separate 5-question mini quizzes**, launched from a **wheel** that the student either spins (random area) or taps (chosen area). After 5 questions: congrats + score, then back to the wheel. No AI feedback, no overall score, no difficulty picker. Questions are a **hardcoded bank** generated once from the existing app's `easier` mode.

## Recommendation: one static HTML file, not a Python app

**Ship `offline/index.html`: a single self-contained file (inline CSS, inline classic JS, embedded question bank).** Nothing is needed to play: double-click it on any laptop or Android device. Python's only role is optional sharing to phones: `python3 -m http.server --directory offline 8080` on a laptop hotspot, phones open `http://<laptop-ip>:8080/`.

- **Why not a Python app:** it needs a terminal, a running process, and a browser anyway, and adds nothing (no persistence, no AI).
- **Why not a Vite/React single-file build of `web/`:** the current frontend depends on **CDN Tailwind, Google Fonts, and a remote PNG** (`web/index.html:7-8`, `web/components/QuizScreen.tsx:96`), there is no Tailwind config to compile from, no single-file plugin is installed, and the wheel + new flow is a rewrite of every screen regardless. React would add ~140 KB inline plus a build step to edit a ~300-line game.
- **iPhone/iPad caveat (verified by the design review):** an `.html` opened from Files/AirDrop/Mail on iOS renders in Quick Look, which does **not** run JavaScript. For iOS the no-setup path is the laptop hotspot + `http.server` above (or later hosting it under trivia.benlamb.net). Android Chrome opens `file://` fine. The README will say this plainly.

`file://` constraints the file respects: no `fetch()`, no `<script type="module">`, no external URLs, no `localStorage` reliance.

## Decisions made (say so if you want them changed)

- **Location:** new top-level `offline/` in the dev clone `/home/dev/it-trivia-challenge`. CI and `deploy.yml` only touch `web/` and `api/`, so `offline/` is inert in production. Subdirectory names avoid `assets/`, `dist/`, `build/` (gitignored at any depth). Commit/push only if Ben asks.
- **One question set now** (25 questions = 5 per area). Tooling accepts N sets; adding one later is two commands.
- **Tap a wedge = start immediately** (no spin, no intro countdown). **SPIN** picks the winner uniformly first, animates the wheel to it, then starts that quiz.
- **Dropped** from the old flow: difficulty slider, 5-second sector intro, loading screens, `/api/results` AI feedback (replaced by score-band static copy), the footer link wall (one-line footer stays).
- **Kept**: option shuffling at deal time (load-bearing: the model biases correct-answer position; `web/lib/shuffleArray.ts`), answer lock + 1.5s reveal (correct green, wrong red, others faded) then auto-advance, live score, "Question N of 5", confetti when score/total > 0.5 (i.e. ≥ 3), the "Your Future in IT Starts Here" Brightpoint blurb, brand palette and neo-brutalist look.
- **Demo-table extras** (one `TIMING` object at the top of the script): results screen auto-returns to the wheel after 30s; an idle quiz (no input for 90s) returns to the wheel; an always-visible "Back to wheel" button during the quiz; `Escape` also returns.
- Helper scripts are Node (`.mjs`, zero dependencies; Node 24 is on this box, the repo is Node, and there is no `jq`). They are only for regenerating the bank, never needed to play.

## Files to create

```
offline/
  index.html            the product: single file (~800 lines: style + markup + JSON bank + script)
  README.md             run / share to phones / regenerate / test / kiosk tips
  sets/easier-001.json  raw saved set (auditable, diffable; the file you hand-fix if a fact is wrong)
  lib/bank.mjs          pure helpers shared by scripts and tests: AREAS, validateSet, validateBank,
                        serializeSets, extractBlock, replaceBlock
  fetch-set.mjs         production API → sets/<difficulty>-NNN.json
  build-bank.mjs        sets/*.json → the JSON block in index.html (and --check mode)
  test/bank.test.mjs    validator/serializer unit tests (no DOM)
  test/geometry.test.mjs  wheel math + selection via window.TRIVIA in happy-dom
  test/smoke.test.mjs   full play-through in happy-dom
  test/offline-guard.test.mjs  static check: no external URLs, fetch, or modules in index.html
```
Plus one row each in `CLAUDE.md` (layout table) and `docs/architecture.md` (monorepo layout) pointing at `offline/`.

## Data model (in `index.html`)

```js
// canonical order = wheel order = web/types.ts:10-16 and api/triviaQuestions.js:76-83
const AREAS = [
  { key:'net',   name:'Networking & Internet',            lines:['Networking','& Internet'],   emoji:'🌐', color:'#0891b2', tagline:'Connecting the world at light speed!' },
  { key:'ai',    name:'Artificial Intelligence',          lines:['Artificial','Intelligence'], emoji:'🤖', color:'#9333ea', tagline:'Unlocking the power of machine minds!' },
  { key:'dev',   name:'Program and Database Development', lines:['Programming','& Databases'], emoji:'💻', color:'#E87722', tagline:'Building the future, one line of code at a time!' },
  { key:'cyber', name:'Cybersecurity',                    lines:['Cyber-','security'],         emoji:'🛡️', color:'#D63A4C', tagline:'Defending the digital frontier!' },
  { key:'ops',   name:'IT Operations and Support',        lines:['IT Ops','& Support'],        emoji:'🔧', color:'#173A45', tagline:'Solving real-world tech mysteries!' },
];
const ACTIVE_DIFFICULTIES = ['easier'];   // sets of other difficulties are ignored until listed
const TIMING = { spinMs:4200, spinReducedMs:600, settleMs:600, revealMs:1500, resultsIdleMs:30000, quizIdleMs:90000 };
const QUESTION_SETS = JSON.parse(document.getElementById('question-sets').textContent);
// state: { screen, wheelRotation:-36, spinning:false, decks:{ [areaName]: {all, remaining} },
//          quiz: null | { areaIndex, questions[5], index, score, answered }, timers:{ idle, reveal, spin, confettiRaf } }
window.TRIVIA = { AREAS, TIMING, QUESTION_SETS, geom, select, scoreBand, state };  // for tests and the console
```
`AREAS[i].name` must equal the API `category` string exactly (that is how questions are grouped); `lines` is display-only for the wheel. Colors are `web/types.ts:36-42`; taglines `web/components/QuizScreen.tsx:10-16`. `TIMING` is mutable so the smoke test can zero the delays without test-only code paths.

**Bank embedding:** `<script type="application/json" id="question-sets">[ ...sets... ]</script>` placed before the app script. The tag pair is the marker, the body is valid JSON (round-trippable, cannot break the app script's syntax). The serializer escapes `<`, `>`, `&`, U+2028/2029 as `\u00xx` so model output containing `</script` or `<!--` cannot terminate the block.

**Set file shape** (`sets/easier-001.json`, identical to one embedded element):
```json
{ "id": "easier-001", "difficulty": "easier", "model": "googleai/gemini-3.7-flash",
  "generatedAt": "<ISO>", "source": "https://trivia.benlamb.net/api/questions",
  "questions": [ { "category": "...", "text": "...", "options": ["a","b","c","d"], "correctAnswer": "a" } ] }
```
`questions` is byte-for-byte the API wire shape (`api/triviaQuestions.js:3-12`); `model` comes from `GET /api/health` (returns `{status, model}`).

## Pure functions (inside the inline script; `rand` injectable, default `Math.random`)

Geometry (degrees clockwise from 12 o'clock; screen y is down):
- `polarToXY(cx,cy,r,deg)` → `{x: cx + r·sin, y: cy − r·cos}`; `wedgeStart(i) = 72i`; `wedgeMid(i) = 72i + 36`.
- `wedgePath(cx,cy,r,i)` → `M cx cy L P(72i) A r r 0 0 1 P(72i+72) Z` (large-arc 0, sweep 1 = clockwise).
- `labelPos(cx,cy,r,i,k=0.6)`; `mod(a,n) = ((a % n) + n) % n`.
- `areaIndexAtPointer(rot)` → `floor(mod(−rot, 360) / 72)`.
- `pickWinner(rand)` → `floor(rand()·5)`.
- `targetRotation(cur, winner, {rand, turnsMin=4, turnsMax=6, jitterMax=28})`: `turns` in range, `j ∈ [−28, 28]`, `rho = mod(−(wedgeMid(winner)+j), 360)`, return `cur + 360·turns + mod(rho − cur, 360)`. Invariant: `areaIndexAtPointer(result) === winner` and `result − cur ≥ 360·turnsMin`. Reduced motion: `turnsMin = turnsMax = 0`.

Selection:
- `shuffle(arr, rand)` (Fisher-Yates copy, port of `web/lib/shuffleArray.ts`).
- `buildPools(sets, areas, activeDifficulties)` → `{ [areaName]: Question[] }`, question `id = "<setId>#<i>"`.
- `newDeck(pool, rand)` → `{ all, remaining: shuffle(pool) }`; `deal(deck, n, rand)` → `{ dealt, deck }`: take from `remaining`, refill with a shuffle of `all` minus the just-dealt when short, never a duplicate within one deal. Guarantees every question is seen before any repeat; with one set this is "the 5, in random order".
- `prepareQuestion(q, rand)` → copy with `options` shuffled, `correctAnswer` text untouched; `isCorrect(q, option)` → `option === q.correctAnswer`.

Results: `scoreBand(score, total)` → `{ title, message, celebrate }` with `celebrate = score/total > 0.5`; `percent(score,total)`.
Score copy: 5 → "Perfect score!" / "You crushed it. Future IT pro spotted."; 4 → "Excellent!" / "Just one away from perfect."; 3 → "Nice work!" / "You know your tech."; 2 → "Good try!" / "Every expert started somewhere."; 0–1 → "Thanks for playing!" / "Curiosity is the first step into IT."

Controller (thin, impure): `renderWheel()`, `spin()`, `startArea(i)`, `answer(option)`, `nextQuestion()`, `showResults()`, `showScreen(name)` (clears every timer, cancels confetti rAF, clears the canvas), `armIdle(ms)`.

## Wheel (inline SVG, no library)

- `<svg id="wheel" viewBox="0 0 400 400">`, `cx = cy = 200`, `r = 190`. Five `<g role="button" tabindex="0" data-area-index="i" aria-label="Play <name>">`, each with `<path fill=color stroke=#fff stroke-width=4 stroke-linejoin=round>` and a `<text text-anchor=middle dominant-baseline=middle font-size=17 font-weight=900 fill=#fff pointer-events=none>` at `labelPos(i)` with three `<tspan>`s (emoji, `lines[0]`, `lines[1]`). Width at 0.6r for 72° ≈ 134 units, enough for ~12 bold characters per line. Then a navy ring `<circle r=190 stroke-width=8>` and a white hub `<circle r=44>`; both are rotation-invariant so they can live in the rotating element.
- **Rotate the `<svg>` element itself**, not an inner `<g>` (SVG-child `transform-origin` is unreliable in Safari). `transition: transform 0s cubic-bezier(.17,.67,.12,.99)`; `spin()` sets `style.transitionDuration` then `style.transform = rotate(<target>deg)`. Initial rotation `−36` so wedge 0 is centred under the pointer. Never normalise; doubles are fine for thousands of spins.
- Not rotating, absolutely positioned over `.wheel-wrap` (`position:relative; width:min(88vw,62vh,540px); aspect-ratio:1`): the pointer (small inline SVG triangle at 12 o'clock, tip 14px into the wheel) and `<button id="spin">SPIN</button>` centred over the hub by a flex wrapper (not `translate(-50%,-50%)`, which would fight the hover lift).
- **Spin completion is JS-owned:** one `setTimeout(spinMs + settleMs)` guarded by `state.spinning`; no `transitionend` (it is dropped when the tab is hidden and would double-fire with a fallback). On fire: `console.assert(areaIndexAtPointer(rot) === winner)`, then `startArea(winner)`. Reduced motion: `spinReducedMs` with zero extra turns (shortest forward path, no strobe).
- While spinning: `.wheel.spinning{pointer-events:none}`, `spin.disabled = true`, and `state.spinning` checked in every handler (keyboard bypasses pointer-events). Enter/Space on a focused wedge and click/tap → `startArea(i)` immediately. Hover/focus-visible brightens via `filter` and an amber stroke. `S` key spins.
- Below the wheel: "Spin the wheel or tap an area to start".

## Screens (one `<section class="screen">` each, toggled with `hidden`; `[hidden]{display:none!important}` so flex screens still hide; `showScreen` moves focus to the section's heading)

1. **#screen-launch**: wordmark "IT Trivia **Challenge**" (orange span as `web/components/WelcomeScreen.tsx:20-22`), tagline, hint line, `.wheel-wrap`, one-line footer.
2. **#screen-quiz**: area-colored header via `--area-color` (emoji, area name, "Question n of 5" and score in `aria-live="polite"` spans); `.card` with the question `h3`; `#options` grid of four `<button class="option" data-i>` each with a `<kbd>` 1–4 badge; keys 1–4 answer; "← Back to wheel" button. On answer: set `answered` before any DOM work, add `.correct`/`.wrong`/`.faded`, wait `revealMs`, advance; after Q5 → results. Quitting mid-reveal clears the reveal timer.
3. **#screen-results**: `<canvas id="confetti">` (guard `if (!ctx) return`, size on show, store rAF id, stop after 6s and on `showScreen`) + `.card.results`: "Your score", big percentage, `N / 5 correct`, band title + message, the Brightpoint pitch aside (text from `web/services/triviaApi.ts:85-89`), primary **Spin again** button, "Back to the wheel in 30s" countdown.

## CSS (inline, ~180 lines)

`:root`: `--navy:#173A45 --orange:#E87722 --red:#D63A4C --cyan:#0891b2 --purple:#9333ea --green:#10b981 --amber:#f59e0b --bg:#f8fafc --slate-100:#f1f5f9 --slate-300:#cbd5e1 --slate-400:#94a3b8 --slate-600:#475569 --font: system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif`. Explicit `body{background:var(--bg)}`; `main{min-height:100dvh}`.
Recipes ported from the Tailwind classes: `.card{background:#fff;border:4px solid var(--navy);border-radius:24px;box-shadow:8px 8px 0 rgba(23,58,69,.2)}`; `.btn,.option{border:4px solid var(--navy);border-radius:16px;box-shadow:4px 4px 0 var(--navy);font-weight:900;touch-action:manipulation}` with hover `translateY(-4px)` and active reset; `.option.correct{background:var(--green)}`, `.option.wrong{background:var(--red)}`, `.option.faded{opacity:.6;background:var(--slate-100);border-color:var(--slate-300);box-shadow:none}`; `.options{display:grid;gap:16px}` one column, two at `≥768px`; `.option{text-align:left;overflow-wrap:anywhere;min-height:64px;font-size:clamp(1rem,2.5vw,1.25rem)}`; `-webkit-tap-highlight-color:transparent`; `@media(prefers-reduced-motion:reduce)` removes hover lifts.

## Scripts

**`lib/bank.mjs`** (pure): `AREAS` names, `DIFFICULTIES` (mirror of `api/triviaQuestions.js:20`), `normalizeText`, `validateSet(set,{fileName})` → `{errors, warnings}`, `validateBank(sets)`, `serializeSets(sets)` (one set header per line, one question per line, escaped as above), `extractBlock(html)` (the exact opening tag must occur once), `replaceBlock(html, body)`.
Fatal per set: `id` equals file basename; `difficulty ∈ DIFFICULTIES`; exactly 25 questions; every `category ∈ AREAS`; exactly 5 per area; non-empty `text`; exactly 4 non-empty options, unique after normalisation; `correctAnswer` strictly `===` one option (the quiz compares by equality). Fatal across sets: duplicate `id`, duplicate normalised `text`. Warnings: option > 60 chars, text > 180 chars, categories out of canonical order, same normalised `correctAnswer` twice within an area.

**`fetch-set.mjs`** `[--difficulty easier] [--base https://trivia.benlamb.net]`: `GET /api/health` → model; `POST /api/questions` with `{difficulty}` and `AbortSignal.timeout(185_000)` (nginx allows 180s; a call takes 11–49s; Node's `fetch` sends no `Origin`, so the guard in `api/index.js:157-163` passes; limiter is 10/min); trim every string; `id = <difficulty>-<NNN>` (next unused in `sets/`); `validateSet`; on errors dump the raw response to the OS temp dir and exit 1; else write `sets/<id>.json` and print per-area counts plus the next command. Never touches `index.html`. Fallback if production is down: the local Genkit harness from memory (`buildQuestionsPrompt({difficulty:'easier'})` + `ai.generate` with `QuestionsOutputSchema`, key from `/opt/trivia-app/api/.env` via sudo); not needed unless curl-equivalent fails.

**`build-bank.mjs`** `[--check]`: read `sets/*.json` sorted (exit 1 if none), `validateSet` each + `validateBank` (any error → exit 1, `index.html` untouched), `body = serializeSets(sets)`; `--check`: `extractBlock(index.html) === body` else "stale" exit 1; default: `replaceBlock`, re-read, `JSON.parse(extractBlock())` deep-equals `sets`, print a summary table (id, model, generatedAt, 5×5 counts) and warnings.

## Verification

1. `node offline/build-bank.mjs --check` exits 0.
2. `node --test 'offline/test/*.test.mjs'` (explicit glob: on Node 24 `node --test <dir>` executes files in it as modules, which is how the design review accidentally started `api/index.js` for under a second; production was checked healthy afterwards). Tests import happy-dom 20.14.5 by relative path `../../web/node_modules/happy-dom/lib/index.js`, use `new Browser()`, `page.content = <index.html>` (goes through `document.write`, so inline scripts run), `await page.waitUntilComplete()`. happy-dom notes: `canvas.getContext('2d')` is `null` (guard covers it); SVG elements need `dispatchEvent(new window.MouseEvent('click',{bubbles:true}))`.
   - `bank.test.mjs`: valid fixture passes; each fatal rule rejects; serializer escapes `<`; `replaceBlock`→`extractBlock` round-trips; 0 or 2 markers throw.
   - `geometry.test.mjs`: 1000 seeded cases `areaIndexAtPointer(targetRotation(cur,w)) === w` with delta ≥ 1440; `polarToXY(200,200,190,0)` = `(200,10)`; `wedgePath(…,0)` starts `M 200 200 L 200 10 A 190 190 0 0 1`; `shuffle` is a permutation; three `deal(5)` from a 5-pool are each permutations; `scoreBand` 0..5 (`celebrate` iff ≥ 3).
   - `smoke.test.mjs`: click wedge 2 → quiz visible, header "Program and Database Development", "Question 1 of 5"; set `TRIVIA.TIMING.revealMs = 0`; answer 5× with the option whose text equals `correctAnswer`; assert "5 / 5 correct" and "Perfect score!"; click Spin again → launch visible. Then zero `spinMs`/`settleMs`, click `#spin` → quiz visible for `areaIndexAtPointer(state.wheelRotation)`. A wrong-answer path asserts `.wrong` + `.correct` classes and unchanged score.
   - `offline-guard.test.mjs`: no `https?://` in `src=|href=|url(|@import`, no `fetch(`, no `type="module"`, no `import ` in `index.html`.
3. Manual: open via `file://` in Chrome and Firefox with **Wi-Fi off**: Network panel shows only the document, no console errors; 20 spins, pointer visibly inside the announced wedge each time; tap each wedge starts the right area; double-tap during spin ignored; keyboard-only run; OS reduced-motion on; 320px width; leave results idle → returns to wheel. Phone: `python3 -m http.server --directory offline 8080` on the laptop, load from an Android and an iPhone on the same network.
4. Read all 25 questions in `sets/easier-001.json` once for obviously wrong answers (fix in the JSON, rerun build-bank). The raw set is kept precisely so this audit is possible.
5. `cd web && npm test` still green (nothing in `web/` or `api/` changes).

## Implementation sequence

0. Save this plan as `offline/PLAN.md` in the repo (Ben asked for a PLAN.md; plan mode only allowed writing the plan file so far).
1. `lib/bank.mjs`, `build-bank.mjs`, `test/bank.test.mjs`. Verify: bank tests pass; empty `sets/` exits 1 with a clear message.
2. `fetch-set.mjs`; run once → `sets/easier-001.json` (production health confirmed today: `gemini-3.7-flash`). Verify: validator passes; skim the 25 questions.
3. `index.html` skeleton: CSS, three sections, empty JSON block, `AREAS`/`TIMING`, `window.TRIVIA`; run `build-bank.mjs`. Verify: `--check` passes; opens from `file://`; guard test passes.
4. Wheel: geometry functions, `renderWheel`, `spin`, wedge click/keyboard. Verify: `geometry.test.mjs`; browser check of 20 spins.
5. Quiz + results: decks, reveal/lock/advance, score band, confetti with cancel, Back to wheel, Spin again. Verify: `smoke.test.mjs`; manual play-through of all five areas.
6. Idle timers, reduced motion, a11y labels/live regions, kiosk polish (`-webkit-tap-highlight-color`, `100dvh`, `touch-action`). Verify: manual list above.
7. `README.md` (play, share to phones incl. the iOS note, regenerate, tests, kiosk: Chrome `--kiosk file:///…/index.html` or F11, iPad Guided Access), rows in `CLAUDE.md` and `docs/architecture.md`. Verify: `git status` shows only `offline/` + the two doc rows; `--check` and all tests green.

## Out of scope (possible follow-ups)

Hosting the file at `https://trivia.benlamb.net/offline/` for QR-code access (fixes the iOS case with Wi-Fi), generating more Easier sets for variety, per-question explanations (the bank has none), a printable answer key, an optional CI step running the offline tests.

## Status (2026-09-17)

Implemented as planned. `offline/index.html` (39 KB, one set of 25 Easier questions embedded), `lib/bank.mjs`,
`fetch-set.mjs`, `build-bank.mjs`, four test files (29 tests, `node --test 'offline/test/*.test.mjs'`), `README.md`.
Question 5 of `sets/easier-001.json` was rephrased by hand (it answered itself) and re-embedded. Not yet viewed in a
real browser from this VPS (no browser here); happy-dom covers the logic, the manual checklist above still applies.
Nothing committed or pushed.

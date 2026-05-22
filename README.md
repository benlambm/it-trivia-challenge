# IT Trivia Game - AI-generated

[![CI](https://github.com/benlambm/it-trivia-challenge/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/benlambm/it-trivia-challenge/actions/workflows/ci.yml)
[![Deploy to VPS](https://github.com/benlambm/it-trivia-challenge/actions/workflows/deploy.yml/badge.svg?branch=main)](https://github.com/benlambm/it-trivia-challenge/actions/workflows/deploy.yml)
[![Live Site](https://img.shields.io/website?url=https%3A%2F%2Ftrivia.benlamb.net&label=trivia.benlamb.net)](https://trivia.benlamb.net)
[![Node](https://img.shields.io/badge/node-%3E%3D22.12.0-brightgreen)](.nvmrc)

**Live:** [trivia.benlamb.net](https://trivia.benlamb.net)

There is no question bank! Generative AI crafts new questions on the spot when you click Start New Game, adjusts the difficulty level, and adapts to your knowledge for endless play. Complete the IT trivia quiz to receive personalized AI feedback and coaching!

**Full Stack:** JavaScript (React 19, Vite 8), HTML/CSS, with Express and Genkit on the backside to request structured outputs from Gemini AI (gemini-flash-latest)

## Local setup

**Requires:** [Gemini API key](https://aistudio.google.com/apikey) saved to environment variable or .env secrets file

## Contributing

Humans and nonhumans welcome! PRs must run [ci.yml](./.github/workflows/ci.yml) (API tests + web coverage + bundle checks).

Ops detail: [CLAUDE.md](./CLAUDE.md). Contributing: [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[PolyForm Noncommercial 1.0.0](./LICENSE) — personal, educational, and nonprofit use OK
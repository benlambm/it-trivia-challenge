import { z } from 'genkit';

export const QuestionSchema = z.object({
  category: z.string(),
  text: z.string(),
  options: z.array(z.string()).length(4),
  correctAnswer: z.string(),
});

export const QuestionsOutputSchema = z.object({
  questions: z.array(QuestionSchema).length(25),
});

const CATEGORY_NETWORKING = 'Networking & Internet';
const CATEGORY_AI = 'Artificial Intelligence';
const CATEGORY_DEV = 'Program and Database Development';
const CATEGORY_CYBER = 'Cybersecurity';
const CATEGORY_OPS = 'IT Operations and Support';

const DIFFICULTY_LEVELS = ['much_easier', 'easier', 'normal', 'harder', 'much_harder'];
const DIFFICULTY_DESCRIPTORS = {
  much_easier: 'elementary to middle-school level: very basic, intuitive concepts about everyday technology (e.g., "What does Wi-Fi let devices do?", "What is a password used for?"). Use simple wording and obvious distractors.',
  easier: 'early high-school level: common-knowledge IT concepts with simple wording. Distractors should be plausible but clearly distinguishable to anyone who has used a computer.',
  normal: 'high-school level: solid foundational IT concepts a curious high-school student should be able to reason through. Balanced distractors.',
  harder: 'introductory college level: applied scenarios, specific terminology, subtler distractors, and deeper conceptual nuance. Questions should require reasoning about distinctions between similar concepts (e.g., TCP vs. UDP behavior, symmetric vs. asymmetric encryption tradeoffs), not just remembering definitions.',
  much_harder: 'college / early professional level: precise technical terminology, specific protocols, standards, edge cases, common gotchas, troubleshooting tradeoffs, and applied reasoning. Questions should require real understanding to eliminate plausible distractors.',
};

export const QuestionsInputSchema = z.object({
  difficulty: z.enum(DIFFICULTY_LEVELS).default('normal'),
  previousQuestions: z.array(QuestionSchema).max(25).optional(),
});

export function formatPreviousQuestionsForPrompt(previousQuestions = []) {
  if (previousQuestions.length === 0) return '';

  return `
    Previous quiz context:
    The student just saw this full set of questions. Use it to keep the next quiz fresh and better adapted:
    ${JSON.stringify(previousQuestions, null, 2)}

    Additional adaptation rules:
    - Do not repeat any previous question verbatim.
    - Do not closely paraphrase previous question text, scenarios, examples, or answer sets.
    - Prefer new concepts or adjacent follow-ups at the requested difficulty instead of reusing the same examples.
  `;
}

export function formatDifficultyGuardrails(difficulty = 'normal') {
  if (difficulty !== 'harder' && difficulty !== 'much_harder') return '';

  const extraRequirement =
    difficulty === 'much_harder'
      ? '- For much_harder, every question must require applied reasoning, troubleshooting judgment, standards knowledge, or selecting between plausible technical tradeoffs.'
      : '- For harder, most questions should require applied reasoning or comparing closely related concepts.';

  return `
    Difficulty guardrails:
    - The requested difficulty is mandatory; do not fall back to basic recall questions.
    - Do not ask basic definition or acronym-expansion questions at this difficulty.
    - Forbidden examples: "What is AI?", "What does IP stand for?", "What does CPU stand for?", "What is a password?", "What does Wi-Fi do?"
    ${extraRequirement}
    - Distractors should be plausible to a learner who knows the basics, not obviously silly or unrelated.
  `;
}

export function buildQuestionsPrompt({ difficulty = 'normal', previousQuestions = [] } = {}) {
  const descriptor = DIFFICULTY_DESCRIPTORS[difficulty] ?? DIFFICULTY_DESCRIPTORS.normal;
  const previousQuestionsPrompt = formatPreviousQuestionsForPrompt(previousQuestions);
  const difficultyGuardrails = formatDifficultyGuardrails(difficulty);

  return `
    Requested difficulty key: ${difficulty}
    Create an IT Trivia game at this difficulty: ${descriptor}
    Generate exactly 25 multiple choice questions.

    The questions must be divided evenly (5 questions per category) across these 5 categories, in this specific order:
    1. ${CATEGORY_NETWORKING}
    2. ${CATEGORY_AI}
    3. ${CATEGORY_DEV}
    4. ${CATEGORY_CYBER}
    5. ${CATEGORY_OPS}

    Rules:
    - Answer choices must be short phrases or single words.
    - Questions should be engaging but educational.
    - Provide 4 options per question.
    - Ensure the correct answer is accurate.
    ${difficultyGuardrails}
    ${previousQuestionsPrompt}

    Specific Category Instructions:
    - For "${CATEGORY_OPS}": Focus strictly on practical help desk scenarios, hardware/software troubleshooting, and problem-solving (e.g., "A user's screen is black," "Printer won't print"). Ask "What is the BEST first step?" or "What should you check first?". DO NOT include ITIL, ITSM, or complex framework questions. Keep it hands-on and high-school friendly.
  `;
}

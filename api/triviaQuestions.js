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
  harder: 'advanced high-school / introductory college level: more specific terminology, subtler distractors, deeper conceptual nuance. Distinctions between similar concepts (e.g., TCP vs. UDP, symmetric vs. asymmetric encryption).',
  much_harder: 'introductory college level: precise technical terminology, specific protocols, standards, and common gotchas. Distractors should require real understanding to eliminate.',
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

export function buildQuestionsPrompt({ difficulty = 'normal', previousQuestions = [] } = {}) {
  const descriptor = DIFFICULTY_DESCRIPTORS[difficulty] ?? DIFFICULTY_DESCRIPTORS.normal;
  const previousQuestionsPrompt = formatPreviousQuestionsForPrompt(previousQuestions);

  return `
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
    ${previousQuestionsPrompt}

    Specific Category Instructions:
    - For "${CATEGORY_OPS}": Focus strictly on practical help desk scenarios, hardware/software troubleshooting, and problem-solving (e.g., "A user's screen is black," "Printer won't print"). Ask "What is the BEST first step?" or "What should you check first?". DO NOT include ITIL, ITSM, or complex framework questions. Keep it hands-on and high-school friendly.
  `;
}

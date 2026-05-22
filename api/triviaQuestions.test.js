import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildQuestionsPrompt,
  formatDifficultyGuardrails,
  formatPreviousQuestionsForPrompt,
  QuestionsInputSchema,
} from './triviaQuestions.js';

const previousQuestion = {
  category: 'Cybersecurity',
  text: 'What is phishing?',
  options: ['Scam email', 'Fast network', 'Backup type', 'Database key'],
  correctAnswer: 'Scam email',
};

test('questions input defaults to normal difficulty', () => {
  assert.equal(QuestionsInputSchema.parse({}).difficulty, 'normal');
});

test('questions input accepts previous quiz questions', () => {
  const parsed = QuestionsInputSchema.parse({
    difficulty: 'harder',
    previousQuestions: [previousQuestion],
  });

  assert.equal(parsed.difficulty, 'harder');
  assert.deepEqual(parsed.previousQuestions, [previousQuestion]);
});

test('questions input rejects unsupported difficulty values', () => {
  assert.throws(() => QuestionsInputSchema.parse({ difficulty: 'impossible' }));
});

test('questions input caps previous quiz context at one full quiz', () => {
  assert.throws(() =>
    QuestionsInputSchema.parse({
      previousQuestions: Array.from({ length: 26 }, () => previousQuestion),
    }),
  );
});

test('previous-question prompt includes full quiz context and anti-repeat constraints', () => {
  const prompt = formatPreviousQuestionsForPrompt([previousQuestion]);

  assert.match(prompt, /What is phishing\?/);
  assert.match(prompt, /Scam email/);
  assert.match(prompt, /Do not repeat any previous question verbatim/);
  assert.match(prompt, /Do not closely paraphrase/);
});

test('questions prompt omits replay context when no prior quiz is supplied', () => {
  const prompt = buildQuestionsPrompt({ difficulty: 'normal' });

  assert.doesNotMatch(prompt, /Previous quiz context/);
  assert.match(prompt, /Generate exactly 25 multiple choice questions/);
});

test('harder prompts forbid basic definition and acronym questions', () => {
  const prompt = buildQuestionsPrompt({ difficulty: 'harder' });

  assert.match(prompt, /Requested difficulty key: harder/);
  assert.match(prompt, /Do not ask basic definition or acronym-expansion questions/);
  assert.match(prompt, /What is AI\?/);
  assert.match(prompt, /What does IP stand for\?/);
});

test('much_harder prompts require applied reasoning and tradeoffs', () => {
  const prompt = buildQuestionsPrompt({ difficulty: 'much_harder' });

  assert.match(prompt, /Requested difficulty key: much_harder/);
  assert.match(prompt, /every question must require applied reasoning/);
  assert.match(prompt, /troubleshooting judgment/);
  assert.match(prompt, /plausible technical tradeoffs/);
});

test('normal prompts omit advanced-only difficulty guardrails', () => {
  assert.equal(formatDifficultyGuardrails('normal'), '');
});

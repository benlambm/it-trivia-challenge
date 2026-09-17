// Pure helpers for the offline question bank. No I/O here: build-bank.mjs,
// fetch-set.mjs and the tests all import from this file.

export const AREAS = [
  'Networking & Internet',
  'Artificial Intelligence',
  'Program and Database Development',
  'Cybersecurity',
  'IT Operations and Support',
];

// Mirror of DIFFICULTY_LEVELS in api/triviaQuestions.js.
export const DIFFICULTIES = ['much_easier', 'easier', 'normal', 'harder', 'much_harder'];

export const QUESTIONS_PER_SET = 25;
export const QUESTIONS_PER_AREA = 5;
export const OPTIONS_PER_QUESTION = 4;

export const BLOCK_OPEN = '<script type="application/json" id="question-sets">';
export const BLOCK_CLOSE = '</script>';

export function normalizeText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.?!:;,]+$/, '');
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function baseName(fileName) {
  return String(fileName).replace(/^.*[\\/]/, '').replace(/\.json$/i, '');
}

// Validates one set. Returns { errors, warnings }; any error makes the set unusable.
export function validateSet(set, { fileName } = {}) {
  const errors = [];
  const warnings = [];
  const where = fileName ? `${fileName}: ` : '';

  if (!set || typeof set !== 'object' || Array.isArray(set)) {
    return { errors: [`${where}set must be a JSON object`], warnings };
  }
  if (!isNonEmptyString(set.id)) {
    errors.push(`${where}id must be a non-empty string`);
  } else if (fileName && baseName(fileName) !== set.id) {
    errors.push(`${where}id "${set.id}" must equal the file name "${baseName(fileName)}"`);
  }
  if (!DIFFICULTIES.includes(set.difficulty)) {
    errors.push(`${where}difficulty must be one of ${DIFFICULTIES.join(', ')}`);
  }
  if (!Array.isArray(set.questions)) {
    errors.push(`${where}questions must be an array`);
    return { errors, warnings };
  }
  if (set.questions.length !== QUESTIONS_PER_SET) {
    errors.push(`${where}expected ${QUESTIONS_PER_SET} questions, found ${set.questions.length}`);
  }

  const perArea = Object.fromEntries(AREAS.map((a) => [a, 0]));
  const seenText = new Map();
  const answersByArea = Object.fromEntries(AREAS.map((a) => [a, new Map()]));

  set.questions.forEach((q, i) => {
    const label = `${where}question ${i + 1}`;
    if (!q || typeof q !== 'object') {
      errors.push(`${label}: must be an object`);
      return;
    }
    if (!AREAS.includes(q.category)) {
      errors.push(`${label}: unknown category "${q.category}"`);
    } else {
      perArea[q.category] += 1;
    }
    if (!isNonEmptyString(q.text)) {
      errors.push(`${label}: text is empty`);
    } else {
      const key = normalizeText(q.text);
      if (seenText.has(key)) {
        errors.push(`${label}: duplicate of question ${seenText.get(key) + 1}`);
      } else {
        seenText.set(key, i);
      }
      if (q.text.length > 180) warnings.push(`${label}: text is ${q.text.length} chars (long for phones)`);
    }
    if (!Array.isArray(q.options) || q.options.length !== OPTIONS_PER_QUESTION) {
      errors.push(`${label}: expected exactly ${OPTIONS_PER_QUESTION} options`);
    } else {
      const normalized = new Set();
      q.options.forEach((option, j) => {
        if (!isNonEmptyString(option)) {
          errors.push(`${label}: option ${j + 1} is empty`);
          return;
        }
        const key = normalizeText(option);
        if (normalized.has(key)) errors.push(`${label}: duplicate option "${option}"`);
        normalized.add(key);
        if (option.length > 60) warnings.push(`${label}: option ${j + 1} is ${option.length} chars (long for phones)`);
      });
      // The quiz decides correctness by strict string equality, so this must be exact.
      if (!q.options.includes(q.correctAnswer)) {
        errors.push(`${label}: correctAnswer "${q.correctAnswer}" is not exactly one of the options`);
      }
    }
    if (AREAS.includes(q.category) && isNonEmptyString(q.correctAnswer)) {
      const map = answersByArea[q.category];
      const key = normalizeText(q.correctAnswer);
      if (map.has(key)) {
        warnings.push(`${label}: correct answer "${q.correctAnswer}" is also the answer to question ${map.get(key) + 1} in the same area`);
      } else {
        map.set(key, i);
      }
    }
  });

  for (const area of AREAS) {
    if (perArea[area] !== QUESTIONS_PER_AREA) {
      errors.push(`${where}${area}: expected ${QUESTIONS_PER_AREA} questions, found ${perArea[area]}`);
    }
  }
  const order = set.questions.map((q) => AREAS.indexOf(q?.category));
  const sorted = [...order].sort((a, b) => a - b);
  if (order.some((v, i) => v !== sorted[i])) {
    warnings.push(`${where}categories are not in canonical order (cosmetic only)`);
  }
  return { errors, warnings };
}

// Cross-set checks: unique ids, no question repeated across sets.
export function validateBank(sets) {
  const errors = [];
  const warnings = [];
  const ids = new Set();
  const texts = new Map();
  for (const set of sets) {
    if (ids.has(set.id)) errors.push(`duplicate set id "${set.id}"`);
    ids.add(set.id);
    (Array.isArray(set.questions) ? set.questions : []).forEach((q, qi) => {
      const key = normalizeText(q?.text);
      if (!key) return;
      const prev = texts.get(key);
      if (prev && prev.setId !== set.id) {
        errors.push(`${set.id} question ${qi + 1} duplicates ${prev.setId} question ${prev.qi + 1}`);
      } else if (!prev) {
        texts.set(key, { setId: set.id, qi });
      }
    });
  }
  return { errors, warnings };
}

// Escapes characters that could end the <script> block or break old JS parsers.
// JSON.parse turns the \u00xx sequences back into the original characters.
function escapeForScriptBlock(json) {
  return json
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(new RegExp(String.fromCharCode(0x2028), 'g'), '\\u2028')
    .replace(new RegExp(String.fromCharCode(0x2029), 'g'), '\\u2029');
}

// One set header per line, one question per line: readable diffs, valid JSON.
export function serializeSets(sets) {
  const lines = ['['];
  sets.forEach((set, si) => {
    const { questions, ...header } = set;
    const headerJson = JSON.stringify(header);
    const headerOpen = headerJson === '{}' ? '{' : `${headerJson.slice(0, -1)},`;
    lines.push(`  ${headerOpen}"questions":[`);
    questions.forEach((q, qi) => {
      lines.push(`    ${JSON.stringify(q)}${qi < questions.length - 1 ? ',' : ''}`);
    });
    lines.push(`  ]}${si < sets.length - 1 ? ',' : ''}`);
  });
  lines.push(']');
  return escapeForScriptBlock(lines.join('\n'));
}

function locateBlock(html) {
  const first = html.indexOf(BLOCK_OPEN);
  if (first === -1) throw new Error('question-sets block not found in index.html');
  if (html.indexOf(BLOCK_OPEN, first + BLOCK_OPEN.length) !== -1) {
    throw new Error('question-sets block found more than once in index.html');
  }
  const start = first + BLOCK_OPEN.length;
  const end = html.indexOf(BLOCK_CLOSE, start);
  if (end === -1) throw new Error('question-sets block is not closed');
  return { start, end };
}

// Returns the JSON text inside the block (without the surrounding newlines).
export function extractBlock(html) {
  const { start, end } = locateBlock(html);
  return html.slice(start, end).replace(/^\n/, '').replace(/\n$/, '');
}

export function replaceBlock(html, body) {
  const { start, end } = locateBlock(html);
  return `${html.slice(0, start)}\n${body}\n${html.slice(end)}`;
}

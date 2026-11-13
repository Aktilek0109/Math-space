// Іске қосу: npm test   (node --experimental-strip-types --test tests/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateFromTemplate, selfTestTemplate, TEMPLATES, createRng, deriveSeed } from '../src/lib/generator/index.ts';
import { gradeResponse, parseNumber } from '../src/lib/grading.ts';
import { selectByQuotas, splitEvenly, type Candidate } from '../src/lib/assemble.ts';

test('AC-05: бірдей seed → бірдей шарт пен жауап', () => {
  for (const key of Object.keys(TEMPLATES)) {
    for (let i = 0; i < 50; i++) {
      const seed = deriveSeed(12345, key, i);
      assert.deepEqual(generateFromTemplate(key, seed), generateFromTemplate(key, seed));
    }
  }
});

test('AC-05: әр үлгі 1000 кездейсоқ сынақта валидатордан өтеді', () => {
  for (const key of Object.keys(TEMPLATES)) {
    const report = selfTestTemplate(key, 1000);
    assert.equal(report.failures.length, 0, `${key}: ${JSON.stringify(report.failures.slice(0, 3))}`);
    assert.ok(report.deterministic, `${key} детерминирленбеген`);
  }
});

test('Үлгі кілті бағалаушыда дұрыс деп танылады', () => {
  for (const key of Object.keys(TEMPLATES)) {
    for (let i = 0; i < 200; i++) {
      const item = generateFromTemplate(key, deriveSeed(7, key, i));
      const response =
        item.questionType === 'single'
          ? { choice: item.answer.correct as string }
          : { value: String(item.answer.value) };
      const g = gradeResponse(item.questionType, item.answer, response, item.marks);
      assert.equal(g.awarded, item.marks, `${key} seed ${i}`);
    }
  }
});

test('Шартта жауап кілті жоқ (public body)', () => {
  const item = generateFromTemplate('linear-equation', 99);
  assert.ok(!('answer' in item.body));
  assert.ok(!JSON.stringify(item.body).includes('correct'));
});

test('parseNumber', () => {
  assert.equal(parseNumber('3,5'), 3.5);
  assert.equal(parseNumber(' -7/2 '), -3.5);
  assert.equal(parseNumber('1/0'), null);
  assert.equal(parseNumber('abc'), null);
  assert.equal(parseNumber(''), null);
});

test('gradeResponse: түрлер', () => {
  assert.equal(gradeResponse('single', { correct: 'b' }, { choice: 'b' }, 1).awarded, 1);
  assert.equal(gradeResponse('single', { correct: 'b' }, { choice: 'a' }, 1).awarded, 0);
  assert.equal(gradeResponse('multi', { correct: ['b', 'c'] }, { choices: ['c', 'b'] }, 2).awarded, 2);
  assert.equal(gradeResponse('multi', { correct: ['b', 'c'] }, { choices: ['b'] }, 2).awarded, 0);
  assert.equal(gradeResponse('numeric', { value: 0.333, tolerance: 0.001 }, { value: '1/3' }, 2).awarded, 2);
  assert.equal(gradeResponse('short', { accepted: ['Пифагор'] }, { value: ' пифагор ' }, 1).awarded, 1);
  const open = gradeResponse('open', {}, { text: '...' }, 4);
  assert.equal(open.state, 'pending');
  assert.equal(open.awarded, null);
});

const bank: Candidate[] = Array.from({ length: 12 }, (_, i) => ({
  id: `q${i}`,
  unitId: i < 8 ? 'U1' : 'U2',
  topicIds: [],
  marks: i % 2 === 0 ? 1 : 2,
  difficulty: (i % 3) + 1,
}));

test('AC-04: квота сақталады, қайталанған id жоқ', () => {
  const sel = selectByQuotas(bank, [
    { label: 'U1', unitIds: ['U1'], count: 6 },
    { label: 'U2', unitIds: ['U2'], count: 4 },
  ], createRng(1));
  assert.equal(sel.picked.length, 10);
  assert.equal(new Set(sel.picked.map((p) => p.candidate.id)).size, 10);
  assert.equal(sel.picked.filter((p) => p.candidate.unitId === 'U1').length, 6);
  assert.equal(sel.shortages.length, 0);
});

test('AC-06: қор жетпесе себеп көрсетіледі', () => {
  const sel = selectByQuotas(bank, [{ label: 'U2', unitIds: ['U2'], count: 10 }], createRng(2));
  assert.equal(sel.shortages.length, 1);
  assert.deepEqual(sel.shortages[0], { label: 'U2', needed: 10, available: 4, unit: 'count' });
});

test('Ұпай бойынша жинау асып кетпейді', () => {
  const sel = selectByQuotas(bank, [{ label: 'all', unitIds: [], marks: 9 }], createRng(3));
  const sum = sel.picked.reduce((s, p) => s + p.candidate.marks, 0);
  assert.equal(sum, 9);
});

test('Қайталанбау: бұрын көрген есептер strict режимде алынбайды', () => {
  const exclude = new Set(['q0', 'q1', 'q2']);
  const sel = selectByQuotas(bank, [{ label: 'U1', unitIds: ['U1'], count: 8 }], createRng(4), { excludeIds: exclude, strictExclude: true });
  assert.equal(sel.picked.length, 5);
  assert.ok(sel.picked.every((p) => !exclude.has(p.candidate.id)));
});

test('splitEvenly', () => {
  const q = splitEvenly(['A', 'B', 'C'], 10, 'count');
  assert.deepEqual(q.map((x) => x.count), [4, 3, 3]);
});

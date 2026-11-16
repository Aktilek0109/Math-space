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

test('difficultyFallback: деңгей жетпесе — ең жақын деңгейден толықтырады', () => {
  // 8.2А-дағыдай: жеңіл 8, орташа 19, күрделі 8
  const bank: Candidate[] = [
    ...Array.from({ length: 8 }, (_, i) => ({ id: `e${i}`, unitId: 'A', topicIds: [], marks: 1, difficulty: 1 })),
    ...Array.from({ length: 19 }, (_, i) => ({ id: `m${i}`, unitId: 'A', topicIds: [], marks: 2, difficulty: 2 })),
    ...Array.from({ length: 8 }, (_, i) => ({ id: `h${i}`, unitId: 'A', topicIds: [], marks: 3, difficulty: 3 })),
  ];
  const strict = selectByQuotas(bank, [{ label: 'A', unitIds: ['A'], count: 10, difficulty: 1 }], createRng(7));
  assert.equal(strict.shortages.length, 1);
  const soft = selectByQuotas(bank, [{ label: 'A', unitIds: ['A'], count: 10, difficulty: 1 }], createRng(7), { difficultyFallback: true });
  assert.equal(soft.shortages.length, 0);
  assert.equal(soft.picked.length, 10);
  assert.equal(soft.substituted, 2);
  // барлық 8 жеңіл алынды, қалған 2 — орташа (күрделі емес)
  assert.equal(soft.picked.filter((p) => p.candidate.difficulty === 1).length, 8);
  assert.equal(soft.picked.filter((p) => p.candidate.difficulty === 3).length, 0);
  const hard = selectByQuotas(bank, [{ label: 'A', unitIds: ['A'], count: 10, difficulty: 3 }], createRng(8), { difficultyFallback: true });
  assert.equal(hard.picked.filter((p) => p.candidate.difficulty === 3).length, 8);
  assert.equal(hard.picked.filter((p) => p.candidate.difficulty === 1).length, 0);
});

test('Сызба: өрнек талдағышы (график үшін)', async () => {
  const { compile, tryCompile } = await import('../src/lib/figure/expr.ts');
  const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
  near(compile('2sin(x-pi/2)+2')(Math.PI / 2), 2);
  near(compile('2sin(x-pi/2)+2')(Math.PI), 4);
  near(compile('sin x')(Math.PI / 2), 1);
  near(compile('-x^2+3x')(2), 2);
  near(compile('2^-1')(0), 0.5);
  near(compile('3(x+1)')(1), 6);
  near(compile('2x')(4), 8);
  near(compile('|x|'.replace(/\|x\|/, 'abs(x)'))(-3), 3);
  near(compile('tg(x)')(Math.PI / 4), 1);
  near(compile('ctg x')(Math.PI / 4), 1);
  near(compile('sqrt(x)/2')(16), 2);
  near(compile('cos(2x)')(Math.PI / 2), -1);
  near(compile('sin^2(x)+cos^2(x)')(0.7), 1);
  near(compile('\\pi x')(1), Math.PI);
  assert.equal(tryCompile('alert(1)'), null);
  assert.equal(tryCompile('x;'), null);
  assert.equal(tryCompile('(x+1'), null);
});

test('multipart: бөлік бойынша автоматты ұпай', () => {
  const key = { parts: { a: { value: 3 }, b: { value: 0.5, tolerance: 0.01 }, c: { correct: 'b' } }, part_marks: { a: 1, b: 2, c: 2 } };
  assert.deepEqual(gradeResponse('multipart', key, { parts: { a: '3', b: '1/2', c: 'b' } }, 5), { awarded: 5, state: 'auto', correct: true });
  assert.deepEqual(gradeResponse('multipart', key, { parts: { a: '3', b: '0,7', c: 'b' } }, 5), { awarded: 3, state: 'auto', correct: false });
  assert.deepEqual(gradeResponse('multipart', key, {}, 5), { awarded: 0, state: 'auto', correct: false });
  assert.equal(gradeResponse('multipart', {}, { parts: { a: '1' } }, 5).state, 'pending');
});

import { deriveMarkScheme } from '../src/lib/rubric.ts';
test('балл қою кестесі: қадамдар + жауап, бөліктер', () => {
  const sol = '$$\\begin{aligned}x^2-5x+6&=0\\\\D&=25-24=1\\\\x&=2;\\ 3\\end{aligned}$$\nЖауабы: $3$.';
  const l = deriveMarkScheme('numeric', 3, { text: '' }, { value: 3 }, sol);
  assert.equal(l.reduce((s, x) => s + x.marks, 0), 3);
  assert.equal(l[l.length - 1].code, 'A1');
  const mp = deriveMarkScheme('multipart', 3, { text: '', parts: [{ label: 'a', text: 'x:', marks: 1 }, { label: 'b', text: 'y:', marks: 2 }] },
    { parts: { a: { value: 0.5 }, b: { value: 2 } }, part_marks: { a: 1, b: 2 } }, '');
  assert.deepEqual(mp.map((x) => x.marks), [1, 2]);
});

import { evalLatexNumber, answerFromLines } from '../src/lib/latexnum.ts';
test('калькулятор: LaTeX жауапты санға айналдыру', () => {
  assert.ok(Math.abs(evalLatexNumber('x=2\\frac19')! - 19 / 9) < 1e-9);
  assert.ok(Math.abs(evalLatexNumber('\\frac{2\\sqrt{13}}{13}')! - 2 * Math.sqrt(13) / 13) < 1e-9);
  assert.equal(evalLatexNumber('0{,}5'), 0.5);
  assert.equal(evalLatexNumber('x+1'), null);
  assert.equal(answerFromLines(['D=256', 'x=\\frac{1}{3}']), '\\frac{1}{3}');
});

import { checkLines } from '../src/lib/stepcheck.ts';
test('шешім жолдарын тексеру', () => {
  const st = (ls: string[]) => checkLines(ls).map((c) => c.status);
  assert.deepEqual(st(['3(x-2)+14\\sqrt{x-2}-5=0', 't=\\sqrt{x-2}', '3t^2+14t-5=0', 'D=256', 't=\\frac{1}{3}', 't=-5\\ \\text{жарамсыз}', 'x=2\\frac{1}{9}']),
    ['ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok']);
  assert.deepEqual(st(['x^3=4x', 'x^2=4']), ['ok', 'error']);
  assert.deepEqual(st(['x^2-5x+6=0', 'D=25+24=49']), ['ok', 'error']);
  assert.deepEqual(st(['2x+3=7', '2x=4', 'x=3']), ['ok', 'ok', 'error']);
  assert.equal(st(['\\sqrt{x+2}=x', 'x+2=x^2'])[1], 'warn');
});

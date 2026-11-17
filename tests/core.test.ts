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

import { nextReview, INTERVALS_DAYS } from '../src/lib/mistakes.ts';
import { hintFactor } from '../src/lib/hints.ts';
test('қателермен жұмыс: аралық кестесі және кеңес айыппұлы', () => {
  const t0 = new Date('2026-11-17T00:00:00Z');
  let m = { stage: 0, correct_streak: 0 };
  let n = nextReview(m, true, t0); assert.equal(n.stage, 1); assert.equal(n.status, 'active');
  assert.equal(new Date(n.due_at).getTime() - t0.getTime(), INTERVALS_DAYS[1] * 86_400_000);
  n = nextReview({ stage: 1, correct_streak: 1 }, true, t0); n = nextReview({ stage: n.stage, correct_streak: n.correct_streak }, true, t0);
  assert.equal(n.status, 'mastered');
  n = nextReview({ stage: 3, correct_streak: 2 }, false, t0); assert.equal(n.stage, 0); assert.equal(n.correct_streak, 0);
  assert.equal(hintFactor(0), 1); assert.equal(hintFactor(1), 0.75); assert.equal(hintFactor(2), 0.5); assert.equal(hintFactor(5), 0.5);
});

import { decide, type Outcome } from '../src/lib/objective-rules.ts';
test('М3: бейімделу — 2 дұрыс → жоғары, 2 қате → төмен, меңгеру шарты', () => {
  const L = [1, 2, 3];
  const o = (level: number, ratio: number, hints = 0): Outcome => ({ level, ratio, hints, revealed: true });
  assert.equal(decide([o(1, 1)], L).level, 1);
  assert.equal(decide([o(1, 1), o(1, 1)], L).level, 2);
  assert.equal(decide([o(1, 1), o(1, 1, 1)], L).level, 1, 'көмекпен шыққаны көтермейді');
  assert.equal(decide([o(1, 1), o(1, 1), o(2, 0.2), o(2, 0)], L).level, 1);
  // 6 есеп, соңғы 5 орташа ≥80%, бірақ күрделі деңгей жоқ → меңгерілмейді, күрделіге жібереді
  const noTop = [o(1, 1), o(1, 1), o(2, 1), o(2, 0.9), o(2, 0.9), o(2, 0.9)];
  const d1 = decide(noTop, L); assert.equal(d1.done, false); assert.equal(d1.level, 3);
  const withTop = [o(1, 1), o(1, 1), o(2, 1), o(2, 1), o(3, 1), o(3, 0.8)];
  assert.deepEqual(decide(withTop, L), { done: true, reason: 'mastered', level: 3 });
  assert.equal(decide(Array.from({ length: 15 }, () => o(1, 0.3)), L).reason, 'limit');
  // тек 1–2 деңгей бар мақсатта күрделі талап етілмейді
  assert.equal(decide([o(1, 1), o(1, 1), o(2, 1), o(2, 1), o(2, 1), o(2, 1)], [1, 2]).reason, 'mastered');
});

import { itemLoss } from '../src/lib/feedback-rules.ts';
test('М4: жоғалған балл жолдары және себебі', () => {
  const body = { text: 'x', parts: [{ label: 'a', text: 'a табыңыз', marks: 1 }, { label: 'b', text: 'b табыңыз', marks: 2 }] } as never;
  const key = { parts: { a: { value: 2 }, b: { value: 5 } }, part_marks: { a: 1, b: 2 } };
  const l = itemLoss({ type: 'multipart', body, key, solutionText: '', max: 3, awarded: 1, response: { parts: { a: '2', b: '4' } }, hints: 0, pending: false });
  assert.deepEqual(l.lines.map((x) => x.got), [true, false]);
  assert.match(l.lines[1].reason!, /сіздің жауабыңыз: 4/);
  assert.match(l.lines[1].text, /\$5\$/);
  assert.equal(l.lost, 2);
  const e = itemLoss({ type: 'numeric', body: { text: 'x' } as never, key: { value: 3 }, solutionText: '', max: 2, awarded: 0, response: { value: '4', steps: ['2x=6', 'x=4'] }, hints: 1, pending: false });
  assert.match(e.reasons[0], /2-жолында|2-жол/);
  assert.ok(e.reasons.some((r) => /көмек/.test(r)));
  const n = itemLoss({ type: 'numeric', body: { text: 'x' } as never, key: { value: 3 }, solutionText: '', max: 1, awarded: 0, response: null, hints: 0, pending: false });
  assert.equal(n.reasons[0], 'Жауап жазылмаған');
});

import { band, personalEligible, personalLevels, isDrop } from '../src/lib/heatmap-rules.ts';
test('М5: түстер шкаласы және жеке үй жұмысына іріктеу', () => {
  assert.deepEqual([null, 0, 39, 40, 64, 65, 79, 80, 100].map(band), ['none', 'red', 'red', 'orange', 'orange', 'yellow', 'yellow', 'green', 'green']);
  assert.deepEqual([null, 20, 50, 70, 90].map(personalEligible), [false, true, true, false, false]);
  assert.deepEqual(personalLevels(30), [1, 2]);
  assert.equal(isDrop(60, 70), true); assert.equal(isDrop(68, 70), false); assert.equal(isDrop(60, null), false);
});

import { checkGraph } from '../src/lib/tools/graphcheck.ts';
import { checkGeo, recognize } from '../src/lib/tools/geocheck.ts';
test('М6: график тақтасы — нүктелер мен қисық кілт графигімен салыстырылады', () => {
  const key = { kind: 'plot' as const, x: [-4, 4] as [number, number], y: [-2, 10] as [number, number], curves: [{ expr: 'x^2' }], points: [{ x: 0, y: 0, label: 'O' }] };
  const good = checkGraph({ kind: 'graph', objs: [{ t: 'pt', p: [0, 0] }, { t: 'pt', p: [2, 4] }, { t: 'curve', pts: Array.from({ length: 41 }, (_, i) => { const x = -3 + i * 0.15; return [x, x * x] as [number, number]; }) }] }, key);
  assert.ok(good.every((c) => c.status === 'ok'), JSON.stringify(good));
  const bad = checkGraph({ kind: 'graph', objs: [{ t: 'pt', p: [2, 3] }, { t: 'curve', pts: Array.from({ length: 41 }, (_, i) => { const x = -3 + i * 0.15; return [x, x * x + 2] as [number, number]; }) }] }, key);
  assert.ok(bad.some((c) => c.status === 'error' && /жатпайтын/.test(c.text)));
  assert.ok(bad.some((c) => c.status === 'error' && /ауытқиды/.test(c.text)));
  assert.ok(bad.some((c) => c.status === 'warn' && /Маңызды/.test(c.text)));
});
test('М7: геометрия тақтасы — ниет тексеріледі, эскиз танылады', () => {
  const key = { kind: 'geometry' as const, points: { A: [0, 0] as [number, number], B: [15, 0] as [number, number], C: [3, 6] as [number, number], H: [3, 0] as [number, number] }, polygons: [['A', 'B', 'C']], segments: [['C', 'H']], right: [['C', 'A', 'B'], ['H', 'B', 'C']], lengths: [{ seg: ['A', 'H'] as [string, string], text: '3' }] };
  const pts = [{ id: 'a', label: 'A', p: [50, 300] as [number, number] }, { id: 'b', label: 'B', p: [450, 300] as [number, number] }, { id: 'c', label: 'C', p: [130, 140] as [number, number] }, { id: 'h', label: 'H', p: [130, 300] as [number, number] }];
  const objs = [{ t: 'seg' as const, a: 'a', b: 'b' }, { t: 'seg' as const, a: 'b', b: 'c' }, { t: 'seg' as const, a: 'c', b: 'a' }, { t: 'seg' as const, a: 'c', b: 'h' }, { t: 'right' as const, at: 'h', a: 'b', b: 'c' }, { t: 'len' as const, a: 'a', b: 'h', text: '3' }];
  const r = checkGeo({ kind: 'board', points: pts, objs }, key);
  assert.ok(!r.some((c) => c.status === 'error'), JSON.stringify(r));
  const r2 = checkGeo({ kind: 'board', points: [...pts.slice(0, 3), { id: 'h', label: 'H', p: [200, 250] }], objs: objs.slice(0, 3) }, key);
  assert.ok(r2.some((c) => /CH/.test(c.text)) && r2.some((c) => /кесіндісінде жатуы/.test(c.text)) && r2.some((c) => /тік болуы керек/.test(c.text)), JSON.stringify(r2));
  const circ = recognize(Array.from({ length: 40 }, (_, i) => [100 + 50 * Math.cos((i / 39) * 2 * Math.PI), 100 + 50 * Math.sin((i / 39) * 2 * Math.PI)] as [number, number]));
  assert.equal(circ?.kind, 'circle');
  const tri = recognize([[0, 0], [50, 1], [100, 0], [75, 40], [50, 80], [25, 40], [1, 1]]);
  assert.equal(tri?.kind, 'poly'); assert.equal((tri as { pts: unknown[] }).pts.length, 3);
});

import { polyhedron, section, edgePoint } from '../src/lib/tools/solids.ts';
test('М8: көпжақ қимасы', () => {
  const cube = polyhedron('cube')!;
  const A = cube.verts[0], C = cube.verts[2], A1 = cube.verts[4];
  assert.equal(section(cube, [A, C, A1]).length, 4, 'диагональдық қима — тіктөртбұрыш');
  const mid = (i: number, j: number) => edgePoint(cube, cube.edges.findIndex(([a, b]) => (a === i && b === j) || (a === j && b === i)), 0.5).v;
  // AB, BB1(… ) ортасы арқылы — алтыбұрыш (тұрақты қима)
  const hex = section(cube, [mid(0, 1), mid(1, 5), mid(5, 6)]);
  assert.equal(hex.length, 6);
  const pyr = polyhedron('pyr4')!;
  assert.equal(section(pyr, [pyr.verts[0], pyr.verts[2], pyr.verts[4]]).length, 3, 'пирамиданың диагональдық қимасы — үшбұрыш');
});

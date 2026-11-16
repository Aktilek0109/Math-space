'use client';

/**
 * MathLive-ты CDN-нен бір рет жүктеу және Photomath үлгісіндегі виртуалды пернетақтаны баптау.
 * Кітапхана тек калькулятор бар бетте жүктеледі (басқа беттердің салмағына әсер етпейді).
 */
const SRC = 'https://cdn.jsdelivr.net/npm/mathlive@0';
let loading: Promise<void> | null = null;

/* eslint-disable @typescript-eslint/no-explicit-any */
type W = Window & { MathfieldElement?: any; mathVirtualKeyboard?: any };

const K = (latex: string, label?: string, extra: Record<string, unknown> = {}) => ({ latex, label: label ?? latex, ...extra });
const NAV = ['[left]', '[right]', '[backspace]', { label: '↵', command: ['performWithFeedback', 'commit'], class: 'action' }];

/** Қойындылар: 123 · f(x) · sin · ≤ ∈ · abc */
const LAYOUTS = [
  {
    label: '123',
    tooltip: 'Сандар',
    rows: [
      ['7', '8', '9', K('\\div', '÷'), K('\\frac{#@}{#0}', '□/□'), K('\\left(#0\\right)', '( )')],
      ['4', '5', '6', K('\\cdot', '×'), K('#@^{#0}', '□ⁿ'), K('\\sqrt{#0}', '√□')],
      ['1', '2', '3', '-', K('#@^{2}', 'x²'), 'x'],
      ['0', K('{,}', ','), '=', '+', K('\\pm', '±'), 'y'],
      NAV,
    ],
  },
  {
    label: 'f(x)',
    tooltip: 'Өрнектер',
    rows: [
      ['a', 'b', 'c', 't', K('\\sqrt[#0]{#0}', 'ⁿ√□'), K('\\left|#0\\right|', '|□|')],
      ['k', 'n', 'm', 'D', K('#0\\frac{#0}{#0}', '□<small>□/□</small>'), K('#@_{#0}', '□ₙ')],
      [K('x_1', 'x₁'), K('x_2', 'x₂'), K('x_{1,2}', 'x₁,₂'), K('\\cdot', '·'), K('\\left(#0\\right)^{#0}', '(□)ⁿ'), K('\\frac{-b\\pm\\sqrt{D}}{2a}', 'формула', { class: 'small' })],
      NAV,
    ],
  },
  {
    label: 'sin',
    tooltip: 'Тригонометрия',
    rows: [
      [K('\\sin'), K('\\cos'), K('\\operatorname{tg}', 'tg'), K('\\operatorname{ctg}', 'ctg'), K('\\pi', 'π'), K('^{\\circ}', '°')],
      [K('\\alpha', 'α'), K('\\beta', 'β'), K('\\varphi', 'φ'), K('\\frac{\\pi}{6}', 'π/6'), K('\\frac{\\pi}{4}', 'π/4'), K('\\frac{\\pi}{3}', 'π/3')],
      [K('\\sin^2', 'sin²'), K('\\cos^2', 'cos²'), K('\\operatorname{tg}^2', 'tg²'), K('\\frac{\\pi}{2}', 'π/2'), K('2\\pi', '2π'), K('\\arcsin', 'arcsin', { class: 'small' })],
      NAV,
    ],
  },
  {
    label: '≤ ∈',
    tooltip: 'Теңсіздік, жиын, жүйе',
    rows: [
      ['<', '>', K('\\le', '≤'), K('\\ge', '≥'), K('\\ne', '≠'), K('\\approx', '≈')],
      [K('\\in', '∈'), K('\\cup', '∪'), K('\\cap', '∩'), K('\\infty', '∞'), K('\\varnothing', '∅'), K(';')],
      [K('\\left(#0;#0\\right)', '(□;□)'), K('\\left[#0;#0\\right]', '[□;□]'), K('\\begin{cases}#0\\\\#0\\end{cases}', '{ жүйе'), K('\\Rightarrow', '⇒'), K('\\Leftrightarrow', '⇔'), K('\\ \\text{немесе}\\ ', 'немесе', { class: 'small' })],
      NAV,
    ],
  },
  'alphabetic',
];

function configure(w: W) {
  const MF = w.MathfieldElement;
  if (MF) {
    try { MF.decimalSeparator = ','; } catch { /* ескі нұсқа */ }
    try { MF.soundsDirectory = null; MF.keypressSound = null; MF.plonkSound = null; } catch { /* */ }
  }
  const kb = w.mathVirtualKeyboard;
  if (kb) {
    kb.layouts = LAYOUTS;
    try { kb.editToolbar = 'none'; } catch { /* */ }
  }
}

export function ensureMathLive(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  const w = window as W;
  if (customElements.get('math-field')) { configure(w); return Promise.resolve(); }
  if (!loading) {
    loading = new Promise<void>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SRC;
      s.async = true;
      s.onload = () => customElements.whenDefined('math-field').then(() => { configure(w); resolve(); });
      s.onerror = () => { loading = null; reject(new Error('Калькулятор жүктелмеді — интернетті тексеріңіз')); };
      document.head.appendChild(s);
    });
  }
  return loading;
}

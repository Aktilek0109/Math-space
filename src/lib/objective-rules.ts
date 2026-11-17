/** Оқу мақсаты бойынша бейімделу ережелері (таза, тестіленетін). */
export const MIN_ITEMS = 6, MAX_ITEMS = 15, MASTERY = 0.8;

export interface Outcome { level: number; ratio: number; hints: number; revealed: boolean }

/** Келесі деңгей және аяқталу шарты (таза функция — тестіленеді) */
export function decide(outs: Outcome[], levels: number[]): { done: boolean; reason?: 'mastered' | 'limit'; level: number } {
  const n = outs.length;
  const last5 = outs.slice(-5);
  const avg = last5.reduce((s, o) => s + o.ratio, 0) / Math.max(1, last5.length);
  const top = Math.max(...levels);
  const topOk = !levels.includes(3) || last5.some((o) => o.level === 3 && o.ratio >= MASTERY);
  if (n >= MIN_ITEMS && avg >= MASTERY && topOk) return { done: true, reason: 'mastered', level: outs[n - 1].level };
  if (n >= MAX_ITEMS) return { done: true, reason: 'limit', level: outs[n - 1].level };
  const cur = outs[n - 1]?.level ?? levels[0];
  const idx = levels.indexOf(cur);
  const lastTwo = outs.slice(-2).filter((o) => o.level === cur);
  const ok = (o: Outcome) => o.ratio >= 0.99 && o.hints === 0;
  if (lastTwo.length === 2 && lastTwo.every(ok) && idx < levels.length - 1) return { done: false, level: levels[idx + 1] };
  if (lastTwo.length === 2 && lastTwo.every((o) => o.ratio < 0.5) && idx > 0) return { done: false, level: levels[idx - 1] };
  // жоғары деңгейге жеткенде, шегіне жақындаса да тексеріп көру
  if (n >= MIN_ITEMS - 1 && avg >= MASTERY && !topOk && cur !== top) return { done: false, level: top };
  return { done: false, level: cur };
}


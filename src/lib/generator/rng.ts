import type { Rng } from './types.ts';

/** Детерминирленген mulberry32 генераторы: бірдей seed → бірдей тізбек (GEN-04). */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min;
  return {
    next,
    int,
    pick: (items) => {
      if (items.length === 0) throw new Error('pick: бос тізім');
      return items[int(0, items.length - 1)];
    },
    shuffle: (items) => {
      const a = [...items];
      for (let i = a.length - 1; i > 0; i--) {
        const j = int(0, i);
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
  };
}

/** Сессия seed-і мен реттік нөмірден тұрақты ішкі seed шығару. */
export function deriveSeed(base: number, ...parts: (number | string)[]): number {
  let h = (base ^ 0x9e3779b9) >>> 0;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) {
      h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
    }
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  }
  return h >>> 0;
}

/** Postgres bigint-ке сыятын жаңа кездейсоқ seed (2^31-ден кіші). */
export function newSeed(): number {
  return Math.floor(Math.random() * 2147483647);
}

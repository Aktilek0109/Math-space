import type { Rng } from './generator/types.ts';

/** Банктен таңдауға үміткер (кілтсіз метадерек). */
export interface Candidate {
  id: string;
  unitId: string | null;
  topicIds: string[];
  marks: number;
  difficulty: number;
}

/** Бір квота: бөлім(дер) бойынша қанша есеп/ұпай керек. */
export interface Quota {
  label: string;
  unitIds: string[];
  count?: number;
  marks?: number;
  difficulty?: number;
}

export interface Shortage {
  label: string;
  needed: number;
  available: number;
  unit: 'count' | 'marks';
}

export interface Selection {
  picked: { candidate: Candidate; quota: string }[];
  shortages: Shortage[];
}

/**
 * Квоталар бойынша банктен қайталанбайтын есептер таңдау (GEN-02, MESK-04).
 * - бір тест ішінде бір id екі рет кездеспейді;
 * - excludeIds (бұрын шешілгендер) мүмкіндігінше айналып өтіледі;
 * - жетіспесе — нақты себеппен shortage қайтарылады.
 */
export function selectByQuotas(
  candidates: Candidate[],
  quotas: Quota[],
  rng: Rng,
  opts: { excludeIds?: Set<string>; strictExclude?: boolean } = {},
): Selection {
  const used = new Set<string>();
  const picked: Selection['picked'] = [];
  const shortages: Shortage[] = [];
  const exclude = opts.excludeIds ?? new Set<string>();

  for (const q of quotas) {
    const pool = candidates.filter(
      (c) =>
        !used.has(c.id) &&
        (q.unitIds.length === 0 || (c.unitId !== null && q.unitIds.includes(c.unitId))) &&
        (q.difficulty === undefined || c.difficulty === q.difficulty),
    );
    // Жаңа есептер алдымен, бұрын көргендері соңынан (strict болса — мүлде жоқ)
    const fresh = rng.shuffle(pool.filter((c) => !exclude.has(c.id)));
    const seen = opts.strictExclude ? [] : rng.shuffle(pool.filter((c) => exclude.has(c.id)));
    const ordered = [...fresh, ...seen];

    if (q.count !== undefined) {
      const take = ordered.slice(0, q.count);
      take.forEach((c) => {
        used.add(c.id);
        picked.push({ candidate: c, quota: q.label });
      });
      if (take.length < q.count) shortages.push({ label: q.label, needed: q.count, available: take.length, unit: 'count' });
    } else if (q.marks !== undefined) {
      // Ұпайға жету: ашкөз таңдау, асып кетпейтін есептерді ғана алады
      let sum = 0;
      for (const c of ordered) {
        if (sum + c.marks <= q.marks + 1e-9) {
          used.add(c.id);
          picked.push({ candidate: c, quota: q.label });
          sum += c.marks;
        }
        if (Math.abs(sum - q.marks) < 1e-9) break;
      }
      if (sum + 1e-9 < q.marks) shortages.push({ label: q.label, needed: q.marks, available: sum, unit: 'marks' });
    }
  }
  return { picked, shortages };
}

/** Бірнеше бөлімге жалпы сан/ұпайды тең бөлу (оқушы өзі құрастырғанда). */
export function splitEvenly(unitIds: string[], total: number, kind: 'count' | 'marks', difficulty?: number): Quota[] {
  if (unitIds.length === 0) return [{ label: 'Барлық бөлім', unitIds: [], [kind]: total, difficulty }];
  const base = Math.floor(total / unitIds.length);
  let rest = total - base * unitIds.length;
  return unitIds.map((u) => {
    const share = base + (rest > 0 ? 1 : 0);
    if (rest > 0) rest--;
    return { label: u, unitIds: [u], [kind]: share, difficulty };
  });
}

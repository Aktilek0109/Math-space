import { createRng, deriveSeed } from './rng.ts';
import { getTemplate } from './templates.ts';
import type { GeneratedItem } from './types.ts';

export class TemplateError extends Error {}

/**
 * Үлгіден есеп жасау. Бірдей (key, seed) → бірдей есеп (GEN-04).
 * Валидатордан өтпесе, seed-ті детерминирленген түрде ауыстырып қайталайды.
 */
export function generateFromTemplate(key: string, seed: number, maxAttempts = 25): GeneratedItem {
  const template = getTemplate(key);
  if (!template) throw new TemplateError(`Белгісіз үлгі: ${key}`);
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const rng = createRng(attempt === 0 ? seed : deriveSeed(seed, 'retry', attempt));
    const item = template.generate(rng);
    if (template.validate(item).length === 0) return item;
  }
  throw new TemplateError(`${key}: ${maxAttempts} әрекетте жарамды есеп шықпады`);
}

/** Әкімші тексерісі (11-бөлім, 4-қадам): N рет генерациялап, қателерді жинау. */
export function selfTestTemplate(key: string, runs = 100) {
  const template = getTemplate(key);
  if (!template) throw new TemplateError(`Белгісіз үлгі: ${key}`);
  const failures: { seed: number; errors: string[] }[] = [];
  let deterministic = true;
  for (let i = 0; i < runs; i++) {
    const seed = deriveSeed(Date.now() & 0xffff, key, i);
    const item = template.generate(createRng(seed));
    const errors = template.validate(item);
    if (errors.length) failures.push({ seed, errors });
    const again = template.generate(createRng(seed));
    if (JSON.stringify(again) !== JSON.stringify(item)) deterministic = false;
  }
  return { key, version: template.version, runs, failures, deterministic, ok: failures.length === 0 && deterministic };
}

export { TEMPLATES, getTemplate } from './templates.ts';
export { createRng, deriveSeed, newSeed } from './rng.ts';
export type * from './types.ts';

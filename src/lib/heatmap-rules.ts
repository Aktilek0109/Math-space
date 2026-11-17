/** М5: жылу картасының таза ережелері (тестіленеді). */
export type Band = 'none' | 'red' | 'orange' | 'yellow' | 'green';
export const BANDS: { band: Band; label: string; min: number }[] = [
  { band: 'green', label: 'меңгерді', min: 80 },
  { band: 'yellow', label: 'жақын', min: 65 },
  { band: 'orange', label: 'жартылай', min: 40 },
  { band: 'red', label: 'қиналады', min: 0 },
];
export function band(pct: number | null | undefined): Band {
  if (pct == null) return 'none';
  return pct >= 80 ? 'green' : pct >= 65 ? 'yellow' : pct >= 40 ? 'orange' : 'red';
}
/** Жеке үй жұмысына тек қызыл/қызғылт сары ұяшықтар жарайды */
export const personalEligible = (pct: number | null | undefined) => { const b = band(pct); return b === 'red' || b === 'orange'; };
/** Деңгей: қызыл → жеңіл+орта, қызғылт сары → орта (+ бір күрделі) */
export function personalLevels(pct: number): number[] { return band(pct) === 'red' ? [1, 2] : [2, 2, 3]; }
export const DROP = 5;   // ↓ белгісі: алдыңғы көрсеткіштен кемінде 5 пунктке төмен
export const isDrop = (pct: number | null, prev: number | null) => pct != null && prev != null && prev - pct >= DROP;

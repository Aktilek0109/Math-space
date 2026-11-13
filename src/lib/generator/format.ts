/** a·x + b түріндегі өрнекті LaTeX-ке әдемі жазу: 1x → x, -1x → -x, +-3 → -3. */
export function linearTerm(coef: number, variable: string, first: boolean): string {
  if (coef === 0) return '';
  const abs = Math.abs(coef);
  const body = abs === 1 && variable ? variable : `${abs}${variable}`;
  if (first) return coef < 0 ? `-${body}` : body;
  return coef < 0 ? ` - ${body}` : ` + ${body}`;
}

export function polynomial(terms: [number, string][]): string {
  let out = '';
  for (const [coef, v] of terms) {
    if (coef === 0) continue;
    out += linearTerm(coef, v, out === '');
  }
  return out === '' ? '0' : out;
}

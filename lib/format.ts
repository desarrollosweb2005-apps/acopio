const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${sameYear ? '' : ` ${d.getFullYear()}`}`;
}

export const fold = (s: string | null | undefined) =>
  String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export const cleanTag = (t: string) => t.trim().replace(/^#+/, '').toLowerCase().replace(/\s+/g, '-');

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

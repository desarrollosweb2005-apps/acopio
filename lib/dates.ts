// Agrupar marcadores por semana (lunes a domingo) o por mes, en la hora local del navegador
export type GroupMode = 'none' | 'week' | 'month';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MONTHS_LONG = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DAY = 86400000;

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function monday(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

/** Clave ordenable del grupo: `AAAA-MM-DD` del lunes de la semana o `AAAA-MM` del mes. */
export function dateGroupKey(iso: string, mode: GroupMode): string {
  const d = new Date(iso);
  return mode === 'month' ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}` : ymd(monday(d));
}

/** Título y subtítulo del grupo: «Semana pasada» · «13–19 oct», «Octubre» · «Este mes». */
export function dateGroupLabel(key: string, mode: GroupMode, now = new Date()): [string, string] {
  const year = now.getFullYear();
  if (mode === 'month') {
    const [y, m] = key.split('-').map(Number);
    const ago = (year - y) * 12 + (now.getMonth() + 1 - m);
    return [`${MONTHS_LONG[m - 1]}${y !== year ? ` ${y}` : ''}`, ago === 0 ? 'Este mes' : ago === 1 ? 'Mes pasado' : ''];
  }
  const [y, m, d] = key.split('-').map(Number);
  const start = new Date(y, m - 1, d);
  const end = new Date(y, m - 1, d + 6);
  const yr = (x: Date) => (x.getFullYear() !== year ? ` ${x.getFullYear()}` : '');
  const range = start.getMonth() === end.getMonth()
    ? `${start.getDate()}–${end.getDate()} ${MONTHS[end.getMonth()]}${yr(end)}`
    : `${start.getDate()} ${MONTHS[start.getMonth()]}${start.getFullYear() !== end.getFullYear() ? yr(start) : ''} – ${end.getDate()} ${MONTHS[end.getMonth()]}${yr(end)}`;
  const ago = Math.round((monday(now).getTime() - start.getTime()) / (7 * DAY));
  if (ago === 0) return ['Esta semana', range];
  if (ago === 1) return ['Semana pasada', range];
  if (ago > 1 && ago <= 8) return [`Hace ${ago} semanas`, range];
  return [range, ''];
}

export interface DateGroup<T> { key: string; label: string; sub: string; items: T[] }

/** Reparte la lista (ya ordenada) en grupos; los grupos van del más nuevo al más antiguo o al revés. */
export function groupByDate<T extends { created_at: string }>(items: T[], mode: GroupMode, dir: 'asc' | 'desc'): DateGroup<T>[] {
  const map = new Map<string, T[]>();
  items.forEach((b) => {
    const k = dateGroupKey(b.created_at, mode);
    const g = map.get(k);
    if (g) g.push(b); else map.set(k, [b]);
  });
  const now = new Date();
  return [...map.keys()]
    .sort((a, b) => (dir === 'asc' ? a.localeCompare(b) : b.localeCompare(a)))
    .map((key) => { const [label, sub] = dateGroupLabel(key, mode, now); return { key, label, sub, items: map.get(key)! }; });
}

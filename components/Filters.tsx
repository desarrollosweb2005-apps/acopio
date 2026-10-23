'use client';

import { useState } from 'react';
import { STATUS_LABEL, type Bookmark, type Status } from '@/lib/types';
import { groupByDate, type GroupMode } from '@/lib/dates';
import { plural } from '@/lib/format';

/** Filtros combinables de la lista: tipo, colección, estado y etiquetas (todas a la vez). */
export interface FilterState { type: string; col: string; status: string; tags: string[] }
export const NO_FILTERS: FilterState = { type: '', col: '', status: '', tags: [] };
export const hasFilters = (f: FilterState) => !!(f.type || f.col || f.status || f.tags.length);

export const TYPE_LABEL: Record<string, string> = {
  web: 'Webs', video: 'Vídeos', x: 'Posts de X', repo: 'Repos', prompt: 'Prompts',
  image: 'Capturas e imágenes', pdf: 'PDFs', file: 'Otros archivos',
};
export const typeOf = (b: Bookmark) => (b.kind === 'prompt' ? 'prompt' : b.source);

export interface ColOption { value: string; label: string; n: number }

export function FilterBar({ value, onChange, typeCounts, colOptions, statusCounts, tagCounts, hideCol, hideTag, children }: {
  value: FilterState;
  onChange: (f: FilterState) => void;
  typeCounts: Map<string, number>;
  colOptions: ColOption[] | null;
  statusCounts: Map<string, number>;
  tagCounts: [string, number][];
  hideCol: boolean;
  hideTag: string | null;
  /** Controles que van delante de los filtros (agrupar por fecha) */
  children?: React.ReactNode;
}) {
  const set = (patch: Partial<FilterState>) => onChange({ ...value, ...patch });
  const types = Object.keys(TYPE_LABEL).filter((t) => typeCounts.get(t) || value.type === t);
  const statuses = (Object.keys(STATUS_LABEL) as Status[]).filter((s) => statusCounts.get(s) || value.status === s);
  const tags = tagCounts.filter(([t]) => t !== hideTag && !value.tags.includes(t));
  const cols = colOptions?.filter((o) => o.n || o.value === value.col) ?? [];

  return (
    <div className="filters" role="group" aria-label="Filtros">
      {children}
      {types.length > 1 && (
        <select className={`sm ${value.type ? 'on' : ''}`} aria-label="Tipo" value={value.type} onChange={(e) => set({ type: e.target.value })}>
          <option value="">Todos los tipos</option>
          {types.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]} ({typeCounts.get(t) ?? 0})</option>)}
        </select>
      )}
      {!hideCol && cols.length > 0 && (
        <select className={`sm ${value.col ? 'on' : ''}`} aria-label="Colección" value={value.col} onChange={(e) => set({ col: e.target.value })}>
          <option value="">Todas las colecciones</option>
          {cols.map((o) => <option key={o.value} value={o.value}>{o.label} ({o.n})</option>)}
        </select>
      )}
      {statuses.length > 0 && (
        <select className={`sm ${value.status ? 'on' : ''}`} aria-label="Estado" value={value.status} onChange={(e) => set({ status: e.target.value })}>
          <option value="">Cualquier estado</option>
          {statuses.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]} ({statusCounts.get(s) ?? 0})</option>)}
        </select>
      )}
      {tags.length > 0 && (
        <select className="sm" aria-label="Añadir etiqueta al filtro" value="" onChange={(e) => e.target.value && set({ tags: [...value.tags, e.target.value] })}>
          <option value="">{value.tags.length ? '+ Otra etiqueta' : 'Filtrar por etiqueta'}</option>
          {tags.map(([t, n]) => <option key={t} value={t}>#{t} ({n})</option>)}
        </select>
      )}
      {value.tags.map((t) => (
        <span key={t} className="fchip">#{t}
          <button type="button" aria-label={`Quitar #${t}`} onClick={() => set({ tags: value.tags.filter((x) => x !== t) })}>×</button>
        </span>
      ))}
      {hasFilters(value) && <button type="button" className="link-btn" onClick={() => onChange(NO_FILTERS)}>Quitar filtros</button>}
    </div>
  );
}

/** Lista dividida en semanas o meses, con cabeceras que se pliegan. */
export function DateGroups<T extends { created_at: string }>({ items, mode, dir, render }: {
  items: T[];
  mode: GroupMode;
  dir: 'asc' | 'desc';
  render: (items: T[]) => React.ReactNode;
}) {
  const [closed, setClosed] = useState<Set<string>>(new Set());
  if (mode === 'none') return <>{render(items)}</>;
  const toggle = (k: string) => setClosed((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  return (
    <div className="dgroups">
      {groupByDate(items, mode, dir).map((g) => {
        const open = !closed.has(g.key);
        return (
          <section key={g.key} className="dgroup">
            <button type="button" className="dhead" aria-expanded={open} onClick={() => toggle(g.key)}>
              <span className="chev" aria-hidden="true">{open ? '▾' : '▸'}</span>
              <b suppressHydrationWarning>{g.label}</b>
              {g.sub && <span suppressHydrationWarning>{g.sub}</span>}
              <span className="dn">{plural(g.items.length, 'marcador', 'marcadores')}</span>
            </button>
            {open && render(g.items)}
          </section>
        );
      })}
    </div>
  );
}

/** Etiqueta de una tarjeta: al pulsarla se añade como filtro (sin abrir la ficha). */
export function TagLink({ t, onTag }: { t: string; onTag: (t: string) => void }) {
  return <button type="button" className="tag" title={`Filtrar por #${t}`} onClick={(e) => { e.stopPropagation(); onTag(t); }}>#{t}</button>;
}

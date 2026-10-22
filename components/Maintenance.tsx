'use client';

import { useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Bookmark } from '@/lib/types';
import { fmtDate, plural } from '@/lib/format';
import { normalizeUrl } from '@/lib/url';
import { similarTagGroups, type TagGroup } from '@/lib/tags';
import { SourceIcon } from './Thumb';

type Setter = React.Dispatch<React.SetStateAction<Bookmark[]>>;

/** Grupos de marcadores con el mismo link (con las reglas de duplicados actuales). */
export function duplicateGroups(bookmarks: Bookmark[]) {
  const m = new Map<string, Bookmark[]>();
  bookmarks.filter((b) => b.kind === 'link' && b.url).forEach((b) => {
    const k = normalizeUrl(b.url!);
    m.set(k, [...(m.get(k) ?? []), b]);
  });
  return [...m.values()].filter((g) => g.length > 1);
}

// El más completo se queda: con colección, con copia, con más notas y highlights
const completeness = (b: Bookmark) =>
  (b.collection_id ? 100 : 0) + (b.content_fetched_at ? 50 : 0) + b.highlights.length * 10 + b.note.length / 10 + b.tags.length;

export function DupesPanel({ bookmarks, setBookmarks, supabase, toast, colPath, onOpen }: {
  bookmarks: Bookmark[]; setBookmarks: Setter; supabase: SupabaseClient; toast: (m: string) => void;
  colPath: (id: string | null) => string; onOpen: (id: string) => void;
}) {
  const groups = useMemo(() => duplicateGroups(bookmarks), [bookmarks]);
  const [busy, setBusy] = useState('');

  async function merge(group: Bookmark[]) {
    const [keep, ...rest] = [...group].sort((a, b) => completeness(b) - completeness(a));
    setBusy(keep.id);
    const restIds = rest.map((b) => b.id);
    const tags = [...new Set(group.flatMap((b) => b.tags))];
    const note = [...new Set(group.map((b) => b.note.trim()).filter(Boolean))].join('\n\n');
    const patch = {
      tags, note,
      collection_id: keep.collection_id ?? rest.find((b) => b.collection_id)?.collection_id ?? null,
      url_norm: normalizeUrl(keep.url!),
      status: group.some((b) => b.status === 'applied') ? 'applied' as const : group.some((b) => b.status === 'seen') ? 'seen' as const : keep.status,
    };
    const steps = await Promise.all([
      supabase.from('bookmarks').update(patch).eq('id', keep.id),
      supabase.from('highlights').update({ bookmark_id: keep.id }).in('bookmark_id', restIds),
    ]);
    const failed = steps.find((s) => s.error);
    if (failed?.error) { setBusy(''); return toast(`No se pudo fusionar: ${failed.error.message}`); }
    const { error } = await supabase.from('bookmarks').delete().in('id', restIds);
    setBusy('');
    if (error) return toast(`No se pudieron borrar las copias: ${error.message}`);
    const highlights = group.flatMap((b) => b.highlights.map((h) => ({ ...h, bookmark_id: keep.id })));
    setBookmarks((bs) => bs.filter((b) => !restIds.includes(b.id)).map((b) => (b.id === keep.id ? { ...b, ...patch, highlights } : b)));
    toast('Duplicados fusionados');
  }

  if (!groups.length) return <div className="empty">No hay links repetidos.</div>;
  return (
    <div className="stack">
      {groups.length > 1 && (
        <div className="banner">
          <span>{plural(groups.length, 'link aparece', 'links aparecen')} más de una vez. Al fusionar se conserva el marcador más completo y se le suman etiquetas, notas y highlights de las copias.</span>
          <button className="primary" disabled={!!busy} onClick={async () => { for (const g of groups) await merge(g); }}>Fusionar todos</button>
        </div>
      )}
      {groups.map((g) => (
        <div key={g[0].id} className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <b>{plural(g.length, 'copia', 'copias')} del mismo link</b>
            <button className="primary" disabled={!!busy} onClick={() => merge(g)}>{busy && g.some((b) => b.id === busy) ? 'Fusionando…' : 'Fusionar'}</button>
          </div>
          {g.map((b) => (
            <button key={b.id} className="cite" onClick={() => onOpen(b.id)}>
              <SourceIcon b={b} />
              <span style={{ minWidth: 0 }}>
                <span className="ttl">{b.title}</span>
                <span className="mono" style={{ display: 'block' }}>{b.url} · {colPath(b.collection_id)} · {fmtDate(b.created_at)}</span>
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

export function TagsPanel({ bookmarks, setBookmarks, supabase, toast, tagCounts, aiEnabled }: {
  bookmarks: Bookmark[]; setBookmarks: Setter; supabase: SupabaseClient; toast: (m: string) => void;
  tagCounts: [string, number][]; aiEnabled: boolean;
}) {
  const [aiGroups, setAiGroups] = useState<TagGroup[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const count = new Map(tagCounts);

  // Reglas + IA, sin repetir grupos y solo con etiquetas que siguen existiendo
  const groups = useMemo(() => {
    const seen = new Set<string>();
    return [...similarTagGroups(tagCounts), ...aiGroups]
      .map((g) => ({ ...g, tags: g.tags.filter((t) => count.has(t)) }))
      .filter((g) => g.tags.length > 1)
      .filter((g) => { const k = [...g.tags].sort().join('|'); if (seen.has(k)) return false; seen.add(k); return true; });
  }, [tagCounts, aiGroups]); // eslint-disable-line react-hooks/exhaustive-deps

  async function merge(from: string[], to: string) {
    setBusy(true);
    const affected = bookmarks.filter((b) => b.tags.some((t) => from.includes(t)));
    const updates = affected.map((b) => ({ id: b.id, tags: [...new Set(b.tags.map((t) => (from.includes(t) ? to : t)))] }));
    for (let i = 0; i < updates.length; i += 8) {
      await Promise.all(updates.slice(i, i + 8).map((u) => supabase.from('bookmarks').update({ tags: u.tags }).eq('id', u.id)));
    }
    const byId = new Map(updates.map((u) => [u.id, u.tags]));
    setBookmarks((bs) => bs.map((b) => (byId.has(b.id) ? { ...b, tags: byId.get(b.id)! } : b)));
    setBusy(false);
    toast(`${from.map((t) => `#${t}`).join(', ')} → #${to} en ${plural(updates.length, 'marcador', 'marcadores')}`);
  }

  async function askAi() {
    setAiBusy(true);
    const res = await fetch('/api/ai/tags', { method: 'POST' });
    const data = await res.json().catch(() => ({ error: 'Respuesta no válida' }));
    setAiBusy(false);
    if (!res.ok) return toast(data.error ?? 'La IA no respondió');
    setAiGroups(data.groups);
    if (!data.groups.length) toast('La IA no encontró más etiquetas parecidas');
  }

  return (
    <div className="stack">
      <div className="banner">
        <span>Etiquetas que significan lo mismo (idioma, plural o variante). Elige con cuál quedarte y fusiona: los marcadores pasan a usar solo esa.</span>
        {aiEnabled && <button className="ghost" onClick={askAi} disabled={aiBusy}>{aiBusy ? 'Buscando…' : '✦ Buscar más con IA'}</button>}
      </div>
      {!groups.length && <div className="empty">No hay etiquetas parecidas.</div>}
      {groups.map((g) => {
        const key = [...g.tags].sort().join('|');
        const keep = chosen[key] && g.tags.includes(chosen[key]) ? chosen[key] : g.keep;
        return (
          <div key={key} className="card">
            <div className="row">
              {g.tags.map((t) => (
                <label key={t} className={`tagbtn ${t === keep ? 'on' : ''}`} style={{ cursor: 'pointer' }}>
                  <input type="radio" name={key} checked={t === keep} onChange={() => setChosen({ ...chosen, [key]: t })} style={{ marginRight: 4 }} />
                  #{t}<b>{count.get(t)}</b>
                </label>
              ))}
              <button className="primary" style={{ marginLeft: 'auto' }} disabled={busy} onClick={() => merge(g.tags.filter((t) => t !== keep), keep)}>
                Fusionar en #{keep}
              </button>
            </div>
          </div>
        );
      })}
      <RenameTag tagCounts={tagCounts} onRename={(from, to) => merge([from], to)} busy={busy} />
    </div>
  );
}

/** Renombrar a mano cualquier etiqueta (si el nombre nuevo ya existe, se fusionan). */
function RenameTag({ tagCounts, onRename, busy }: { tagCounts: [string, number][]; onRename: (from: string, to: string) => void; busy: boolean }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const clean = to.trim().replace(/^#+/, '').toLowerCase().replace(/\s+/g, '-');
  return (
    <form className="card" onSubmit={(e) => { e.preventDefault(); if (from && clean && clean !== from) { onRename(from, clean); setTo(''); } }}>
      <h2 style={{ fontSize: 15, margin: 0 }}>Renombrar una etiqueta</h2>
      <div className="form-grid">
        <label className="field"><span>Etiqueta</span>
          <select id="rn-from" value={from} onChange={(e) => setFrom(e.target.value)}>
            <option value="">Elige…</option>
            {tagCounts.map(([t, n]) => <option key={t} value={t}>#{t} ({n})</option>)}
          </select>
        </label>
        <label className="field"><span>Nuevo nombre</span>
          <input id="rn-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="si ya existe, se fusionan" />
        </label>
      </div>
      <button className="primary" type="submit" disabled={busy || !from || !clean || clean === from} style={{ alignSelf: 'flex-start' }}>Renombrar</button>
    </form>
  );
}

export function BrokenPanel({ bookmarks, setBookmarks, supabase, toast, onOpen }: {
  bookmarks: Bookmark[]; setBookmarks: Setter; supabase: SupabaseClient; toast: (m: string) => void; onOpen: (id: string) => void;
}) {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const broken = bookmarks.filter((b) => b.is_broken);
  const links = bookmarks.filter((b) => b.kind === 'link' && b.url);
  const lastCheck = links.map((b) => (b.meta as { checked_at?: string })?.checked_at).filter(Boolean).sort().pop();

  async function checkAll() {
    const ids = links.map((b) => b.id);
    setProgress({ done: 0, total: ids.length });
    const found: Record<string, { result: string; checked_at: string }> = {};
    for (let i = 0; i < ids.length; i += 12) {
      const res = await fetch('/api/check-links', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: ids.slice(i, i + 12) }) });
      if (!res.ok) { toast('No se pudo terminar la comprobación'); break; }
      const { results } = await res.json();
      results.forEach((r: { id: string; result: string; checked_at: string }) => (found[r.id] = r));
      setProgress({ done: Math.min(ids.length, i + 12), total: ids.length });
    }
    setBookmarks((bs) => bs.map((b) => {
      const r = found[b.id];
      if (!r) return b;
      return { ...b, is_broken: r.result === 'unknown' ? b.is_broken : r.result === 'broken', meta: { ...(b.meta ?? {}), checked_at: r.checked_at, check_result: r.result } };
    }));
    setProgress(null);
    const n = Object.values(found).filter((r) => r.result === 'broken').length;
    toast(n ? `${plural(n, 'link roto encontrado', 'links rotos encontrados')}` : 'Todos los links responden');
  }

  async function notBroken(b: Bookmark) {
    const { error } = await supabase.from('bookmarks').update({ is_broken: false }).eq('id', b.id);
    if (error) return toast(error.message);
    setBookmarks((bs) => bs.map((x) => (x.id === b.id ? { ...x, is_broken: false } : x)));
  }

  return (
    <div className="stack">
      <div className="banner">
        <span>
          Comprueba si cada link sigue funcionando. Solo se marca como roto lo seguro: páginas que ya no existen y vídeos o posts borrados.
          {lastCheck && <> Última comprobación: {fmtDate(lastCheck)}.</>}
        </span>
        <button className="primary" onClick={checkAll} disabled={!!progress || !links.length}>
          {progress ? `Comprobando… ${progress.done} de ${progress.total}` : `Comprobar ${plural(links.length, 'link', 'links')}`}
        </button>
      </div>
      {!broken.length ? <div className="empty">No hay links rotos.</div> : broken.map((b) => (
        <div key={b.id} className="card">
          <button className="cite" style={{ borderTop: 0, paddingTop: 0 }} onClick={() => onOpen(b.id)}>
            <SourceIcon b={b} />
            <span style={{ minWidth: 0 }}>
              <span className="ttl">{b.title}</span>
              <span className="mono" style={{ display: 'block' }}>{b.url}</span>
            </span>
          </button>
          <div className="row">
            {b.content_fetched_at && <span className="mono">Tienes la copia del contenido: ábrelo para leerla.</span>}
            <a className="ghost" href={`https://web.archive.org/web/*/${b.url}`} target="_blank" rel="noopener noreferrer">Buscar en archive.org</a>
            <button className="ghost" onClick={() => notBroken(b)}>No está roto</button>
          </div>
        </div>
      ))}
    </div>
  );
}

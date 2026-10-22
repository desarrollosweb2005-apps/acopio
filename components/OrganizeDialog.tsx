'use client';

import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Bookmark, Collection } from '@/lib/types';
import { plural } from '@/lib/format';

interface Planned { key: string; name: string; icon: string; parent: string | null }
interface PlanItem { id: string; collection: string; tags: string[] }
export interface OrganizeResult { created: Collection[]; updates: { id: string; collection_id: string; tags: string[] }[] }

const CHUNK = 25;

/** Pide a la IA un plan para la Bandeja, lo muestra agrupado por colección y aplica solo lo marcado. */
export function OrganizeDialog({ items, collections, colPath, supabase, onClose, onDone }: {
  items: Bookmark[];
  collections: Collection[];
  colPath: (id: string | null) => string;
  supabase: SupabaseClient;
  onClose: () => void;
  onDone: (r: OrganizeResult) => void;
}) {
  const [planned, setPlanned] = useState<Planned[]>([]);
  const [plan, setPlan] = useState<PlanItem[]>([]);
  const [done, setDone] = useState(0);
  const [phase, setPhase] = useState<'thinking' | 'review' | 'applying'>('thinking');
  const [error, setError] = useState('');
  const [off, setOff] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let acc: Planned[] = [];
      const all: PlanItem[] = [];
      for (let i = 0; i < items.length; i += CHUNK) {
        const ids = items.slice(i, i + CHUNK).map((b) => b.id);
        const res = await fetch('/api/ai/organize', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids, planned: acc }) });
        const data = await res.json().catch(() => ({ error: 'Respuesta no válida' }));
        if (cancelled) return;
        if (!res.ok) { setError(data.error ?? 'La IA no respondió'); break; }
        acc = [...acc, ...data.new_collections];
        all.push(...data.items);
        setPlanned(acc);
        setPlan([...all]);
        setDone(Math.min(items.length, i + CHUNK));
      }
      if (!cancelled) setPhase('review');
    })();
    return () => { cancelled = true; };
  }, [items]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && phase !== 'applying' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, phase]);

  const byId = useMemo(() => new Map(items.map((b) => [b.id, b])), [items]);
  const plannedByKey = useMemo(() => new Map(planned.map((p) => [p.key, p])), [planned]);
  const groups = useMemo(() => {
    const m = new Map<string, PlanItem[]>();
    plan.forEach((p) => m.set(p.collection, [...(m.get(p.collection) ?? []), p]));
    return [...m].sort((a, b) => b[1].length - a[1].length);
  }, [plan]);
  const label = (ref: string) => {
    const p = plannedByKey.get(ref);
    if (!p) return colPath(ref);
    const parent = p.parent ? plannedByKey.get(p.parent)?.name ?? colPath(p.parent) : null;
    return `${p.icon} ${parent ? `${parent} › ` : ''}${p.name}`;
  };
  const selected = plan.filter((p) => !off.has(p.id));

  async function apply() {
    setPhase('applying');
    setError('');
    // 1. Colecciones nuevas que se usan, primero las principales y luego las hijas
    const usedRefs = new Set(selected.map((p) => p.collection));
    planned.forEach((p) => usedRefs.has(p.key) && p.parent && usedRefs.add(p.parent));
    const toCreate = planned.filter((p) => usedRefs.has(p.key)).sort((a, b) => Number(!!a.parent && plannedByKey.has(a.parent)) - Number(!!b.parent && plannedByKey.has(b.parent)));
    const idFor = new Map<string, string>(collections.map((c) => [c.id, c.id]));
    const created: Collection[] = [];
    for (const p of toCreate) {
      const parent_id = p.parent ? idFor.get(p.parent) ?? null : null;
      const { data, error } = await supabase.from('collections')
        .insert({ name: p.name, icon: p.icon, parent_id, position: collections.length + created.length })
        .select('id,parent_id,name,icon,position').single();
      if (error) { setError(`No se pudo crear «${p.name}»: ${error.message}`); setPhase('review'); return; }
      created.push(data as Collection);
      idFor.set(p.key, (data as Collection).id);
    }
    // 2. Mover cada marcador y sumar las etiquetas propuestas a las que ya tenía
    const updates = selected.flatMap((p) => {
      const b = byId.get(p.id);
      const collection_id = idFor.get(p.collection);
      return b && collection_id ? [{ id: p.id, collection_id, tags: [...new Set([...b.tags, ...p.tags])] }] : [];
    });
    for (let i = 0; i < updates.length; i += 8) {
      await Promise.all(updates.slice(i, i + 8).map((u) => supabase.from('bookmarks').update({ collection_id: u.collection_id, tags: u.tags }).eq('id', u.id)));
    }
    onDone({ created, updates });
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && phase !== 'applying' && onClose()}>
      <div className="modal" style={{ width: 'min(720px, 100%)' }}>
        <h2>Organizar la Bandeja con IA</h2>
        {phase === 'thinking' && <p>Analizando {done} de {items.length} marcadores…</p>}
        {phase !== 'thinking' && groups.length > 0 && (
          <>
            <p className="mono">
              Revisa la propuesta: desmarca lo que no quieras mover. Las colecciones marcadas como «nueva» se crean al aplicar.
            </p>
            <div className="plan">
              {groups.map(([ref, its]) => (
                <section key={ref} className="plan-col">
                  <h3>{label(ref)} {plannedByKey.has(ref) && <span className="new">nueva</span>} <span className="mono">{its.length}</span></h3>
                  {its.map((p) => {
                    const b = byId.get(p.id);
                    if (!b) return null;
                    return (
                      <label key={p.id} className="plan-item">
                        <input type="checkbox" checked={!off.has(p.id)} onChange={(e) => {
                          const next = new Set(off);
                          if (e.target.checked) next.delete(p.id); else next.add(p.id);
                          setOff(next);
                        }} />
                        <span>
                          {b.title}
                          <span className="tags" style={{ display: 'flex' }}>{p.tags.filter((t) => !b.tags.includes(t)).map((t) => <span key={t} className="tag">+#{t}</span>)}</span>
                        </span>
                      </label>
                    );
                  })}
                </section>
              ))}
            </div>
          </>
        )}
        {phase === 'review' && !groups.length && !error && <p>La IA no propuso cambios.</p>}
        {error && <div className="error">{error}</div>}
        <div className="modal-actions">
          <button className="ghost" onClick={onClose} disabled={phase === 'applying'}>Cancelar</button>
          {phase !== 'thinking' && groups.length > 0 && (
            <button className="primary" onClick={apply} disabled={phase === 'applying' || !selected.length}>
              {phase === 'applying' ? 'Aplicando…' : `Aplicar a ${plural(selected.length, 'marcador', 'marcadores')}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

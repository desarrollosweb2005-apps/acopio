'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Collection, Snapshot } from '@/lib/types';
import { plural } from '@/lib/format';
import { domainOf } from '@/lib/url';
import { readXlsx } from '@/lib/xlsx';
import { parseVideoSheet, topicTag, type ExcelParse } from '@/lib/excel-videos';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export function ExcelImporter() {
  const supabase = useMemo(() => createClient(), []);
  const [parsed, setParsed] = useState<(ExcelParse & { inAcopio: number; fresh: ExcelParse['items'] }) | null>(null);
  const now = new Date();
  const [startYear, setStartYear] = useState(now.getFullYear());
  const [startMonth, setStartMonth] = useState(0);
  const [off, setOff] = useState<Set<number>>(new Set());
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  const monthOf = (i: number) => new Date(startYear, startMonth + i, 1);
  const isFuture = (i: number) => monthOf(i) > now;

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(''); setResult(''); setParsed(null);
    try {
      const p = parseVideoSheet(readXlsx(await file.arrayBuffer()));
      if (!p.items.length) throw new Error('No encontré vídeos: los links tienen que estar en los comentarios de celdas con número mayor que 0.');
      const { data: existing } = await supabase.from('bookmarks').select('url_norm');
      const have = new Set((existing ?? []).map((e) => e.url_norm));
      const fresh = p.items.filter((it) => !have.has(it.urlNorm));
      setParsed({ ...p, fresh, inAcopio: p.items.length - fresh.length });
      setOff(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el Excel');
    }
  }

  const selected = parsed?.fresh.filter((it) => !off.has(it.month) && !isFuture(it.month)) ?? [];
  const categories = [...new Set(selected.map((it) => it.category).filter(Boolean))];

  async function run() {
    if (!parsed) return;
    setError('');
    setProgress('Creando colecciones…');
    const { data: cols } = await supabase.from('collections').select('id,parent_id,name,icon,position');
    const collections = (cols ?? []) as Collection[];
    const colId = new Map<string, string>();
    try {
      for (const name of categories) {
        const hit = collections.find((c) => !c.parent_id && c.name.toLowerCase() === name.toLowerCase());
        if (hit) { colId.set(name, hit.id); continue; }
        const { data, error } = await supabase.from('collections')
          .insert({ name: name.slice(0, 80), parent_id: null, icon: '🎬', position: collections.length + colId.size })
          .select('id').single();
        if (error) throw error;
        colId.set(name, data.id);
      }
    } catch (e) {
      setError(`No se pudieron crear las colecciones: ${(e as Error).message}`);
      setProgress('');
      return;
    }

    let done = 0;
    for (let i = 0; i < selected.length; i += 100) {
      const rows = selected.slice(i, i + 100).map((it) => {
        const m = monthOf(it.month);
        // Día 1 del mes; los segundos conservan el orden de la planilla
        const created = new Date(m.getFullYear(), m.getMonth(), 1, 12, 0, it.order);
        const tag = topicTag(it.topic);
        return {
          kind: 'link', status: 'seen', url: it.url, url_norm: it.urlNorm, domain: domainOf(it.url),
          source: it.kind === 'web' ? 'web' : 'video',
          title: it.title || it.author || it.url,
          note: '', excerpt: it.author && it.title ? `Canal: ${it.author}` : '',
          tags: [...new Set(['excel', it.kind === 'channel' ? 'canal' : 'video', ...(tag ? [tag] : [])])],
          collection_id: colId.get(it.category) ?? null,
          created_at: created.toISOString(),
          meta: { imported_from: 'excel', author: it.author || undefined, excel: { cell: it.cell, order: it.order, topic: it.topic } },
        };
      });
      const { error } = await supabase.from('bookmarks').insert(rows);
      if (error) {
        setError(`Se detuvo después de ${done} vídeos: ${error.message}`);
        setProgress('');
        return;
      }
      done += rows.length;
      setProgress(`Importando… ${done} de ${selected.length}`);
    }
    setProgress('');
    setParsed(null);
    setResult(`Importados ${plural(done, 'vídeo', 'vídeos')} en ${plural(colId.size, 'colección', 'colecciones')}.`);
  }

  return (
    <>
      <section className="card">
        <label className="field"><span>Archivo Excel (.xlsx)</span>
          <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => onFile(e.target.files?.[0])} disabled={!!progress} />
        </label>
        {parsed && !progress && (
          <>
            <div className="stat-row">
              <span><b>{selected.length}</b>para importar</span>
              <span><b>{categories.length}</b>colecciones</span>
              {parsed.inAcopio > 0 && <span><b>{parsed.inAcopio}</b>ya en Acopio</span>}
              {parsed.repeated > 0 && <span><b>{parsed.repeated}</b>repetidos en la planilla</span>}
              {parsed.zeroCells > 0 && <span><b>{parsed.zeroCells}</b>en celdas con 0 (no se importan)</span>}
            </div>
            <div className="row">
              <label className="field"><span>La columna {parsed.columns[0].letter} es</span>
                <select value={startMonth} onChange={(e) => setStartMonth(Number(e.target.value))}>
                  {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
                </select>
              </label>
              <label className="field"><span>Año</span>
                <input type="number" value={startYear} onChange={(e) => setStartYear(Number(e.target.value) || now.getFullYear())} style={{ width: 100 }} />
              </label>
            </div>
            <table className="xl-cols">
              <thead><tr><th /><th>Columna</th><th>Mes</th><th>Vídeos</th><th>Primer vídeo</th></tr></thead>
              <tbody>
                {parsed.columns.map((c, i) => {
                  const future = isFuture(i);
                  const n = parsed.fresh.filter((it) => it.month === i).length;
                  return (
                    <tr key={c.letter} className={future || off.has(i) ? 'off' : ''}>
                      <td><input type="checkbox" aria-label={`Importar columna ${c.letter}`} disabled={future} checked={!future && !off.has(i)}
                        onChange={() => setOff((s) => { const x = new Set(s); if (x.has(i)) x.delete(i); else x.add(i); return x; })} /></td>
                      <td>{c.letter}</td>
                      <td>{MONTHS[monthOf(i).getMonth()]} {monthOf(i).getFullYear()}{future && <b className="bad-txt"> · futuro</b>}</td>
                      <td>{n}</td>
                      <td className="xl-sample">{c.sample}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {parsed.columns.some((_, i) => isFuture(i)) && (
              <div className="warn">Hay columnas que caerían en meses que aún no llegan; no se importan. Revisa a qué mes corresponde la columna {parsed.columns[0].letter}.</div>
            )}
            <p className="mono">Cada vídeo queda «Visto», con fecha del día 1 de su mes y en el orden de la planilla. La fila celeste pasa a ser la colección y el subtema una etiqueta, más #excel y #video (o #canal).</p>
            <p className="mono">Colecciones: {categories.join(' · ')}</p>
            <button className="primary" style={{ alignSelf: 'flex-start' }} onClick={run} disabled={!selected.length}>
              Importar {plural(selected.length, 'vídeo', 'vídeos')}
            </button>
          </>
        )}
        {progress && <p>{progress}</p>}
        {error && <div className="error">{error}</div>}
        {result && <p><b>{result}</b> Ahora completa las miniaturas y duraciones aquí abajo.</p>}
      </section>
      <FillImported key={result} />
    </>
  );
}

interface Pending { id: string; url: string; title: string; meta: Record<string, unknown> }

/** Lee de YouTube título, miniatura, duración y descripción de los vídeos importados del Excel. Se puede retomar. */
function FillImported() {
  const supabase = useMemo(() => createClient(), []);
  const [pending, setPending] = useState<Pending[] | null>(null);
  const [done, setDone] = useState(0);
  const [running, setRunning] = useState(false);

  const load = useCallback(() => {
    supabase.from('bookmarks').select('id,url,title,meta').eq('meta->>imported_from', 'excel').is('meta->>filled', null).not('url', 'is', null)
      .then(({ data }) => setPending((data ?? []) as Pending[]));
  }, [supabase]);
  useEffect(load, [load]);

  async function fill(b: Pending) {
    const s = (await fetch('/api/snapshot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: b.url }) })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null)) as Snapshot | null;
    const ok = s && !s.error;
    await supabase.from('bookmarks').update({
      meta: { ...b.meta, ...(ok ? s.meta : {}), filled: true },
      ...(ok ? {
        title: s.title || b.title, cover_url: s.cover_url, duration_seconds: s.duration_seconds, excerpt: s.excerpt,
        ...(s.content ? { content: s.content, content_fetched_at: new Date().toISOString() } : {}),
      } : {}),
    }).eq('id', b.id);
    setDone((d) => d + 1);
  }

  async function run() {
    if (!pending) return;
    setRunning(true);
    setDone(0);
    const queue = [...pending];
    await Promise.all(Array.from({ length: 4 }, async () => { for (let b = queue.shift(); b; b = queue.shift()) await fill(b); }));
    setRunning(false);
    load();
  }

  if (!pending?.length && !running) return null;
  return (
    <section className="card">
      <h2>Completar datos de YouTube</h2>
      <p>{plural(pending?.length ?? 0, 'vídeo importado del Excel no tiene', 'vídeos importados del Excel no tienen')} todavía miniatura ni duración. Se leen de YouTube de a cuatro; si cierras la página, puedes seguir después.</p>
      {running && <p>Leyendo… {done} de {pending?.length}</p>}
      <button className="primary" style={{ alignSelf: 'flex-start' }} onClick={run} disabled={running}>
        {running ? 'Completando…' : `Completar ${plural(pending?.length ?? 0, 'vídeo', 'vídeos')}`}
      </button>
    </section>
  );
}

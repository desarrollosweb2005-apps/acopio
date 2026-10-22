'use client';

import { useMemo, useState } from 'react';
import Papa from 'papaparse';
import { createClient } from '@/lib/supabase/client';
import { STATUS_LABEL, type Collection, type Status } from '@/lib/types';
import { plural } from '@/lib/format';
import { normalizeUrl } from '@/lib/url';
import { rowToBookmark, splitHighlights, splitTags, type RaindropRow } from '@/lib/raindrop';

type Row = RaindropRow;
interface Parsed { rows: Row[]; folders: string[]; dupes: number; tags: number }

const UNSORTED = /^(unsorted|sin clasificar|sin ordenar)$/i;

export function Importer() {
  const supabase = useMemo(() => createClient(), []);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [status, setStatus] = useState<Status>('pending');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(''); setResult(''); setParsed(null);
    const text = await file.text();
    const { data, errors } = Papa.parse<Row>(text, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase() });
    if (!data.length || !('url' in data[0])) {
      setError(errors[0]?.message ?? 'El archivo no parece un export CSV de Raindrop (falta la columna url).');
      return;
    }
    const { data: existing } = await supabase.from('bookmarks').select('url_norm');
    const have = new Set((existing ?? []).map((e) => e.url_norm));
    const seen = new Set<string>();
    const rows = data.filter((r) => {
      if (!r.url?.trim()) return false;
      const n = normalizeUrl(r.url);
      if (have.has(n) || seen.has(n)) return false;
      seen.add(n);
      return true;
    });
    const folders = [...new Set(rows.map((r) => r.folder?.trim() ?? '').filter((f) => f && !UNSORTED.test(f)))].sort();
    const tags = new Set(rows.flatMap((r) => splitTags(r.tags)));
    setParsed({ rows, folders, dupes: data.length - rows.length, tags: tags.size });
  }

  async function run() {
    if (!parsed) return;
    setError('');
    setProgress({ done: 0, total: parsed.rows.length });

    // 1. Colecciones: "Padre / Hija" → padre + hija (un nivel de anidado)
    const { data: cols } = await supabase.from('collections').select('id,parent_id,name,icon,position');
    const collections = (cols ?? []) as Collection[];
    const find = (name: string, parent: string | null) =>
      collections.find((c) => c.name.toLowerCase() === name.toLowerCase() && (c.parent_id ?? null) === parent);
    async function ensure(name: string, parent: string | null) {
      const hit = find(name, parent);
      if (hit) return hit.id;
      const { data, error } = await supabase.from('collections')
        .insert({ name: name.slice(0, 80), parent_id: parent, icon: '📁', position: collections.length })
        .select('id,parent_id,name,icon,position').single();
      if (error) throw error;
      collections.push(data as Collection);
      return (data as Collection).id;
    }
    const folderId = new Map<string, string>();
    try {
      for (const f of parsed.folders) {
        const [parentName, ...rest] = f.split('/').map((s) => s.trim()).filter(Boolean);
        const pid = await ensure(parentName, null);
        folderId.set(f, rest.length ? await ensure(rest.join(' / '), pid) : pid);
      }
    } catch (e) {
      setError(`No se pudieron crear las colecciones: ${(e as Error).message}`);
      setProgress(null);
      return;
    }

    // 2. Marcadores en lotes de 100, y sus highlights
    let done = 0, highlights = 0;
    for (let i = 0; i < parsed.rows.length; i += 100) {
      const batch = parsed.rows.slice(i, i + 100);
      const payload = batch.map((r) =>
        rowToBookmark(r, { status, collection_id: r.folder ? folderId.get(r.folder.trim()) ?? null : null }),
      );
      const { data, error } = await supabase.from('bookmarks').insert(payload).select('id');
      if (error) {
        setError(`Se detuvo después de ${done} marcadores: ${error.message}`);
        setProgress(null);
        return;
      }
      const hls = (data ?? []).flatMap((d, k) => splitHighlights(batch[k].highlights).map((h) => ({ ...h, bookmark_id: d.id })));
      if (hls.length) {
        await supabase.from('highlights').insert(hls);
        highlights += hls.length;
      }
      done += batch.length;
      setProgress({ done, total: parsed.rows.length });
    }
    setProgress(null);
    setParsed(null);
    setResult(`Importados ${plural(done, 'marcador', 'marcadores')}, ${plural(folderId.size, 'colección', 'colecciones')} y ${plural(highlights, 'highlight', 'highlights')}.`);
  }

  return (
    <section className="card">
      <label className="field"><span>Archivo CSV</span>
        <input id="csv" type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} disabled={!!progress} />
      </label>
      {parsed && !progress && (
        <>
          <div className="stat-row">
            <span><b>{parsed.rows.length}</b>marcadores nuevos</span>
            <span><b>{parsed.folders.length}</b>colecciones</span>
            <span><b>{parsed.tags}</b>etiquetas</span>
            {parsed.dupes > 0 && <span><b>{parsed.dupes}</b>repetidos o ya en Acopio</span>}
          </div>
          {parsed.folders.length > 0 && <p className="mono">Colecciones: {parsed.folders.join(' · ')}</p>}
          <label className="field"><span>Estado para los importados</span>
            <select id="imp-status" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
              {(['pending', 'seen', 'applied'] as Status[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </label>
          <p className="mono">La copia del contenido de cada link no se descarga ahora: puedes pedirla desde la ficha de cada marcador.</p>
          <button className="primary" style={{ alignSelf: 'flex-start' }} onClick={run} disabled={!parsed.rows.length}>
            Importar {plural(parsed.rows.length, 'marcador', 'marcadores')}
          </button>
        </>
      )}
      {progress && <p>Importando… {progress.done} de {progress.total}</p>}
      {error && <div className="error">{error}</div>}
      {result && (
        <>
          <p><b>{result}</b></p>
          <a className="primary" href="/" style={{ alignSelf: 'flex-start' }}>Ir a la biblioteca</a>
        </>
      )}
    </section>
  );
}

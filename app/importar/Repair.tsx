'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cleanTitle, isGenericCover } from '@/lib/raindrop';
import { plural } from '@/lib/format';

interface Fix { id: string; before: string; title: string; clearCover: boolean }

/** Limpia títulos y portadas de marcadores importados antes de que el importador los limpiara. */
export function RepairImported() {
  const supabase = useMemo(() => createClient(), []);
  const [fixes, setFixes] = useState<Fix[] | null>(null);
  const [state, setState] = useState<'idle' | 'working' | 'done'>('idle');

  useEffect(() => {
    supabase.from('bookmarks').select('id,title,note,excerpt,url,cover_url').eq('meta->>imported_from', 'raindrop')
      .then(({ data }) => {
        setFixes((data ?? []).map((b) => {
          const title = cleanTitle({ title: b.title, note: b.note, excerpt: b.excerpt }, b.url ?? '');
          return { id: b.id, before: b.title, title, clearCover: isGenericCover(b.cover_url) };
        }).filter((f) => f.title !== f.before || f.clearCover));
      });
  }, [supabase]);

  async function run() {
    if (!fixes) return;
    setState('working');
    for (const f of fixes) {
      await supabase.from('bookmarks').update({ title: f.title, ...(f.clearCover ? { cover_url: null } : {}) }).eq('id', f.id);
    }
    setState('done');
  }

  if (!fixes?.length) return null;
  if (state === 'done') {
    return (
      <section className="card">
        <p><b>Listo: {plural(fixes.length, 'marcador limpiado', 'marcadores limpiados')}.</b></p>
        <a className="primary" href="/" style={{ alignSelf: 'flex-start' }}>Ir a la biblioteca</a>
      </section>
    );
  }
  return (
    <section className="card">
      <h2>Limpiar lo ya importado</h2>
      <p>{plural(fixes.length, 'marcador importado tiene', 'marcadores importados tienen')} el título como venía de Raindrop («(2) X», «/ X», símbolos raros) o la portada genérica de X. Así quedarían:</p>
      <ul className="mono" style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {fixes.slice(0, 6).map((f) => <li key={f.id}>{f.title}</li>)}
        {fixes.length > 6 && <li>…y {fixes.length - 6} más</li>}
      </ul>
      <button className="primary" style={{ alignSelf: 'flex-start' }} onClick={run} disabled={state === 'working'}>
        {state === 'working' ? 'Limpiando…' : `Limpiar ${plural(fixes.length, 'marcador', 'marcadores')}`}
      </button>
    </section>
  );
}

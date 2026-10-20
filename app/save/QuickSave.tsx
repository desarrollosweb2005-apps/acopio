'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { STATUS_LABEL, type Collection, type Snapshot, type Status } from '@/lib/types';
import { cleanTag, fmtDate } from '@/lib/format';
import { snapshotToRow } from '@/lib/rows';
import { domainOf, normalizeUrl, sourceOf } from '@/lib/url';
import { CollectionOptions } from '@/components/CollectionOptions';

interface Existing { id: string; title: string; created_at: string; collection_id: string | null }

export function QuickSave({ url, titleHint, sharedText, collections, existing }: {
  url: string | null; titleHint: string; sharedText: string; collections: Collection[]; existing: Existing | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [title, setTitle] = useState(titleHint);
  const [collectionId, setCollectionId] = useState('');
  const [tags, setTags] = useState('');
  const [note, setNote] = useState(sharedText);
  const [status, setStatus] = useState<Status>('pending');
  const [state, setState] = useState<'reading' | 'ready' | 'saving' | 'saved' | 'error'>('reading');
  const [error, setError] = useState('');

  const byId = new Map(collections.map((c) => [c.id, c]));
  const colPath = (id: string | null) => {
    const c = id ? byId.get(id) : undefined;
    if (!c) return 'Bandeja';
    const p = c.parent_id ? byId.get(c.parent_id) : undefined;
    return p ? `${p.name} › ${c.name}` : c.name;
  };

  useEffect(() => {
    if (!url) return;
    fetch('/api/snapshot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }) })
      .then((r) => r.json())
      .then((s: Snapshot) => { setSnap(s); if (s.title) setTitle((t) => t || s.title); setState('ready'); })
      .catch(() => { setState('ready'); });
  }, [url]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!url) return;
    setState('saving');
    const s: Snapshot = snap ?? { url, url_norm: normalizeUrl(url), domain: domainOf(url), source: sourceOf(url), title, excerpt: '', cover_url: null, content: null, duration_seconds: null, meta: {} };
    const row = snapshotToRow(s, { title, collection_id: collectionId || null, tags: tags.split(/[,\s]+/).map(cleanTag).filter(Boolean), status, note });
    const { error } = await supabase.from('bookmarks').insert(row);
    if (error) { setError(error.message); setState('error'); return; }
    setState('saved');
    // Abierto como ventanita desde el bookmarklet: se cierra sola
    if (window.opener) window.setTimeout(() => window.close(), 900);
  }

  if (!url) {
    return (
      <div className="card">
        <h1>No llegó ningún link</h1>
        <p>Abre esta página desde el botón «+ Acopio» de tu navegador o desde el menú Compartir del móvil.</p>
        <a className="primary" href="/" style={{ alignSelf: 'flex-start' }}>Ir a la biblioteca</a>
      </div>
    );
  }

  if (state === 'saved') {
    return (
      <div className="card">
        <h1>Guardado ✓</h1>
        <p>{title || url} está en {colPath(collectionId || null)}.</p>
        <div className="row">
          <a className="primary" href="/">Ir a la biblioteca</a>
          {!window.opener && <button className="ghost" onClick={() => history.length > 1 ? history.back() : window.close()}>Volver</button>}
        </div>
      </div>
    );
  }

  return (
    <form className="card" onSubmit={save}>
      <h1>Guardar en Acopio</h1>
      <p className="mono">{url}</p>
      {existing && (
        <div className="warn">Ya lo guardaste el {fmtDate(existing.created_at)} en {colPath(existing.collection_id)}.
          <a className="ghost" href="/">Abrir la biblioteca</a>
        </div>
      )}
      <label className="field"><span>Título</span>
        <input id="qs-title" value={title} placeholder={state === 'reading' ? 'Leyendo la página…' : ''} onChange={(e) => setTitle(e.target.value)} />
      </label>
      {snap?.excerpt && <p className="note">{snap.excerpt}</p>}
      <div className="form-grid">
        <label className="field"><span>Colección</span>
          <select id="qs-col" value={collectionId} onChange={(e) => setCollectionId(e.target.value)}>
            <CollectionOptions collections={collections} colPath={colPath} />
          </select>
        </label>
        <label className="field"><span>Estado</span>
          <select id="qs-status" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
            {(['pending', 'seen', 'applied'] as Status[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </label>
        <label className="field full"><span>Etiquetas</span>
          <input id="qs-tags" placeholder="claude, reels…" value={tags} onChange={(e) => setTags(e.target.value)} />
        </label>
        <label className="field full"><span>Nota</span>
          <textarea id="qs-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Por qué lo guardas" />
        </label>
      </div>
      {state === 'error' && <div className="error">No se pudo guardar: {error}</div>}
      <div className="modal-actions">
        <button className="primary" type="submit" disabled={state === 'saving'}>
          {state === 'saving' ? 'Guardando…' : state === 'reading' ? 'Guardar (aún leyendo la página)' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}

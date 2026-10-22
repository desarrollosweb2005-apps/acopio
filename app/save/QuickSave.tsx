'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { STATUS_LABEL, type Collection, type Snapshot, type Status } from '@/lib/types';
import { fmtDate } from '@/lib/format';
import { snapshotToRow } from '@/lib/rows';
import { domainOf, normalizeUrl, sourceOf } from '@/lib/url';
import { CollectionOptions } from '@/components/CollectionOptions';
import { TagInput } from '@/components/TagInput';
import type { HlColor } from '@/lib/types';

interface Existing { id: string; title: string; created_at: string; collection_id: string | null }

export function QuickSave({ url, titleHint, sharedText, highlight, popup, aiEnabled, collections, allTags, existing }: {
  url: string | null; titleHint: string; sharedText: string; highlight: string; popup: boolean; aiEnabled: boolean;
  collections: Collection[]; allTags: [string, number][]; existing: Existing | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [title, setTitle] = useState(titleHint);
  const [collectionId, setCollectionId] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [note, setNote] = useState(sharedText);
  const [status, setStatus] = useState<Status>('pending');
  const [hlText, setHlText] = useState(highlight);
  const [hlColor, setHlColor] = useState<HlColor>('y');
  const [aiSug, setAiSug] = useState<{ collection_id: string | null; tags: string[] } | null>(null);
  const [state, setState] = useState<'reading' | 'ready' | 'saving' | 'saved' | 'error'>(existing && highlight ? 'ready' : 'reading');
  const [savedMsg, setSavedMsg] = useState('');
  const [error, setError] = useState('');
  // Con texto seleccionado y el link ya guardado, solo se añade el highlight a ese marcador
  const onlyHighlight = !!existing && !!highlight;

  const byId = new Map(collections.map((c) => [c.id, c]));
  const colPath = (id: string | null) => {
    const c = id ? byId.get(id) : undefined;
    if (!c) return 'Bandeja';
    const p = c.parent_id ? byId.get(c.parent_id) : undefined;
    return p ? `${p.name} › ${c.name}` : c.name;
  };

  useEffect(() => {
    if (!url || onlyHighlight) return;
    fetch('/api/snapshot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }) })
      .then((r) => r.json())
      .then((s: Snapshot) => {
        setSnap(s);
        if (s.title) setTitle((t) => (t && !/^https?:\/\//.test(t) ? t : s.title));
        setState('ready');
        if (aiEnabled) {
          fetch('/api/ai/suggest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: s.title, excerpt: s.excerpt, domain: s.domain, url: s.url }) })
            .then((r) => (r.ok ? r.json() : null))
            .then((sug) => sug && (sug.collection_id || sug.tags?.length) && setAiSug(sug))
            .catch(() => {});
        }
      })
      .catch(() => { setState('ready'); });
  }, [url, onlyHighlight, aiEnabled]);

  // Esc cierra la ventanita (la extensión la cierra al ver la marca en la dirección)
  useEffect(() => {
    if (!popup) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') location.hash = 'acopio-cancel'; };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [popup]);

  function finish(msg: string) {
    setSavedMsg(msg);
    setState('saved');
    // Ventanita del bookmarklet o de la extensión: se cierra sola
    if (popup) window.setTimeout(() => { location.hash = 'acopio-saved'; }, 500);
    else if (window.opener) window.setTimeout(() => window.close(), 900);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!url) return;
    setState('saving');
    let bookmarkId = existing?.id ?? null;
    if (!onlyHighlight) {
      const s: Snapshot = snap ?? { url, url_norm: normalizeUrl(url), domain: domainOf(url), source: sourceOf(url), title, excerpt: '', cover_url: null, content: null, duration_seconds: null, meta: {} };
      const row = snapshotToRow(s, { title, collection_id: collectionId || null, tags, status, note });
      const { data, error } = await supabase.from('bookmarks').insert(row).select('id').single();
      if (error) { setError(error.message); setState('error'); return; }
      bookmarkId = data.id;
    }
    if (hlText.trim() && bookmarkId) {
      const { error } = await supabase.from('highlights').insert({ bookmark_id: bookmarkId, text: hlText.trim(), color: hlColor, note: onlyHighlight ? note.trim() : '' });
      if (error) { setError(error.message); setState('error'); return; }
    }
    finish(onlyHighlight
      ? `Highlight añadido a «${existing!.title}».`
      : `${title || url} está en ${colPath(collectionId || null)}${hlText.trim() ? ', con el texto seleccionado como highlight' : ''}.`);
  }

  if (!url) {
    return (
      <div className="card">
        <h1>No llegó ningún link</h1>
        <p>Abre esta página desde la extensión, el botón «+ Acopio» de tu navegador o el menú Compartir del móvil.</p>
        <a className="primary" href="/" style={{ alignSelf: 'flex-start' }}>Ir a la biblioteca</a>
      </div>
    );
  }

  if (state === 'saved') {
    return (
      <div className="card">
        <h1>Guardado ✓</h1>
        <p>{savedMsg}</p>
        {!popup && (
          <div className="row">
            <a className="primary" href="/">Ir a la biblioteca</a>
            <button className="ghost" onClick={() => (history.length > 1 ? history.back() : window.close())}>Volver</button>
          </div>
        )}
      </div>
    );
  }

  const highlightBox = hlText && (
    <div className="field">
      <span>Texto seleccionado (se guarda como highlight)</span>
      <textarea id="qs-hl" rows={3} value={hlText} onChange={(e) => setHlText(e.target.value)} />
      <span className="sw" role="radiogroup" aria-label="Color">
        {(['y', 'g', 'b', 'p'] as HlColor[]).map((k) => (
          <span key={k}>
            <input type="radio" name="qs-hlc" id={`qs-hlc-${k}`} checked={hlColor === k} onChange={() => setHlColor(k)} />
            <label htmlFor={`qs-hlc-${k}`} style={{ background: `var(--hl-${k})` }}><span hidden>{k}</span></label>
          </span>
        ))}
      </span>
    </div>
  );

  if (onlyHighlight) {
    return (
      <form className="card" onSubmit={save}>
        <h1>Guardar highlight</h1>
        <p>Esta página ya está en Acopio: <b>{existing!.title}</b> ({colPath(existing!.collection_id)}). El texto se añade a ese marcador.</p>
        {highlightBox}
        <label className="field"><span>Nota (opcional)</span>
          <input id="qs-hlnote" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        {state === 'error' && <div className="error">No se pudo guardar: {error}</div>}
        <div className="modal-actions">
          <button className="primary" type="submit" disabled={state === 'saving'}>{state === 'saving' ? 'Guardando…' : 'Guardar highlight'}</button>
        </div>
      </form>
    );
  }

  return (
    <form className="card" onSubmit={save}>
      <h1>Guardar en Acopio</h1>
      <p className="mono">{url}</p>
      {existing && (
        <div className="warn">Ya lo guardaste el {fmtDate(existing.created_at)} en {colPath(existing.collection_id)}.
          <a className="ghost" href="/" target={popup ? '_blank' : undefined}>Abrir la biblioteca</a>
        </div>
      )}
      <label className="field"><span>Título</span>
        <input id="qs-title" value={title} placeholder={state === 'reading' ? 'Leyendo la página…' : ''} onChange={(e) => setTitle(e.target.value)} />
      </label>
      {snap?.excerpt && <p className="note">{snap.excerpt}</p>}
      {highlightBox}
      {aiSug && (
        <div className="sug">
          <span className="lbl">IA sugiere</span>
          {aiSug.collection_id && <span>{colPath(aiSug.collection_id)}</span>}
          <span className="tags">{aiSug.tags.map((t) => <span key={t} className="tag">#{t}</span>)}</span>
          <button type="button" className="primary" onClick={() => {
            if (aiSug.collection_id) setCollectionId(aiSug.collection_id);
            setTags((cur) => [...new Set([...cur, ...aiSug.tags])]);
            setAiSug(null);
          }}>Aplicar</button>
        </div>
      )}
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
        <div className="field full"><span>Etiquetas</span>
          <TagInput id="qs-tags" value={tags} onChange={setTags} allTags={allTags} />
        </div>
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

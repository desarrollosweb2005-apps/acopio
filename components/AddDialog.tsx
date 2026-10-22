'use client';

import { useEffect, useRef, useState } from 'react';
import type { Bookmark, Collection, Snapshot, Status } from '@/lib/types';
import { STATUS_LABEL } from '@/lib/types';
import { fmtDate } from '@/lib/format';
import { normalizeUrl } from '@/lib/url';
import { snapshotToRow } from '@/lib/rows';
import { CollectionOptions } from './CollectionOptions';
import { TagInput } from './TagInput';

export function AddDialog({ mode: initialMode, collections, colPath, bookmarks, allTags, defaultCollection, onClose, onOpenExisting, onInsert }: {
  mode: 'link' | 'prompt';
  allTags: [string, number][];
  collections: Collection[];
  colPath: (id: string | null) => string;
  bookmarks: Bookmark[];
  defaultCollection: string | null;
  onClose: () => void;
  onOpenExisting: (id: string) => void;
  onInsert: (row: Record<string, unknown>) => Promise<void>;
}) {
  const [mode, setMode] = useState(initialMode);
  const [url, setUrl] = useState('');
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [title, setTitle] = useState('');
  const [collectionId, setCollectionId] = useState(defaultCollection ?? '');
  const [tagList, setTagList] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>('pending');
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const firstInput = useRef<HTMLInputElement>(null);

  useEffect(() => { firstInput.current?.focus(); }, [mode]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const dupe = url.trim() ? bookmarks.find((b) => b.url_norm && b.url_norm === normalizeUrl(url)) : undefined;

  async function analyze() {
    setBusy(true);
    setError('');
    const res = await fetch('/api/snapshot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: url.trim() }) });
    const s = (await res.json()) as Snapshot & { error?: string };
    setBusy(false);
    if (!res.ok) return setError(s.error ?? 'No se pudo leer el link');
    setSnap(s);
    setTitle(s.title);
    if (s.error) setError(`No se pudo leer todo el contenido (${s.error}). Puedes guardarlo igual.`);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === 'link') {
      if (!snap || snap.url !== url.trim()) return analyze();
      setBusy(true);
      await onInsert(snapshotToRow(snap, { title, collection_id: collectionId || null, tags: tagList, status }));
      setBusy(false);
    } else {
      if (!prompt.trim()) return setError('Escribe el prompt');
      setBusy(true);
      const src = url.trim();
      await onInsert({
        kind: 'prompt', source: 'note', status: 'seen',
        title: title.trim() || prompt.trim().split('\n')[0].slice(0, 80),
        prompt_text: prompt, collection_id: collectionId || null, tags: tagList,
        url: src || null, url_norm: src ? normalizeUrl(src) : null, domain: src ? new URL(src).hostname.replace(/^www\./, '') : null,
      });
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={submit}>
        <div className="d-bar">
          <h2>{mode === 'link' ? 'Añadir link' : 'Nuevo prompt'}</h2>
          <div className="seg" role="group" aria-label="Tipo">
            <button type="button" className={mode === 'link' ? 'on' : ''} onClick={() => { setMode('link'); setError(''); }}>Link</button>
            <button type="button" className={mode === 'prompt' ? 'on' : ''} onClick={() => { setMode('prompt'); setError(''); }}>Prompt</button>
          </div>
        </div>

        {mode === 'link' ? (
          <>
            <label className="field"><span>URL</span>
              <input ref={firstInput} id="add-url" type="url" required placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)}
                onPaste={(e) => { const t = e.clipboardData.getData('text'); if (/^https?:\/\//.test(t.trim())) { e.preventDefault(); setUrl(t.trim()); } }} />
            </label>
            {dupe && (
              <div className="warn">Ya lo guardaste el {fmtDate(dupe.created_at)} en {colPath(dupe.collection_id)}.
                <button type="button" className="ghost" onClick={() => onOpenExisting(dupe.id)}>Abrir el existente</button>
              </div>
            )}
            {snap && snap.url === url.trim() && (
              <div className="preview">
                <div className="preview-head">
                  {snap.cover_url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={snap.cover_url} alt="" referrerPolicy="no-referrer" style={{ borderRadius: 8, aspectRatio: '16/10', objectFit: 'cover', width: '100%' }} />
                    : <div className={`thumb t-${snap.source}`} />}
                  <div className="body">
                    <label className="field"><span>Título</span><input id="add-title" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
                    {snap.excerpt && <p className="note">{snap.excerpt}</p>}
                    <p className="mono">{snap.content ? `Copia del contenido lista (${snap.content.length.toLocaleString('es')} caracteres)` : 'Sin texto que copiar'}</p>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <label className="field"><span>Título</span>
              <input ref={firstInput} id="add-ptitle" placeholder="Ej.: Landing → vídeo de 15 s" value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="field"><span>Prompt</span>
              <textarea id="add-prompt" className="prompt-box" required value={prompt} onChange={(e) => setPrompt(e.target.value)}
                placeholder={'Escribe o pega el prompt.\nUsa {{variable}} para las partes que cambian, por ejemplo {{marca}} o {{link_landing}}.'} />
            </label>
            <label className="field"><span>Link de origen (opcional)</span>
              <input id="add-psrc" type="url" placeholder="https://x.com/…" value={url} onChange={(e) => setUrl(e.target.value)} />
            </label>
          </>
        )}

        {(mode === 'prompt' || (snap && snap.url === url.trim())) && (
          <div className="form-grid">
            <label className="field"><span>Colección</span>
              <select id="add-col" value={collectionId} onChange={(e) => setCollectionId(e.target.value)}>
                <CollectionOptions collections={collections} colPath={colPath} />
              </select>
            </label>
            <div className="field"><span>Etiquetas</span>
              <TagInput id="add-tags" value={tagList} onChange={setTagList} allTags={allTags} />
            </div>
            {mode === 'link' && (
              <label className="field"><span>Estado</span>
                <select id="add-status" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
                  {(['pending', 'seen', 'applied'] as Status[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
              </label>
            )}
          </div>
        )}

        {error && <div className="error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose}>Cancelar</button>
          <button className="primary" type="submit" disabled={busy}>
            {busy ? 'Un momento…' : mode === 'link' && (!snap || snap.url !== url.trim()) ? 'Leer link' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  );
}

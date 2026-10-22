'use client';

import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SOURCE_LABEL, STATUS_LABEL, fileMeta, type Bookmark, type Collection, type HlColor, type Highlight, type Snapshot, type Status } from '@/lib/types';
import { fmtDate } from '@/lib/format';
import { fillPrompt, promptVariables } from '@/lib/prompt';
import { formatDuration } from '@/lib/url';
import { Thumb } from './Thumb';
import { BUCKET, fmtSize, isImage } from '@/lib/files';
import { CollectionOptions } from './CollectionOptions';
import { TagInput } from './TagInput';

const COLORS: [HlColor, string][] = [['y', 'Amarillo'], ['g', 'Verde'], ['b', 'Azul'], ['p', 'Rosa']];

export function Detail({ b, image, collections, allTags, aiEnabled, onPatched, colPath, supabase, toast, onClose, onUpdate, onDelete, onAddHighlight, onRemoveHighlight }: {
  b: Bookmark;
  collections: Collection[];
  allTags: [string, number][];
  colPath: (id: string | null) => string;
  supabase: SupabaseClient;
  toast: (m: string) => void;
  onClose: () => void;
  onUpdate: (patch: Partial<Bookmark>) => void;
  onDelete: () => void;
  onAddHighlight: (h: Pick<Highlight, 'text' | 'note' | 'color' | 'time_label'>) => void;
  onRemoveHighlight: (id: string) => void;
  aiEnabled: boolean;
  /** Enlace firmado de la imagen, en capturas e imágenes subidas */
  image?: string;
  /** Cambios ya guardados en el servidor (por la IA): solo actualizan la vista */
  onPatched: (patch: Partial<Bookmark>) => void;
}) {
  const [title, setTitle] = useState(b.title);
  const [note, setNote] = useState(b.note);
  const [confirmDel, setConfirmDel] = useState(false);
  const [hl, setHl] = useState({ text: '', note: '', color: 'y' as HlColor, time: '' });
  const [content, setContent] = useState<string | null | undefined>(undefined);
  const [loadingCopy, setLoadingCopy] = useState(false);
  const [prompt, setPrompt] = useState(b.prompt_text ?? '');
  const [vars, setVars] = useState<Record<string, string>>({});

  const isPrompt = b.kind === 'prompt';
  const isFile = b.kind === 'file';
  const file = fileMeta(b);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) return;
    supabase.storage.from(BUCKET).createSignedUrl(file.path, 60 * 60).then(({ data }) => setFileUrl(data?.signedUrl ?? null));
  }, [file?.path, supabase]); // eslint-disable-line react-hooks/exhaustive-deps
  const [aiBusy, setAiBusy] = useState<'' | 'summary' | 'prompt'>('');
  const summary = ((b.meta ?? {}) as { summary?: string[] }).summary ?? [];

  async function ai(kind: 'summary' | 'prompt') {
    setAiBusy(kind);
    const res = await fetch(`/api/ai/${kind}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: b.id }) });
    const data = await res.json().catch(() => ({ error: 'Respuesta no válida' }));
    setAiBusy('');
    if (!res.ok) return toast(data.error ?? 'La IA no respondió');
    if (kind === 'summary') {
      onPatched({ meta: data.meta });
    } else {
      onPatched(data);
      setPrompt(data.prompt_text);
      setTitle(data.title);
      toast('Convertido en prompt. Lo tienes en la sección Prompts');
    }
  }
  const variables = promptVariables(prompt);
  const meta = b.meta ?? {};

  async function showCopy() {
    setLoadingCopy(true);
    const { data } = await supabase.from('bookmarks').select('content').eq('id', b.id).single();
    setContent((data?.content as string | null) ?? null);
    setLoadingCopy(false);
  }

  async function refreshCopy() {
    if (!b.url) return;
    setLoadingCopy(true);
    const res = await fetch('/api/snapshot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: b.url }) });
    const s = (await res.json()) as Snapshot;
    setLoadingCopy(false);
    if (!res.ok || s.error || !s.content) {
      onUpdate({ is_broken: !res.ok || !!s.error });
      toast(s.error ? `No se pudo leer: ${s.error}` : 'La página no tiene texto que copiar');
      return;
    }
    const patch = {
      content: s.content, content_fetched_at: new Date().toISOString(), is_broken: false, duration_seconds: s.duration_seconds ?? b.duration_seconds,
      // Si el marcador no tenía portada, aprovecha la nueva lectura
      ...(!b.cover_url && s.cover_url ? { cover_url: s.cover_url } : {}),
    };
    const { error } = await supabase.from('bookmarks').update(patch).eq('id', b.id);
    if (error) return toast(`No se pudo guardar la copia: ${error.message}`);
    const { content: _c, ...visible } = patch;
    onUpdate(visible);
    setContent(s.content);
    toast('Copia actualizada');
  }

  async function copyPrompt() {
    const text = fillPrompt(prompt, vars);
    try {
      await navigator.clipboard.writeText(text);
      toast(variables.some((v) => !vars[v]?.trim()) ? 'Copiado (hay variables sin rellenar)' : 'Prompt copiado');
    } catch {
      toast('No se pudo copiar. Selecciona el texto y cópialo a mano');
    }
  }

  function saveHighlight(e: React.FormEvent) {
    e.preventDefault();
    if (!hl.text.trim()) return;
    onAddHighlight({ text: hl.text.trim(), note: hl.note.trim(), color: hl.color, time_label: hl.time.trim() || null });
    setHl({ text: '', note: '', color: hl.color, time: '' });
  }

  const timeLink = (label: string) => {
    if (!b.url || b.source !== 'video') return b.url ?? '#';
    const [m, s] = label.split(':').map(Number);
    const secs = (m || 0) * 60 + (s || 0);
    try { const u = new URL(b.url); u.searchParams.set('t', `${secs}s`); return u.toString(); } catch { return b.url; }
  };

  return (
    <aside className="detail" aria-label="Ficha del marcador">
      <div className="d-bar">
        <span className="mono">{isPrompt ? 'Prompt' : SOURCE_LABEL[b.source]} · guardado el {fmtDate(b.created_at)}</span>
        <button className="icon-btn" onClick={onClose} aria-label="Cerrar ficha">✕</button>
      </div>
      {isFile && file ? (
        <>
          {isImage(file.type) && (image || fileUrl)
            // eslint-disable-next-line @next/next/no-img-element
            ? <img className="detail-img" src={image ?? fileUrl!} alt={b.title} />
            : <div className={`shot-doc t-${b.source}`} style={{ borderRadius: 10 }}><span>{file.name.split('.').pop()?.toUpperCase()}</span></div>}
          <div className="row">
            <span className="mono">{file.name} · {file.width ? `${file.width}×${file.height} px · ` : ''}{fmtSize(file.size)}</span>
            {fileUrl && <a className="ghost" href={fileUrl} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 'auto' }}>Abrir</a>}
          </div>
        </>
      ) : !isPrompt && <Thumb b={b} />}
      <textarea className="d-title" id="d-title" rows={2} value={title} aria-label="Título" style={{ fieldSizing: 'content' } as React.CSSProperties}
        onChange={(e) => setTitle(e.target.value)} onBlur={() => title.trim() && title !== b.title && onUpdate({ title: title.trim() })} />
      {b.url && <a className="d-url" href={b.url} target="_blank" rel="noopener noreferrer">{b.url}</a>}

      {b.kind === 'link' && (
        <div className="field">
          <span>Estado</span>
          <div className="seg" role="group" aria-label="Estado">
            {(['pending', 'seen', 'applied'] as Status[]).map((s) => (
              <button key={s} className={b.status === s ? 'on' : ''} aria-pressed={b.status === s} onClick={() => onUpdate({ status: s })}>{STATUS_LABEL[s]}</button>
            ))}
          </div>
        </div>
      )}

      {b.source === 'repo' && Object.keys(meta).length > 0 && (
        <div className="facts">
          {meta.stars != null && <span>★ {Number(meta.stars).toLocaleString('es')}</span>}
          {typeof meta.language === 'string' && <span>{meta.language}</span>}
          {typeof meta.license === 'string' && <span>{meta.license}</span>}
          {typeof meta.pushed_at === 'string' && <span>Último cambio: {fmtDate(meta.pushed_at)}</span>}
          {meta.archived === true && <span className="bad">Archivado</span>}
        </div>
      )}
      {b.duration_seconds ? <div className="facts"><span>{b.source === 'video' ? 'Duración' : 'Lectura'}: {formatDuration(b.duration_seconds)}</span></div> : null}

      <label className="field">
        <span>Colección</span>
        <select id="d-col" value={b.collection_id ?? ''} onChange={(e) => { onUpdate({ collection_id: e.target.value || null }); toast(`Movido a ${colPath(e.target.value || null)}`); }}>
          <CollectionOptions collections={collections} colPath={colPath} />
        </select>
      </label>

      <div className="field">
        <span>Etiquetas</span>
        <TagInput id="d-tag" value={b.tags} onChange={(tags) => onUpdate({ tags })} allTags={allTags} />
      </div>

      {isPrompt && (
        <section className="d-sec">
          <h3>Prompt</h3>
          <textarea className="prompt-box" id="d-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)}
            onBlur={() => prompt !== (b.prompt_text ?? '') && onUpdate({ prompt_text: prompt })}
            placeholder="Escribe el prompt. Usa {{variable}} para las partes que cambian." />
          {variables.length > 0 && (
            <>
              <p className="mono">Rellena las variables y copia el prompt listo:</p>
              <div className="vars">
                {variables.map((v) => (
                  <label key={v} className="field"><span>{v}</span>
                    <input value={vars[v] ?? ''} onChange={(e) => setVars({ ...vars, [v]: e.target.value })} />
                  </label>
                ))}
              </div>
              <div className="prompt-preview">
                {fillPrompt(prompt, vars).split(/(\{\{[^}]+\}\})/g).map((part, i) => (part.startsWith('{{') ? <mark key={i}>{part}</mark> : part))}
              </div>
            </>
          )}
          <button className="primary" onClick={copyPrompt} style={{ alignSelf: 'flex-start' }}>Copiar prompt</button>
        </section>
      )}

      <label className="field">
        <span>Nota</span>
        <textarea id="d-note" rows={3} placeholder="Por qué lo guardaste" value={note}
          onChange={(e) => setNote(e.target.value)} onBlur={() => note !== b.note && onUpdate({ note })} />
      </label>

      {!isPrompt && (
        <section className="d-sec">
          <h3>Resumen IA</h3>
        </section>
      )}
      {!isPrompt && (
        <section className="d-sec ai-box" style={{ marginTop: -8 }}>
          {summary.length ? <ul>{summary.map((p, i) => <li key={i}>{p}</li>)}</ul> : <p className="mono">Sin resumen todavía.</p>}
          <div className="row">
            <button className="ghost" onClick={() => ai('summary')} disabled={!aiEnabled || !!aiBusy}>
              {aiBusy === 'summary' ? 'Resumiendo…' : summary.length ? 'Volver a resumir' : '✦ Resumir con IA'}
            </button>
            {!isFile && <button className="ghost" onClick={() => ai('prompt')} disabled={!aiEnabled || !!aiBusy} title="Extrae el prompt del contenido y lo deja listo con {{variables}}">
              {aiBusy === 'prompt' ? 'Extrayendo…' : '✦ Convertir en prompt'}
            </button>}
          </div>
          {!aiEnabled && <p className="mono">Añade GROQ_API_KEY en Vercel para usar la IA.</p>}
        </section>
      )}

      {(b.kind === 'link' || (isFile && b.content_fetched_at)) && (
        <section className="d-sec">
          <h3>{isFile ? 'Texto del documento' : 'Copia guardada'}</h3>
          {b.content_fetched_at ? (
            <p className="mono">{isFile ? 'Texto extraído al subirlo: se usa para buscar y resumir.' : `Copiada el ${fmtDate(b.content_fetched_at)}. Si el link deja de funcionar, el texto sigue aquí.`}</p>
          ) : (
            <p className="mono">Todavía no hay copia del contenido.</p>
          )}
          {content !== undefined && (content ? <div className="copy-box">{content}</div> : <p className="mono">La copia está vacía.</p>)}
          <div className="row">
            {b.content_fetched_at && content === undefined && <button className="ghost" onClick={showCopy} disabled={loadingCopy}>Ver copia</button>}
            {b.url && !isFile && <button className="ghost" onClick={refreshCopy} disabled={loadingCopy}>{loadingCopy ? 'Leyendo…' : b.content_fetched_at ? 'Actualizar copia' : 'Guardar copia ahora'}</button>}
          </div>
        </section>
      )}

      <section className="d-sec">
        <h3>Highlights · {b.highlights.length}</h3>
        {b.highlights.map((h) => (
          <div key={h.id} className={`hl ${h.color}`}>
            {h.time_label && <a className="ts" href={timeLink(h.time_label)} target="_blank" rel="noopener noreferrer" title="Abrir en ese minuto">▶ {h.time_label}</a>}
            <span className="txt">{h.text}</span>
            {h.note && <span className="hn">{h.note}</span>}
            <button className="x" onClick={() => onRemoveHighlight(h.id)} aria-label="Borrar highlight">×</button>
          </div>
        ))}
        <form className="hl-form" onSubmit={saveHighlight}>
          <textarea id="hl-text" rows={2} placeholder="Pega aquí el fragmento que quieres guardar" aria-label="Fragmento"
            value={hl.text} onChange={(e) => setHl({ ...hl, text: e.target.value })} />
          <input id="hl-note" placeholder="Nota (opcional)" aria-label="Nota del highlight" value={hl.note} onChange={(e) => setHl({ ...hl, note: e.target.value })} />
          <div className="row">
            <span className="sw" role="radiogroup" aria-label="Color">
              {COLORS.map(([k, l]) => (
                <span key={k}>
                  <input type="radio" name="hlc" id={`hlc-${k}`} value={k} checked={hl.color === k} onChange={() => setHl({ ...hl, color: k })} />
                  <label htmlFor={`hlc-${k}`} title={l} style={{ background: `var(--hl-${k})` }}><span hidden>{l}</span></label>
                </span>
              ))}
            </span>
            {b.source === 'video' && (
              <input id="hl-t" className="t-in" placeholder="mm:ss" aria-label="Minuto del vídeo" value={hl.time} onChange={(e) => setHl({ ...hl, time: e.target.value })} />
            )}
            <button className="primary" type="submit" style={{ marginLeft: 'auto' }}>Guardar highlight</button>
          </div>
        </form>
      </section>

      <div className="danger">
        {confirmDel ? (
          <>
            <span>¿Eliminar este {isPrompt ? 'prompt' : 'marcador'}?</span>
            <button className="ghost del solid" onClick={onDelete}>Eliminar</button>
            <button className="ghost" onClick={() => setConfirmDel(false)}>Cancelar</button>
          </>
        ) : (
          <>
            <button className="ghost del" onClick={() => setConfirmDel(true)}>Eliminar {isPrompt ? 'prompt' : 'marcador'}</button>
            {b.is_broken && b.url && <a href={`https://web.archive.org/web/*/${b.url}`} target="_blank" rel="noopener noreferrer">Buscar en archive.org</a>}
          </>
        )}
      </div>
    </aside>
  );
}

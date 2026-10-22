'use client';

import { useRef, useState } from 'react';
import { fileMeta, type Bookmark } from '@/lib/types';
import { fmtDate } from '@/lib/format';
import { fmtSize, isImage } from '@/lib/files';

/** Galería de capturas, imágenes y documentos subidos. */
export function FilesGallery({ items, fileUrls, colPath, onOpen, onUpload }: {
  items: Bookmark[];
  fileUrls: Record<string, string>;
  colPath: (id: string | null) => string;
  onOpen: (id: string) => void;
  onUpload: (file: File) => void;
}) {
  const [filter, setFilter] = useState<'all' | 'img' | 'doc'>('all');
  const input = useRef<HTMLInputElement>(null);
  const shown = items.filter((b) => {
    const f = fileMeta(b);
    if (!f || filter === 'all') return true;
    return filter === 'img' ? isImage(f.type) : !isImage(f.type);
  });

  return (
    <>
      <div className="drop">
        <span>
          <b>Pega una captura</b> con <kbd>Ctrl</kbd>+<kbd>V</kbd> (por ejemplo después de <kbd>Win</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>) o <b>arrastra</b> una imagen, un PDF o cualquier archivo a la ventana.
          Las imágenes se recortan antes de guardar. Desde la extensión: clic derecho → «Capturar zona de la página».
        </span>
        <span className="acts">
          <div className="seg" role="group" aria-label="Tipo">
            {([['all', 'Todo'], ['img', 'Imágenes'], ['doc', 'Documentos']] as const).map(([k, l]) => (
              <button key={k} className={filter === k ? 'on' : ''} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
            ))}
          </div>
          <button className="primary" onClick={() => input.current?.click()}>Subir archivo</button>
          <input ref={input} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ''; }} />
        </span>
      </div>
      {shown.length ? (
        <div className="gallery">
          {shown.map((b) => {
            const f = fileMeta(b);
            const url = f ? fileUrls[f.path] : undefined;
            return (
              <article key={b.id} className="shot" tabIndex={0} onClick={() => onOpen(b.id)} onKeyDown={(e) => e.key === 'Enter' && onOpen(b.id)}>
                {f && isImage(f.type)
                  // eslint-disable-next-line @next/next/no-img-element
                  ? (url ? <img src={url} alt={b.title} loading="lazy" style={{ aspectRatio: f.width && f.height ? `${f.width} / ${f.height}` : undefined }} /> : <div className="shot-ph" style={{ aspectRatio: f.width && f.height ? `${f.width} / ${f.height}` : '16 / 10' }} />)
                  : <div className={`shot-doc t-${b.source}`}><span>{(f?.name.split('.').pop() ?? 'archivo').toUpperCase()}</span></div>}
                <div className="body">
                  <span className="kind">{f ? `${isImage(f.type) ? 'Imagen' : f.type === 'application/pdf' ? 'PDF' : 'Archivo'} · ${f.width ? `${f.width}×${f.height} · ` : ''}${fmtSize(f.size)}` : 'Archivo'}</span>
                  <h3 className="ttl">{b.title}</h3>
                  {b.note && <p className="note">{b.note}</p>}
                  {b.tags.length > 0 && <div className="tags">{b.tags.map((t) => <span key={t} className="tag">#{t}</span>)}</div>}
                  <div className="meta"><span>{colPath(b.collection_id)}</span>{b.domain && <span>{b.domain}</span>}<span suppressHydrationWarning>{fmtDate(b.created_at)}</span></div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty">{items.length ? 'Nada de este tipo todavía.' : 'Todavía no hay capturas ni archivos. Pega una imagen con Ctrl+V para empezar.'}</div>
      )}
    </>
  );
}

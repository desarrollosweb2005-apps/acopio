'use client';

import { useRef } from 'react';
import { fileMeta, type Bookmark } from '@/lib/types';
import { fmtDate } from '@/lib/format';
import { fmtSize, isImage } from '@/lib/files';
import type { GroupMode } from '@/lib/dates';
import { DateGroups, TagLink } from './Filters';
import { imagePath } from '@/lib/cover';

/** Galería de capturas, imágenes y documentos subidos. */
export function FilesGallery({ items, group, groupDir, filtered, fileUrls, colPath, onOpen, onUpload, onTag }: {
  items: Bookmark[];
  group: GroupMode;
  groupDir: 'asc' | 'desc';
  filtered: boolean;
  onTag: (t: string) => void;
  fileUrls: Record<string, string>;
  colPath: (id: string | null) => string;
  onOpen: (id: string) => void;
  onUpload: (file: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <>
      <div className="drop">
        <span>
          <b>Pega una captura</b> con <kbd>Ctrl</kbd>+<kbd>V</kbd> (por ejemplo después de <kbd>Win</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>) o <b>arrastra</b> una imagen, un PDF o cualquier archivo a la ventana.
          Las imágenes se recortan antes de guardar. Desde la extensión: clic derecho → «Capturar zona de la página».
        </span>
        <span className="acts">
          <button className="primary" onClick={() => input.current?.click()}>Subir archivo</button>
          <input ref={input} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ''; }} />
        </span>
      </div>
      {items.length ? (
        <DateGroups key={group} items={items} mode={group} dir={groupDir} render={(shown) => (
        <div className="gallery">
          {shown.map((b) => {
            const f = fileMeta(b);
            const url = fileUrls[imagePath(b) ?? ''];
            const cover = f && !isImage(f.type) && url;
            return (
              <article key={b.id} className="shot" tabIndex={0} onClick={() => onOpen(b.id)} onKeyDown={(e) => e.key === 'Enter' && onOpen(b.id)}>
                {cover
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={url} alt={b.title} loading="lazy" />
                  : f && isImage(f.type)
                  // eslint-disable-next-line @next/next/no-img-element
                  ? (url ? <img src={url} alt={b.title} loading="lazy" style={{ aspectRatio: f.width && f.height ? `${f.width} / ${f.height}` : undefined }} /> : <div className="shot-ph" style={{ aspectRatio: f.width && f.height ? `${f.width} / ${f.height}` : '16 / 10' }} />)
                  : <div className={`shot-doc t-${b.source}`}><span>{(f?.name.split('.').pop() ?? 'archivo').toUpperCase()}</span></div>}
                <div className="body">
                  <span className="kind">{f ? `${isImage(f.type) ? 'Imagen' : f.type === 'application/pdf' ? 'PDF' : 'Archivo'} · ${f.width ? `${f.width}×${f.height} · ` : ''}${fmtSize(f.size)}` : 'Archivo'}</span>
                  <h3 className="ttl">{b.title}</h3>
                  {b.note && <p className="note">{b.note}</p>}
                  {b.tags.length > 0 && <div className="tags">{b.tags.map((t) => <TagLink key={t} t={t} onTag={onTag} />)}</div>}
                  <div className="meta"><span>{colPath(b.collection_id)}</span>{b.domain && <span>{b.domain}</span>}<span suppressHydrationWarning>{fmtDate(b.created_at)}</span></div>
                </div>
              </article>
            );
          })}
        </div>
        )} />
      ) : (
        <div className="empty">{filtered ? 'Nada coincide con la búsqueda o los filtros.' : 'Todavía no hay capturas ni archivos. Pega una imagen con Ctrl+V para empezar.'}</div>
      )}
    </>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Collection } from '@/lib/types';
import { fmtSize, isImage, loadImage, pdfText, sourceForType, uploadToStorage } from '@/lib/files';
import { domainOf } from '@/lib/url';
import { CollectionOptions } from './CollectionOptions';
import { TagInput } from './TagInput';

export interface UploadInput {
  /** Archivo subido, pegado o arrastrado */
  file?: File;
  /** Imagen como data URL (captura de la extensión) */
  dataUrl?: string;
  sourceUrl?: string;
  title?: string;
}

interface Rect { x: number; y: number; w: number; h: number }
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const MAX_W = 2400;

/** Recortar una imagen con un recuadro ajustable (o subir un archivo) y guardarlo como marcador. */
export function UploadDialog({ input, supabase, collections, colPath, allTags, defaultCollection, onClose, onInsert }: {
  input: UploadInput;
  supabase: SupabaseClient;
  collections: Collection[];
  colPath: (id: string | null) => string;
  allTags: [string, number][];
  defaultCollection: string | null;
  onClose: () => void;
  onInsert: (row: Record<string, unknown>) => Promise<boolean>;
}) {
  const type = input.file?.type || (input.dataUrl ? 'image/png' : 'application/octet-stream');
  const image = isImage(type);
  const [src, setSrc] = useState<string | null>(input.dataUrl ?? null);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [rect, setRect] = useState<Rect>({ x: 0.04, y: 0.04, w: 0.92, h: 0.92 });
  const [title, setTitle] = useState(input.title ?? input.file?.name.replace(/\.[a-z0-9]{1,8}$/i, '') ?? '');
  const [sourceUrl, setSourceUrl] = useState(input.sourceUrl ?? '');
  const [collectionId, setCollectionId] = useState(defaultCollection ?? '');
  const [tags, setTags] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const stage = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const drag = useRef<null | { h: string; px: number; py: number; start: Rect; R: DOMRect }>(null);

  useEffect(() => {
    if (image && input.file && !input.dataUrl) {
      const url = URL.createObjectURL(input.file);
      setSrc(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [image, input.file, input.dataUrl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  /* ---------- Recuadro: mover, estirar desde los tiradores o dibujar uno nuevo ---------- */
  function onPointerDown(e: React.PointerEvent) {
    if (!stage.current) return;
    e.preventDefault();
    const R = stage.current.getBoundingClientRect();
    const t = e.target as HTMLElement;
    drag.current = {
      R, start: rect, px: (e.clientX - R.left) / R.width, py: (e.clientY - R.top) / R.height,
      h: t.dataset.h ?? (t.closest('.crop-box') ? 'move' : 'new'),
    };
    stage.current.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const MIN = 0.03;
    const cx = clamp((e.clientX - d.R.left) / d.R.width, 0, 1);
    const cy = clamp((e.clientY - d.R.top) / d.R.height, 0, 1);
    const dx = cx - d.px, dy = cy - d.py;
    let { x, y, w, h } = d.start;
    if (d.h === 'new') {
      w = Math.max(MIN, Math.abs(cx - d.px)); h = Math.max(MIN, Math.abs(cy - d.py));
      x = Math.min(Math.min(d.px, cx), 1 - w); y = Math.min(Math.min(d.py, cy), 1 - h);
    } else if (d.h === 'move') {
      x = clamp(x + dx, 0, 1 - w); y = clamp(y + dy, 0, 1 - h);
    } else {
      if (d.h.includes('w')) { const nx = clamp(x + dx, 0, x + w - MIN); w += x - nx; x = nx; }
      if (d.h.includes('e')) w = clamp(w + dx, MIN, 1 - x);
      if (d.h.includes('n')) { const ny = clamp(y + dy, 0, y + h - MIN); h += y - ny; y = ny; }
      if (d.h.includes('s')) h = clamp(h + dy, MIN, 1 - y);
    }
    setRect({ x, y, w, h });
  }
  const onPointerUp = () => { drag.current = null; };

  /* ---------- Guardar ---------- */
  async function cropToBlob(): Promise<{ blob: Blob; width: number; height: number }> {
    const img = imgRef.current ?? (await loadImage(src!));
    const nw = img.naturalWidth, nh = img.naturalHeight;
    const full = rect.x < 0.002 && rect.y < 0.002 && rect.w > 0.996 && rect.h > 0.996;
    // Imagen entera y ya comprimida (foto JPG/WebP): se sube el original
    if (full && input.file && /jpe?g|webp/.test(input.file.type) && nw <= MAX_W) return { blob: input.file, width: nw, height: nh };
    const sx = Math.round(rect.x * nw), sy = Math.round(rect.y * nh);
    const sw = Math.max(1, Math.round(rect.w * nw)), sh = Math.max(1, Math.round(rect.h * nh));
    const k = Math.min(1, MAX_W / sw);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(sw * k);
    canvas.height = Math.round(sh * k);
    canvas.getContext('2d')!.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo recortar'))), 'image/png'));
    return { blob, width: canvas.width, height: canvas.height };
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      let meta;
      let content = '';
      if (image) {
        setBusy('Recortando…');
        const { blob, width, height } = await cropToBlob();
        setBusy('Subiendo…');
        const name = `${(title || 'captura').slice(0, 60)}.${blob.type === 'image/png' ? 'png' : input.file?.name.split('.').pop()}`;
        meta = await uploadToStorage(supabase, blob, name, { width, height });
      } else {
        const file = input.file!;
        if (file.type === 'application/pdf') { setBusy('Leyendo el PDF…'); content = await pdfText(file); }
        setBusy('Subiendo…');
        meta = await uploadToStorage(supabase, file, file.name);
      }
      setBusy('Guardando…');
      const url = sourceUrl.trim();
      const removeUpload = () => supabase.storage.from('files').remove([meta.path]);
      const ok = await onInsert({
        kind: 'file', source: sourceForType(meta.type), status: 'seen',
        title: title.trim() || meta.name, note: note.trim(), tags, collection_id: collectionId || null,
        url: url || null, url_norm: null, domain: url ? domainOf(url) : null,
        excerpt: content ? content.slice(0, 280) : '', content: content || null,
        content_fetched_at: content ? new Date().toISOString() : null, meta: { file: meta },
      }).catch(async (err) => { await removeUpload(); throw err; });
      if (!ok) {
        // La fila no se pudo crear: no dejar el archivo huérfano
        await removeUpload();
        setBusy('');
      }
    } catch (err) {
      setBusy('');
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
    }
  }

  const px = (r: number, n: number) => Math.round(r * n);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form className="modal" style={{ width: image ? 'min(900px, 100%)' : undefined }} onSubmit={save}>
        <h2>{image ? 'Guardar captura' : 'Guardar archivo'}</h2>
        {image && src ? (
          <>
            <p className="mono">Arrastra el recuadro o sus tiradores, o dibuja uno nuevo sobre la imagen. Solo se guarda lo que queda dentro.</p>
            <div className="crop-wrap">
              <div className="crop-stage" ref={stage} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img ref={imgRef} src={src} alt="Imagen a recortar" onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />
                <div className={`crop-box ${rect.y < 0.1 ? 'near-top' : ''}`} style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` }}>
                  {HANDLES.map((h) => <span key={h} className={`h ${h}`} data-h={h} />)}
                  {natural.w > 0 && <span className="crop-dim">{px(rect.w, natural.w)} × {px(rect.h, natural.h)} px</span>}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="preview">
            <div className="row">
              <span className={`c-ic c-${sourceForType(type)}`} aria-hidden="true">{type === 'application/pdf' ? 'P' : 'A'}</span>
              <b>{input.file?.name}</b>
              <span className="mono">{input.file && fmtSize(input.file.size)}</span>
            </div>
            {type === 'application/pdf' && <p className="mono">Se guarda también el texto del PDF para poder buscarlo y resumirlo con IA.</p>}
          </div>
        )}
        <div className="form-grid">
          <label className="field"><span>Título</span>
            <input id="up-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Qué es" />
          </label>
          <label className="field"><span>Web de origen (opcional)</span>
            <input id="up-url" type="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://" />
          </label>
          <label className="field"><span>Colección</span>
            <select id="up-col" value={collectionId} onChange={(e) => setCollectionId(e.target.value)}>
              <CollectionOptions collections={collections} colPath={colPath} />
            </select>
          </label>
          <div className="field"><span>Etiquetas</span>
            <TagInput id="up-tags" value={tags} onChange={setTags} allTags={allTags} />
          </div>
          <label className="field full"><span>Nota</span>
            <input id="up-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opcional" />
          </label>
        </div>
        {error && <div className="error">{error}</div>}
        <div className="modal-actions">
          {image && <button type="button" className="ghost" style={{ marginRight: 'auto' }} onClick={() => setRect({ x: 0, y: 0, w: 1, h: 1 })}>Imagen completa</button>}
          <button type="button" className="ghost" onClick={onClose} disabled={!!busy}>Cancelar</button>
          <button className="primary" type="submit" disabled={!!busy || (image && !src)}>{busy || (image ? 'Guardar captura' : 'Guardar archivo')}</button>
        </div>
      </form>
    </div>
  );
}

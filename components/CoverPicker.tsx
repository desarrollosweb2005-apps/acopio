'use client';

import { useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fileMeta, type Bookmark, type Snapshot } from '@/lib/types';
import { blobToCover, coverPath, pdfFirstPage, removeStored, uploadCover } from '@/lib/cover';
import { screenshotUrl } from '@/lib/url';

/** Cambiar la portada de un marcador: subir o pegar una imagen, sacarla del link, del PDF o buscarla en Google. */
export function CoverPicker({ b, fileUrl, supabase, toast, onUpdate }: {
  b: Bookmark;
  /** Enlace firmado del archivo (para sacar la primera página del PDF) */
  fileUrl: string | null;
  supabase: SupabaseClient;
  toast: (m: string) => void;
  onUpdate: (patch: Partial<Bookmark>) => void;
}) {
  const [busy, setBusy] = useState('');
  const [cands, setCands] = useState<string[] | null>(null);
  const [addr, setAddr] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const file = fileMeta(b);
  const isPdf = file?.type === 'application/pdf';
  const old = coverPath(b);
  const hasCover = !!(old || b.cover_url);

  const withoutCover = () => { const { cover: _c, ...rest } = b.meta ?? {}; return rest; };

  function applyAddress(url: string) {
    onUpdate({ cover_url: url, meta: withoutCover() });
    removeStored(supabase, [old]);
    setCands(null);
    setAddr('');
    toast('Portada cambiada');
  }

  async function applyBlob(blob: Blob | null, label: string) {
    if (!blob) { setBusy(''); return toast(`No se pudo sacar la imagen ${label}`); }
    try {
      setBusy('Subiendo…');
      const path = await uploadCover(supabase, await blobToCover(blob));
      onUpdate({ meta: { ...withoutCover(), cover: path } });
      removeStored(supabase, [old]);
      setCands(null);
      toast('Portada cambiada');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo subir la imagen');
    }
    setBusy('');
  }

  async function fromPdf() {
    if (!fileUrl) return;
    setBusy('Leyendo el PDF…');
    const pdf = await fetch(fileUrl).then((r) => r.blob()).catch(() => null);
    await applyBlob(pdf && (await pdfFirstPage(pdf)), 'del PDF');
  }

  async function fromLink() {
    if (!b.url) return;
    setBusy('Buscando…');
    const s = (await fetch('/api/snapshot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: b.url }) })
      .then((r) => r.json()).catch(() => null)) as Snapshot | null;
    const meta = (s?.meta ?? {}) as { avatar?: string; banner?: string };
    const list = [s?.cover_url, meta.banner, meta.avatar, b.source === 'web' ? screenshotUrl(b.url) : null]
      .filter((u, i, a): u is string => !!u && u !== b.cover_url && a.indexOf(u) === i);
    setBusy('');
    setCands(list);
    if (!list.length) toast('El link no tiene otras imágenes. Prueba a buscarla en Google o súbela');
  }

  function onPaste(e: React.ClipboardEvent) {
    const img = [...e.clipboardData.files].find((f) => f.type.startsWith('image/'));
    if (img) { e.preventDefault(); applyBlob(img, 'pegada'); }
  }

  function submitAddr(e: React.FormEvent) {
    e.preventDefault();
    if (/^https?:\/\/\S+$/i.test(addr.trim())) applyAddress(addr.trim());
    else toast('Pega una imagen o una dirección que empiece por https://');
  }

  return (
    <section className="d-sec cover-pick">
      <h3>Portada</h3>
      <div className="row">
        <button className="ghost" onClick={() => input.current?.click()} disabled={!!busy}>Subir imagen</button>
        {isPdf && <button className="ghost" onClick={fromPdf} disabled={!!busy || !fileUrl}>Primera página del PDF</button>}
        {b.url && <button className="ghost" onClick={fromLink} disabled={!!busy}>Buscar en el link</button>}
        <a className="ghost" href={`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(b.title)}`} target="_blank" rel="noopener noreferrer">Buscar en Google ↗</a>
        {hasCover && <button className="ghost" disabled={!!busy} onClick={() => { onUpdate({ cover_url: null, meta: withoutCover() }); removeStored(supabase, [old]); }}>Quitar</button>}
        <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) applyBlob(f, 'elegida'); e.target.value = ''; }} />
      </div>
      <form onSubmit={submitAddr}>
        <input className="paste-in" value={addr} onChange={(e) => setAddr(e.target.value)} onPaste={onPaste} disabled={!!busy}
          placeholder="Pega aquí una imagen (Ctrl+V) o su dirección y pulsa Enter" aria-label="Pegar imagen o dirección de imagen" />
      </form>
      {busy && <p className="mono">{busy}</p>}
      {cands && cands.length > 0 && (
        <div className="cands">
          {cands.map((u) => (
            <button key={u} type="button" onClick={() => applyAddress(u)} title="Usar esta imagen">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="" referrerPolicy="no-referrer" loading="lazy" />
            </button>
          ))}
        </div>
      )}
      <p className="mono">En Google: clic derecho en la imagen → «Copiar imagen» y pégala en el recuadro.</p>
    </section>
  );
}

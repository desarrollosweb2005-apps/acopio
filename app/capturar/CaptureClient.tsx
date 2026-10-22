'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Collection } from '@/lib/types';
import { UploadDialog, type UploadInput } from '@/components/UploadDialog';

interface Capture { dataUrl: string; url?: string; title?: string }
declare global { interface Window { __acopioCapture?: Capture } }

export function CaptureClient({ collections, allTags }: { collections: Collection[]; allTags: [string, number][] }) {
  const supabase = useMemo(() => createClient(), []);
  const [input, setInput] = useState<UploadInput | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // La extensión deja la captura en window.__acopioCapture y avisa con un evento
    const take = (c?: Capture) => c?.dataUrl && setInput({ dataUrl: c.dataUrl, sourceUrl: c.url, title: c.title });
    take(window.__acopioCapture);
    const onCapture = (e: Event) => take((e as CustomEvent<Capture>).detail);
    const onPaste = (e: ClipboardEvent) => { const file = e.clipboardData?.files[0]; if (file) setInput({ file }); };
    window.addEventListener('acopio:capture', onCapture);
    document.addEventListener('paste', onPaste);
    return () => { window.removeEventListener('acopio:capture', onCapture); document.removeEventListener('paste', onPaste); };
  }, []);

  const byId = new Map(collections.map((c) => [c.id, c]));
  const colPath = (id: string | null) => {
    const c = id ? byId.get(id) : undefined;
    if (!c) return 'Bandeja';
    const p = c.parent_id ? byId.get(c.parent_id) : undefined;
    return p ? `${p.name} › ${c.name}` : c.name;
  };

  if (done) return <div className="card"><h1>Captura guardada ✓</h1><p>La tienes en Capturas y archivos.</p></div>;
  if (!input) {
    return (
      <div className="card">
        <h1>Esperando la captura…</h1>
        <p>Usa «Capturar zona de la página» desde la extensión, o pega aquí una imagen con <kbd>Ctrl</kbd>+<kbd>V</kbd>.</p>
      </div>
    );
  }
  return (
    <UploadDialog
      input={input}
      supabase={supabase}
      collections={collections}
      colPath={colPath}
      allTags={allTags}
      defaultCollection={null}
      onClose={() => { location.hash = 'acopio-cancel'; setInput(null); }}
      onInsert={async (row) => {
        const { error } = await supabase.from('bookmarks').insert(row);
        if (error) throw new Error(`No se pudo guardar: ${error.message}`);
        setDone(true);
        window.setTimeout(() => { location.hash = 'acopio-saved'; }, 500);
        return true;
      }}
    />
  );
}

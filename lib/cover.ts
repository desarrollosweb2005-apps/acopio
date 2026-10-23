import type { SupabaseClient } from '@supabase/supabase-js';
import { BUCKET, isImage, uploadToStorage } from './files';
import { fileMeta, type Bookmark } from './types';

/** Portada propia (subida por el usuario o sacada del PDF), guardada en el almacenamiento: meta.cover = ruta. */
export const coverPath = (b: { meta?: Record<string, unknown> | null }) =>
  (typeof b.meta?.cover === 'string' ? b.meta.cover : null);

/** Rutas del almacenamiento que se ven como imagen en la lista: la portada propia o la captura. */
export function imagePath(b: Bookmark) {
  const f = fileMeta(b);
  return coverPath(b) ?? (f && isImage(f.type) ? f.path : null);
}

/** Reduce la imagen a un tamaño de portada (máx. 960 px de ancho) en JPEG. */
export async function shrinkToCover(source: CanvasImageSource & { width: number; height: number }, maxW = 960): Promise<Blob> {
  const k = Math.min(1, maxW / source.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.width * k));
  canvas.height = Math.max(1, Math.round(source.height * k));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo preparar la imagen'))), 'image/jpeg', 0.85));
}

export async function blobToCover(blob: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(blob);
  try { return await shrinkToCover(bmp); } finally { bmp.close(); }
}

/** Primera página del PDF como imagen (para usarla de portada). */
export async function pdfFirstPage(file: Blob): Promise<Blob | null> {
  try {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(2, 960 / base.width) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
    return await shrinkToCover(canvas);
  } catch {
    return null;
  }
}

export async function uploadCover(supabase: SupabaseClient, blob: Blob): Promise<string> {
  return (await uploadToStorage(supabase, blob, 'portada.jpg')).path;
}

export const removeStored = (supabase: SupabaseClient, paths: (string | null | undefined)[]) => {
  const p = paths.filter(Boolean) as string[];
  return p.length ? supabase.storage.from(BUCKET).remove(p) : Promise.resolve();
};

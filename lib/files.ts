import type { SupabaseClient } from '@supabase/supabase-js';
import type { FileMeta, Source } from './types';

export const BUCKET = 'files';
export const MAX_BYTES = 50 * 1024 * 1024;

export const isImage = (type: string) => type.startsWith('image/');
export const sourceForType = (type: string): Source => (isImage(type) ? 'image' : type === 'application/pdf' ? 'pdf' : 'file');

export function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const extOf = (name: string, type: string) =>
  (name.match(/\.([a-z0-9]{1,8})$/i)?.[1] ?? type.split('/')[1]?.replace(/[^a-z0-9]/gi, '') ?? 'bin').toLowerCase();

/** Sube el archivo a la carpeta del usuario y devuelve sus datos para meta.file. */
export async function uploadToStorage(supabase: SupabaseClient, blob: Blob, name: string, extra: Partial<FileMeta> = {}): Promise<FileMeta> {
  if (blob.size > MAX_BYTES) throw new Error(`El archivo pesa ${fmtSize(blob.size)}; el máximo es 50 MB.`);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('La sesión caducó. Vuelve a entrar.');
  const path = `${user.id}/${crypto.randomUUID()}.${extOf(name, blob.type)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || 'application/octet-stream' });
  if (error) {
    throw new Error(/bucket not found/i.test(error.message)
      ? 'Falta preparar el almacenamiento: ejecuta supabase/migrations/0002_files.sql en el SQL Editor de Supabase.'
      : `No se pudo subir: ${error.message}`);
  }
  return { path, type: blob.type || 'application/octet-stream', size: blob.size, name, ...extra };
}

/** Texto de un PDF (para buscar y resumir con IA). Se lee en el navegador, hasta 40 páginas. */
export async function pdfText(file: Blob): Promise<string> {
  try {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= Math.min(doc.numPages, 40); i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map((it) => ('str' in it ? it.str : '')).join(' '));
    }
    return pages.join('\n\n').replace(/[ \t]+/g, ' ').trim().slice(0, 60_000);
  } catch {
    return '';
  }
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo abrir la imagen'));
    img.src = src;
  });
}

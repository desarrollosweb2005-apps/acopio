import type { Status } from './types';
import { cleanTag } from './format';
import { domainOf, normalizeUrl, sourceOf } from './url';

/** Una fila del export CSV de Raindrop (columnas en minúsculas). */
export interface RaindropRow {
  title?: string; note?: string; excerpt?: string; url?: string; folder?: string; tags?: string;
  created?: string; cover?: string; highlights?: string; favorite?: string;
}

// Portada genérica que Raindrop pone a casi todos los posts de X: mejor sin portada
const GENERIC_COVERS = [/abs\.twimg\.com\/rweb\/ssr\/default/];

export function splitTags(s?: string) {
  return (s ?? '').split(',').map(cleanTag).filter(Boolean);
}

/** Raindrop exporta los highlights como texto ("Highlight:… Note:…"); cada bloque separado por línea en blanco es uno. */
export function splitHighlights(s?: string) {
  if (!s?.trim()) return [];
  return s.split(/\n\s*\n/).map((block) => {
    const [text, ...noteParts] = block.replace(/^\s*highlight:\s*/i, '').split(/\n\s*note:\s*/i);
    return { text: text.trim(), note: noteParts.join(' ').trim(), color: 'y' as const };
  }).filter((h) => h.text);
}

/**
 * Raindrop guarda el título tal cual lo da la pestaña: «(2) zero on X: "…" / X», con entidades HTML
 * y a veces solo «(2) X». Lo limpia y, si no queda nada útil, usa la nota o el extracto.
 */
export function cleanTitle(r: RaindropRow, url: string) {
  let t = decodeEntities(r.title ?? '').trim()
    .replace(/^\(\d+\)\s*/, '')          // contador de notificaciones
    .replace(/\s*\/\s*X$/, '')           // sufijo « / X»
    .replace(/\s+-\s+YouTube$/, '');     // sufijo « - YouTube»
  // «autor on X: "texto"» → «autor en X: texto»
  const onX = t.match(/^(.+?) on X: "([\s\S]*)"$/);
  if (onX) t = `${onX[1]} en X: ${onX[2]}`;
  t = t.replace(/\s+/g, ' ').trim();
  if (!t || /^x$/i.test(t)) {
    const fallback = [r.note, r.excerpt].map((s) => s?.split('\n').find((l) => l.trim())?.trim()).find(Boolean);
    t = fallback ?? domainOf(url);
  }
  return t.length > 160 ? t.slice(0, 159).trimEnd() + '…' : t;
}

export function rowToBookmark(r: RaindropRow, opts: { status: Status; collection_id: string | null }) {
  const url = r.url!.trim();
  const tags = splitTags(r.tags);
  if (/^true$/i.test(r.favorite ?? '')) tags.push('destacado');
  const created = r.created && !isNaN(Date.parse(r.created)) ? new Date(r.created).toISOString() : undefined;
  const cover = r.cover?.trim();
  const excerpt = decodeEntities(r.excerpt ?? '').trim();
  return {
    kind: 'link' as const,
    status: opts.status,
    url,
    url_norm: normalizeUrl(url),
    domain: domainOf(url),
    source: sourceOf(url),
    title: cleanTitle(r, url),
    note: r.note?.trim() ?? '',
    excerpt: excerpt.length > 600 ? excerpt.slice(0, 599) + '…' : excerpt,
    // El extracto de Raindrop sirve de copia inicial del contenido (en posts de X suele ser el texto entero)
    content: excerpt || null,
    content_fetched_at: excerpt ? created ?? new Date().toISOString() : null,
    cover_url: cover && !GENERIC_COVERS.some((re) => re.test(cover)) ? cover : null,
    tags: [...new Set(tags)],
    collection_id: opts.collection_id,
    meta: { imported_from: 'raindrop' },
    ...(created ? { created_at: created } : {}),
  };
}

function decodeEntities(s: string) {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}

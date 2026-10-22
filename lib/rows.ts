import type { Bookmark, Snapshot, Status } from './types';

/** Convierte la lectura de un link en la fila que se inserta en `bookmarks`. */
export function snapshotToRow(
  s: Snapshot,
  extra: { title?: string; collection_id?: string | null; tags?: string[]; status?: Status; note?: string },
) {
  return {
    kind: 'link' as const,
    url: s.url,
    url_norm: s.url_norm,
    domain: s.domain,
    source: s.source,
    title: extra.title?.trim() || s.title || s.domain,
    note: extra.note ?? '',
    excerpt: s.excerpt,
    cover_url: s.cover_url,
    content: s.content,
    content_fetched_at: s.content ? new Date().toISOString() : null,
    duration_seconds: s.duration_seconds,
    meta: s.meta,
    collection_id: extra.collection_id ?? null,
    tags: extra.tags ?? [],
    status: extra.status ?? 'pending',
  };
}

export function bookmarkHaystack(b: Bookmark, collectionName: string) {
  return [
    b.title, b.note, b.excerpt, b.domain, b.prompt_text, b.tags.join(' '), collectionName,
    ...(((b.meta ?? {}) as { summary?: string[] }).summary ?? []),
    ...b.highlights.map((h) => `${h.text} ${h.note}`),
  ].join(' ');
}

import type { Collection } from '@/lib/types';

/** Opciones de <select> con todas las colecciones, padres seguidos de sus hijas. */
export function CollectionOptions({ collections, colPath }: { collections: Collection[]; colPath: (id: string | null) => string }) {
  const ids = new Set(collections.map((c) => c.id));
  const roots = collections.filter((c) => !c.parent_id || !ids.has(c.parent_id));
  return (
    <>
      <option value="">📥 Bandeja (sin colección)</option>
      {roots.flatMap((r) => [r, ...collections.filter((c) => c.parent_id === r.id)]).map((c) => (
        <option key={c.id} value={c.id}>{c.icon} {colPath(c.id)}</option>
      ))}
    </>
  );
}

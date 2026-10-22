import { createClient } from '@/lib/supabase/server';
import type { Collection } from '@/lib/types';
import { CaptureClient } from './CaptureClient';

export const metadata = { title: 'Capturar · Acopio' };
export const dynamic = 'force-dynamic';

/** Destino de «Capturar zona de la página» de la extensión: recibe la captura y abre el recorte. */
export default async function CapturePage() {
  const supabase = await createClient();
  const [{ data: collections }, { data: tagRows }] = await Promise.all([
    supabase.from('collections').select('id,parent_id,name,icon,position').order('position').order('name'),
    supabase.from('bookmarks').select('tags'),
  ]);
  const counts = new Map<string, number>();
  (tagRows ?? []).forEach((r) => (r.tags as string[]).forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)));
  return (
    <main className="page">
      <div className="page-inner">
        <span className="logo"><i aria-hidden="true" />Acopio</span>
        <CaptureClient collections={(collections ?? []) as Collection[]} allTags={[...counts].sort((a, b) => b[1] - a[1])} />
      </div>
    </main>
  );
}

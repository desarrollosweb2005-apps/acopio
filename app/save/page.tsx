import { createClient } from '@/lib/supabase/server';
import type { Collection } from '@/lib/types';
import { extractUrl, normalizeUrl } from '@/lib/url';
import { QuickSave } from './QuickSave';

export const metadata = { title: 'Guardar en Acopio' };
export const dynamic = 'force-dynamic';

/**
 * Destino de la extensión, del bookmarklet (?url=&title=) y del menú Compartir del móvil
 * (Android manda a veces la URL dentro de `text`). Con ?highlight= guarda además ese texto;
 * con ?popup=1 avisa a la extensión para que cierre la ventana al terminar.
 */
export default async function SavePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const p = await searchParams;
  const url = extractUrl(p.url, p.text, p.title);
  const supabase = await createClient();
  const { data: collections } = await supabase.from('collections').select('id,parent_id,name,icon,position').order('position').order('name');
  const { data: tagRows } = await supabase.from('bookmarks').select('tags');
  const counts = new Map<string, number>();
  (tagRows ?? []).forEach((r) => (r.tags as string[]).forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)));
  const allTags = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const existing = url
    ? (await supabase.from('bookmarks').select('id,title,created_at,collection_id').eq('url_norm', normalizeUrl(url)).limit(1)).data?.[0] ?? null
    : null;
  const sharedText = p.text && p.text !== url ? p.text.replace(url ?? '', '').trim() : '';

  return (
    <main className="page">
      <div className="page-inner">
        <span className="logo"><i aria-hidden="true" />Acopio</span>
        <QuickSave url={url} titleHint={p.title ?? ''} sharedText={sharedText} highlight={p.highlight ?? ''} popup={p.popup === '1'}
          aiEnabled={!!process.env.GROQ_API_KEY} collections={(collections ?? []) as Collection[]} allTags={allTags} existing={existing} />
      </div>
    </main>
  );
}

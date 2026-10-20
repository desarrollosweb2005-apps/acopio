import { createClient } from '@/lib/supabase/server';
import { BOOKMARK_COLUMNS, type Bookmark, type Collection } from '@/lib/types';
import { Library } from '@/components/Library';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const supabase = await createClient();
  const [{ data: collections }, { data: bookmarks }] = await Promise.all([
    supabase.from('collections').select('id,parent_id,name,icon,position').order('position').order('name'),
    supabase.from('bookmarks').select(BOOKMARK_COLUMNS).order('created_at', { ascending: false }),
  ]);
  return (
    <Library
      initialCollections={(collections ?? []) as Collection[]}
      initialBookmarks={(bookmarks ?? []) as unknown as Bookmark[]}
    />
  );
}

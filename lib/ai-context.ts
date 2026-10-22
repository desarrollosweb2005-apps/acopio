import 'server-only';
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AiError } from './ai';
import { cleanTag } from './format';

export interface ColRow { id: string; name: string; icon: string; parent_id: string | null }

/** Colecciones y etiquetas existentes, para que la IA las reutilice en vez de inventar nuevas. */
export async function libraryContext(supabase: SupabaseClient) {
  const [{ data: cols }, { data: rows }] = await Promise.all([
    supabase.from('collections').select('id,name,icon,parent_id'),
    supabase.from('bookmarks').select('tags'),
  ]);
  const counts = new Map<string, number>();
  (rows ?? []).forEach((r) => (r.tags as string[]).forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)));
  const tags = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 80).map(([t]) => t);
  const collections = (cols ?? []) as ColRow[];
  const byId = new Map(collections.map((c) => [c.id, c]));
  const path = (c: ColRow) => (c.parent_id && byId.get(c.parent_id) ? `${byId.get(c.parent_id)!.name} › ${c.name}` : c.name);
  return {
    collections,
    tags,
    collectionsText: collections.length ? collections.map((c) => `- id "${c.id}": ${c.icon} ${path(c)}`).join('\n') : '(ninguna todavía)',
  };
}

export function cleanTags(list: unknown, max = 5): string[] {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map((t) => cleanTag(String(t))).filter((t) => t && t.length <= 40))].slice(0, max);
}

export function aiErrorResponse(e: unknown) {
  const msg = e instanceof AiError ? e.message : 'Error inesperado al hablar con la IA.';
  if (!(e instanceof AiError)) console.error(e);
  return NextResponse.json({ error: msg }, { status: 502 });
}

export const unauthorized = () => NextResponse.json({ error: 'Sesión no iniciada' }, { status: 401 });

export const clip = (s: string | null | undefined, n: number) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

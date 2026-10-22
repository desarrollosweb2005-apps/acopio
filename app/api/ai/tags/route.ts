import { NextResponse } from 'next/server';
import { authedClient } from '@/lib/supabase/server';
import { chatJSON } from '@/lib/ai';
import { aiErrorResponse, unauthorized } from '@/lib/ai-context';

/** Busca con IA etiquetas que significan lo mismo (idiomas, plurales, erratas, sinónimos). */
export async function POST() {
  const supabase = await authedClient();
  if (!supabase) return unauthorized();
  const { data } = await supabase.from('bookmarks').select('tags');
  const counts = new Map<string, number>();
  (data ?? []).forEach((r) => (r.tags as string[]).forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)));
  if (counts.size < 2) return NextResponse.json({ groups: [] });
  try {
    const out = await chatJSON<{ groups?: { tags?: string[]; keep?: string }[] }>(
      `Revisas las etiquetas de una biblioteca personal y encuentras las que significan lo mismo: mismo concepto en inglés y español, singular y plural, erratas o variantes de escritura. No agrupes etiquetas que solo están relacionadas (por ejemplo "techno" y "tech-house" son géneros distintos). Responde solo JSON {"groups": [{"tags": ["a", "b"], "keep": "a"}]}; "keep" es la que conviene conservar (normalmente la más usada o la más clara en español). Si no hay ninguna, devuelve {"groups": []}.`,
      [...counts].map(([t, n]) => `${t} (${n})`).join(', '),
      1500,
    );
    const groups = (out.groups ?? [])
      .map((g) => ({ tags: [...new Set((g.tags ?? []).filter((t) => counts.has(t)))], keep: g.keep ?? '' }))
      .filter((g) => g.tags.length > 1)
      .map((g) => ({ tags: g.tags, keep: g.tags.includes(g.keep) ? g.keep : g.tags.sort((a, b) => counts.get(b)! - counts.get(a)!)[0] }));
    return NextResponse.json({ groups });
  } catch (e) {
    return aiErrorResponse(e);
  }
}

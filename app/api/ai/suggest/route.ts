import { NextResponse } from 'next/server';
import { authedClient } from '@/lib/supabase/server';
import { chatJSON } from '@/lib/ai';
import { aiErrorResponse, cleanTags, clip, libraryContext, unauthorized } from '@/lib/ai-context';

/** Colección y etiquetas para un link que se está guardando. Solo propone colecciones que ya existen. */
export async function POST(request: Request) {
  const supabase = await authedClient();
  if (!supabase) return unauthorized();
  const { title, excerpt, domain, url } = await request.json();
  try {
    const ctx = await libraryContext(supabase);
    const out = await chatJSON<{ collection_id?: string | null; tags?: string[] }>(
      `Eres el asistente de una biblioteca personal de links en español. Responde solo JSON con la forma {"collection_id": string|null, "tags": string[]}.
- collection_id: el id de la colección existente que mejor encaje, o null si ninguna encaja bien.
- tags: de 2 a 4 etiquetas en minúsculas, con guiones en vez de espacios. Reutiliza las etiquetas existentes siempre que encajen.`,
      `Colecciones existentes:\n${ctx.collectionsText}\n\nEtiquetas existentes: ${ctx.tags.join(', ') || '(ninguna)'}\n\nLink:\nTítulo: ${clip(title, 300)}\nWeb: ${domain}\nURL: ${url}\nDescripción: ${clip(excerpt, 600)}`,
      600,
    );
    const valid = ctx.collections.some((c) => c.id === out.collection_id);
    return NextResponse.json({ collection_id: valid ? out.collection_id : null, tags: cleanTags(out.tags, 4) });
  } catch (e) {
    return aiErrorResponse(e);
  }
}

import { NextResponse } from 'next/server';
import { authedClient } from '@/lib/supabase/server';
import { chatJSON } from '@/lib/ai';
import { aiErrorResponse, clip, unauthorized } from '@/lib/ai-context';

/** Extrae el prompt de un post o web guardada y convierte el marcador en un prompt con {{variables}}. */
export async function POST(request: Request) {
  const supabase = await authedClient();
  if (!supabase) return unauthorized();
  const { id } = await request.json();
  const { data: b } = await supabase.from('bookmarks').select('title,excerpt,note,content,meta').eq('id', id).single();
  if (!b) return NextResponse.json({ error: 'No se encontró el marcador' }, { status: 404 });
  const text = [b.title, b.note, b.content || b.excerpt].map((s) => clip(s, 6000)).filter(Boolean).join('\n\n');
  try {
    const out = await chatJSON<{ found?: boolean; title?: string; prompt?: string }>(
      `Extraes prompts reutilizables de contenido guardado. Responde solo JSON {"found": boolean, "title": string, "prompt": string}.
- prompt: el prompt listo para pegar en un asistente de IA, en su idioma original. Las partes que el usuario debe personalizar van como variables {{nombre_en_snake_case}} en español, por ejemplo {{nombre_producto}} o {{link_landing}}. Si el texto dice "Ask me for: X, Y, Z", conviértelo en variables.
- Si el texto está cortado, reconstruye solo lo que se puede deducir sin inventar.
- title: nombre corto en español (máx. 60 caracteres) que describa para qué sirve.
- found: false si el contenido no contiene ningún prompt.`,
      text,
      1800,
    );
    if (!out.found || !out.prompt?.trim()) {
      return NextResponse.json({ error: 'No encontré un prompt en el contenido guardado de este marcador.' }, { status: 422 });
    }
    const patch = {
      kind: 'prompt',
      status: 'seen',
      prompt_text: out.prompt.trim(),
      title: clip(out.title, 80) || b.title,
      meta: { ...(b.meta ?? {}), original_title: b.title },
    };
    const { error } = await supabase.from('bookmarks').update(patch).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(patch);
  } catch (e) {
    return aiErrorResponse(e);
  }
}
